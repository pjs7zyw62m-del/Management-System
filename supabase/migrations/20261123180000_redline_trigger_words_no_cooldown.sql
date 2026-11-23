-- REDLINE trigger words: no cooldown between new receiver messages.
-- Repeating the same word in consecutive chat messages qualifies immediately.
-- Preserve one trigger entry per message, the 10–25 cent word price range,
-- $5 per UTC day room cap, receiver opt-in, private permissions and history.
-- Does not rescan any previously sent messages or modify recorded earnings.

CREATE OR REPLACE FUNCTION public.corp_redline_trigger_status(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_enabled boolean:=false;
 v_words jsonb:='[]'::jsonb;v_hits jsonb:='[]'::jsonb;
 v_total bigint:=0;v_current bigint:=0;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=p_room_id AND (owner_id=v_user OR member_id=v_user);
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_authorized'); END IF;
 SELECT coalesce(trigger_words_enabled,false) INTO v_enabled
 FROM corp_private.redline_room_features WHERE room_id=p_room_id;
 v_enabled:=coalesce(v_enabled,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('word',w.word,'price_cents',w.price_cents)
  ORDER BY w.word),'[]'::jsonb) INTO v_words
 FROM corp_private.redline_trigger_words w WHERE w.room_id=p_room_id;
 SELECT coalesce(sum(price_cents),0) INTO v_total
 FROM corp_private.redline_trigger_hits WHERE room_id=p_room_id;
 SELECT coalesce(sum(price_cents),0) INTO v_current
 FROM corp_private.redline_trigger_hits h
 WHERE h.room_id=p_room_id AND
  (v_room.current_session_started_at IS NULL OR h.recorded_at>=v_room.current_session_started_at);
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'word',h.word,'price_cents',h.price_cents,'recorded_at',h.recorded_at
  ) ORDER BY h.recorded_at DESC),'[]'::jsonb) INTO v_hits
 FROM (SELECT word,price_cents,recorded_at FROM corp_private.redline_trigger_hits
  WHERE room_id=p_room_id AND
   (v_room.current_session_started_at IS NULL OR recorded_at>=v_room.current_session_started_at)
  ORDER BY recorded_at DESC LIMIT 12) h;
 RETURN jsonb_build_object('ok',true,'room_id',p_room_id,
  'enabled',v_enabled,'words',v_words,'recent',v_hits,
  'session_total_cents',v_current,'all_time_total_cents',v_total,
  'min_price_cents',10,'max_price_cents',25,'daily_cap_cents',500,
  'one_match_per_message',true,'cooldown_seconds',0);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_trigger_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_trigger_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION corp_private.redline_trigger_on_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_room public.corp_private_photo_rooms%ROWTYPE;
 v_enabled boolean:=false;v_normalized text;
 v_word text;v_price integer;v_today bigint:=0;v_now timestamptz;
BEGIN
 -- Only new messages authored by an authenticated, verified ROOM RECEIVER
 -- can record one trigger entry. Existing messages are never retrocharged.
 IF NEW.body IS NULL OR NEW.sender_id IS DISTINCT FROM (SELECT auth.uid()) OR
  NOT (SELECT corp_private.photo_ledger_verified()) THEN RETURN NEW; END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=NEW.room_id;
 IF NOT FOUND OR NOT v_room.active OR v_room.owner_id IS DISTINCT FROM NEW.sender_id
  OR (v_room.current_session_started_at IS NOT NULL AND
      NEW.created_at<v_room.current_session_started_at) THEN RETURN NEW; END IF;
 SELECT coalesce(trigger_words_enabled,false) INTO v_enabled
 FROM corp_private.redline_room_features WHERE room_id=NEW.room_id;
 IF v_enabled IS DISTINCT FROM true THEN RETURN NEW; END IF;
 -- Room lock enforces the daily budget; consecutive matches are allowed.
 PERFORM pg_advisory_xact_lock(hashtextextended('redline-triggers:'||NEW.room_id::text,0));
 v_now:=clock_timestamp();
 SELECT coalesce(sum(price_cents),0) INTO v_today
 FROM corp_private.redline_trigger_hits
 WHERE room_id=NEW.room_id AND recorded_at>=date_trunc('day',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF v_today>=500 THEN RETURN NEW; END IF;
 v_normalized:=' '||regexp_replace(lower(NEW.body),'[^a-z0-9]+',' ','g')||' ';
 SELECT w.word,w.price_cents INTO v_word,v_price
 FROM corp_private.redline_trigger_words w
 WHERE w.room_id=NEW.room_id
   AND strpos(v_normalized,' '||w.word||' ')>0
   AND w.price_cents<=500-v_today
 ORDER BY w.price_cents DESC,w.word ASC LIMIT 1;
 IF v_word IS NULL THEN RETURN NEW; END IF;
 INSERT INTO corp_private.redline_trigger_hits(room_id,message_id,word,price_cents,recorded_at)
 VALUES(NEW.room_id,NEW.id,v_word,v_price,v_now)
 ON CONFLICT(message_id) DO NOTHING;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_trigger_on_chat() FROM PUBLIC,anon,authenticated;
-- Existing AFTER INSERT trigger (with REDLINE_ system-message exclusion)
-- stays installed; only its secured handler changes.
