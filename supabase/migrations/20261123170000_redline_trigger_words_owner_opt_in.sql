-- REDLINE opt-in, room-scoped, priced trigger words.
-- Sender sets up to 10 single words, 10..25 cents each. Receiver ALONE
-- enables/disables charging. No historical scanning, no external transfers.
-- ONE match per NEW receiver chat message, max 25 cents; no repeated match
-- for same word within 60 seconds and max $5.00 per UTC day per room.
ALTER TABLE corp_private.redline_room_features
 ADD COLUMN IF NOT EXISTS trigger_words_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS corp_private.redline_trigger_words(
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 word text NOT NULL CHECK(word=lower(word) AND word ~ '^[a-z][a-z0-9]{1,23}$'),
 price_cents integer NOT NULL CHECK(price_cents BETWEEN 10 AND 25),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,word)
);
CREATE TABLE IF NOT EXISTS corp_private.redline_trigger_hits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 message_id uuid NOT NULL UNIQUE REFERENCES public.corp_private_photo_messages(id) ON DELETE CASCADE,
 word text NOT NULL,
 price_cents integer NOT NULL CHECK(price_cents BETWEEN 10 AND 25),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS redline_trigger_hits_room_clock
 ON corp_private.redline_trigger_hits(room_id,recorded_at DESC);
ALTER TABLE corp_private.redline_trigger_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE corp_private.redline_trigger_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.redline_trigger_words FROM PUBLIC,anon,authenticated;
REVOKE ALL ON corp_private.redline_trigger_hits FROM PUBLIC,anon,authenticated;

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
  'one_match_per_message',true,'cooldown_seconds',60);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_trigger_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_trigger_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_trigger_save(
 p_room_id uuid,p_word text,p_price_cents integer DEFAULT NULL,p_delete boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;v_word text;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT v_room.active OR v_room.member_id IS DISTINCT FROM v_user THEN
  RETURN jsonb_build_object('ok',false,'reason','active_sender_only');
 END IF;
 v_word:=lower(btrim(coalesce(p_word,'')));
 IF v_word !~ '^[a-z][a-z0-9]{1,23}$' THEN
  RETURN jsonb_build_object('ok',false,'reason','use_single_word_2_to_24_letters_or_digits');
 END IF;
 IF p_delete IS TRUE THEN
  DELETE FROM corp_private.redline_trigger_words WHERE room_id=p_room_id AND word=v_word;
 ELSE
  IF p_price_cents IS NULL OR p_price_cents NOT BETWEEN 10 AND 25 THEN
   RETURN jsonb_build_object('ok',false,'reason','price_must_be_10_to_25_cents');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM corp_private.redline_trigger_words
    WHERE room_id=p_room_id AND word=v_word)
   AND (SELECT count(*) FROM corp_private.redline_trigger_words WHERE room_id=p_room_id)>=10 THEN
   RETURN jsonb_build_object('ok',false,'reason','ten_word_limit');
  END IF;
  INSERT INTO corp_private.redline_trigger_words(room_id,word,price_cents,updated_at)
  VALUES(p_room_id,v_word,p_price_cents,clock_timestamp())
  ON CONFLICT(room_id,word) DO UPDATE
   SET price_cents=excluded.price_cents,updated_at=clock_timestamp();
 END IF;
 RETURN public.corp_redline_trigger_status(p_room_id);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_trigger_save(uuid,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_trigger_save(uuid,text,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_trigger_enable(
 p_room_id uuid,p_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR p_enabled IS NULL OR
   NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT v_room.active OR v_room.owner_id IS DISTINCT FROM v_user THEN
  RETURN jsonb_build_object('ok',false,'reason','active_owner_only');
 END IF;
 INSERT INTO corp_private.redline_room_features(room_id,trigger_words_enabled)
 VALUES(p_room_id,p_enabled) ON CONFLICT(room_id) DO UPDATE
 SET trigger_words_enabled=excluded.trigger_words_enabled,updated_at=clock_timestamp();
 RETURN public.corp_redline_trigger_status(p_room_id);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_trigger_enable(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_trigger_enable(uuid,boolean) TO authenticated;

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
 -- One room lock makes cooldown and daily budget concurrency-safe.
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
   AND NOT EXISTS(
    SELECT 1 FROM corp_private.redline_trigger_hits h
    WHERE h.room_id=NEW.room_id AND h.word=w.word
     AND h.recorded_at>v_now-interval '60 seconds'
   )
 ORDER BY w.price_cents DESC,w.word ASC LIMIT 1;
 IF v_word IS NULL THEN RETURN NEW; END IF;
 INSERT INTO corp_private.redline_trigger_hits(room_id,message_id,word,price_cents,recorded_at)
 VALUES(NEW.room_id,NEW.id,v_word,v_price,v_now)
 ON CONFLICT(message_id) DO NOTHING;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_trigger_on_chat() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_trigger_chat_words ON public.corp_private_photo_messages;
CREATE TRIGGER redline_trigger_chat_words
 AFTER INSERT ON public.corp_private_photo_messages
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_trigger_on_chat();

-- Extend verified owed balances WITHOUT changing the photo/timer/bonus math.
-- Existing recorded room payments can cover a trigger balance after other
-- assigned amounts, while the receiver remains the only payment recorder.
ALTER FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 RENAME TO corp_redline_room_payment_status_without_triggers;
REVOKE ALL ON FUNCTION public.corp_redline_room_payment_status_without_triggers(uuid,boolean)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_room_payment_status(
 p_room_id uuid,p_archive boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_base jsonb;v_room public.corp_private_photo_rooms%ROWTYPE;
 v_total numeric:=0;v_credit numeric:=0;v_due numeric:=0;
 v_excess numeric:=0;v_assigned numeric:=0;v_paid numeric:=0;
BEGIN
 v_base:=public.corp_redline_room_payment_status_without_triggers(p_room_id,p_archive);
 IF v_base->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_base; END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id;
 SELECT coalesce(sum(h.price_cents),0) INTO v_total
 FROM corp_private.redline_trigger_hits h WHERE h.room_id=p_room_id AND (
   (NOT p_archive AND (v_room.current_session_started_at IS NULL
    OR h.recorded_at>=v_room.current_session_started_at)) OR
   (p_archive AND v_room.current_session_started_at IS NOT NULL
    AND h.recorded_at<v_room.current_session_started_at)
 );
 -- The existing ledger consumes room credits for photos, timers and bonuses
 -- first. Only excess credit applies to newly accumulated trigger charges.
 v_assigned:=coalesce((v_base->>'assigned_cents')::numeric,0);
 v_paid:=coalesce((v_base->>'paid_cents')::numeric,0);
 v_credit:=coalesce((v_base->>'payment_credit_cents')::numeric,0);
 v_excess:=least(v_total,greatest(v_credit-v_assigned,0));
 v_due:=greatest(v_total-v_excess,0);
 RETURN v_base||jsonb_build_object(
   'assigned_cents',v_assigned+v_total,
   'paid_cents',v_paid+v_excess,
   'remaining_cents',coalesce((v_base->>'remaining_cents')::numeric,0)+v_due,
   'trigger_assigned_cents',v_total,
   'trigger_paid_cents',v_excess,
   'trigger_owed_cents',v_due);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean) TO authenticated;
