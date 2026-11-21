-- BLACKCELL REDLINE: verified room consent and optional three-counteroffer negotiation.
-- No paid timer may start solely because a receiver clicked START.
-- Timeout acceptance requires a separate, revocable sender opt-in. Default OFF.
CREATE TABLE IF NOT EXISTS corp_private.redline_room_features(
 room_id uuid PRIMARY KEY REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 timer_requests_enabled boolean NOT NULL DEFAULT true,
 negotiation_enabled boolean NOT NULL DEFAULT true,
 sender_auto_accept boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS corp_private.redline_timer_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 photo_id uuid NOT NULL REFERENCES public.corp_private_photo_entries(id) ON DELETE CASCADE,
 rate_cents bigint NOT NULL CHECK(rate_cents BETWEEN 1 AND 100000),
 session_started_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','accepted','declined','expired','cancelled','started')),
 consent_mode text CHECK(consent_mode IN ('explicit','preauthorized_timeout')),
 responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS redline_timer_requests_room_idx
 ON corp_private.redline_timer_requests(room_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS redline_timer_request_one_pending_idx
 ON corp_private.redline_timer_requests(room_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS corp_private.redline_price_negotiations(
 photo_id uuid PRIMARY KEY REFERENCES public.corp_private_photo_entries(id) ON DELETE CASCADE,
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 original_cents bigint NOT NULL CHECK(original_cents BETWEEN 0 AND 9007199254740991),
 offer_cents bigint CHECK(offer_cents BETWEEN 0 AND 9007199254740991),
 offer_count smallint NOT NULL DEFAULT 0 CHECK(offer_count BETWEEN 0 AND 3),
 status text NOT NULL DEFAULT 'awaiting_sender'
   CHECK(status IN ('awaiting_sender','awaiting_owner','agreed','original_final')),
 session_started_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS redline_price_negotiations_room_idx
 ON corp_private.redline_price_negotiations(room_id,updated_at DESC);
ALTER TABLE corp_private.redline_room_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE corp_private.redline_timer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE corp_private.redline_price_negotiations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.redline_room_features,
 corp_private.redline_timer_requests,corp_private.redline_price_negotiations
 FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION corp_private.redline_resolve_timer_request(p_room_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 UPDATE corp_private.redline_timer_requests q
 SET status=CASE WHEN coalesce(f.sender_auto_accept,false) AND
    coalesce(f.timer_requests_enabled,true) AND r.active
    AND q.session_started_at IS NOT DISTINCT FROM r.current_session_started_at
     THEN 'accepted' ELSE 'expired' END,
     consent_mode=CASE WHEN coalesce(f.sender_auto_accept,false) AND
    coalesce(f.timer_requests_enabled,true) AND r.active
    AND q.session_started_at IS NOT DISTINCT FROM r.current_session_started_at
     THEN 'preauthorized_timeout' ELSE NULL END,
     responded_at=q.expires_at
 FROM public.corp_private_photo_rooms r
 LEFT JOIN corp_private.redline_room_features f ON f.room_id=r.id
 WHERE q.room_id=p_room_id AND q.room_id=r.id AND q.status='pending'
  AND q.expires_at<=clock_timestamp();
 UPDATE corp_private.redline_timer_requests q SET status='cancelled',
  responded_at=clock_timestamp()
 FROM public.corp_private_photo_rooms r
 LEFT JOIN corp_private.redline_room_features f ON f.room_id=r.id
 WHERE q.room_id=p_room_id AND q.room_id=r.id AND q.status IN ('pending','accepted')
 AND (NOT r.active OR NOT coalesce(f.timer_requests_enabled,true) OR
      q.session_started_at IS DISTINCT FROM r.current_session_started_at);
END;$$;
REVOKE ALL ON FUNCTION corp_private.redline_resolve_timer_request(uuid)
 FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_room_feature_status(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
v_features corp_private.redline_room_features%ROWTYPE;
BEGIN
 IF v_user IS NULL OR NOT (SELECT corp_private.photo_ledger_verified())
 THEN RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms r
  WHERE r.id=p_room_id AND (r.owner_id=v_user OR r.member_id=v_user);
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_authorized');END IF;
 SELECT * INTO v_features FROM corp_private.redline_room_features WHERE room_id=p_room_id;
 RETURN jsonb_build_object('ok',true,'room_id',p_room_id,
 'timer_requests_enabled',coalesce(v_features.timer_requests_enabled,true),
 'negotiation_enabled',coalesce(v_features.negotiation_enabled,true),
 'sender_auto_accept',coalesce(v_features.sender_auto_accept,false));
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_room_feature_status(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_room_feature_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_set_room_feature(
 p_room_id uuid,p_key text,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
BEGIN
 IF v_user IS NULL OR p_enabled IS NULL OR
  NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
  WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT v_room.active OR
  NOT (v_room.owner_id=v_user OR v_room.member_id=v_user) THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_required');END IF;
 IF p_key NOT IN ('timer_requests_enabled','negotiation_enabled','sender_auto_accept')
  OR (p_key='sender_auto_accept' AND v_room.member_id<>v_user)
  OR (p_key<>'sender_auto_accept' AND v_room.owner_id<>v_user)
 THEN RETURN jsonb_build_object('ok',false,'reason','feature_permission_denied');END IF;
 INSERT INTO corp_private.redline_room_features(room_id) VALUES(p_room_id)
  ON CONFLICT(room_id) DO NOTHING;
 IF p_key='timer_requests_enabled' THEN
  UPDATE corp_private.redline_room_features SET timer_requests_enabled=p_enabled,
   updated_at=clock_timestamp() WHERE room_id=p_room_id;
  IF NOT p_enabled THEN
   UPDATE corp_private.redline_timer_requests
    SET status='cancelled',responded_at=clock_timestamp()
    WHERE room_id=p_room_id AND status IN ('pending','accepted');
  END IF;
 ELSIF p_key='negotiation_enabled' THEN
  UPDATE corp_private.redline_room_features SET negotiation_enabled=p_enabled,
   updated_at=clock_timestamp() WHERE room_id=p_room_id;
  IF NOT p_enabled THEN
   UPDATE corp_private.redline_price_negotiations
    SET status='original_final',updated_at=clock_timestamp()
    WHERE room_id=p_room_id AND status IN ('awaiting_sender','awaiting_owner');
  END IF;
 ELSE
  UPDATE corp_private.redline_room_features SET sender_auto_accept=p_enabled,
   updated_at=clock_timestamp() WHERE room_id=p_room_id;
  IF NOT p_enabled THEN
   UPDATE corp_private.redline_timer_requests
    SET status='cancelled',responded_at=clock_timestamp()
    WHERE room_id=p_room_id AND status='accepted'
     AND consent_mode='preauthorized_timeout';
  END IF;
 END IF;
 RETURN public.corp_redline_room_feature_status(p_room_id);
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_set_room_feature(uuid,text,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_set_room_feature(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_timer_request(
 p_room_id uuid,p_photo_id uuid,p_rate_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
v_enabled boolean:=true;v_id uuid;v_time timestamptz:=clock_timestamp();
BEGIN
 IF v_user IS NULL OR p_rate_cents NOT BETWEEN 1 AND 100000 OR
  NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_and_valid_rate_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT v_room.active OR v_room.owner_id<>v_user THEN
  RETURN jsonb_build_object('ok',false,'reason','active_owner_required');END IF;
 SELECT coalesce(f.timer_requests_enabled,true) INTO v_enabled
  FROM corp_private.redline_room_features f WHERE f.room_id=p_room_id;
 IF NOT coalesce(v_enabled,true) THEN
  RETURN jsonb_build_object('ok',false,'reason','timer_requests_disabled');END IF;
 PERFORM corp_private.redline_resolve_timer_request(p_room_id);
 IF EXISTS(SELECT 1 FROM corp_private.redline_timer_requests
    WHERE room_id=p_room_id AND status='pending') THEN
  RETURN jsonb_build_object('ok',false,'reason','request_already_pending');END IF;
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers
    WHERE room_id=p_room_id AND stopped_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_current_timer_first');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.corp_private_photo_entries e WHERE
  e.id=p_photo_id AND e.room_id=p_room_id AND e.uploaded_by=v_room.member_id
   AND e.decision_status<>'rejected'
   AND (v_room.current_session_started_at IS NULL OR
    e.created_at>=v_room.current_session_started_at)) THEN
  RETURN jsonb_build_object('ok',false,'reason','photo_not_available');END IF;
 INSERT INTO corp_private.redline_timer_requests(
  room_id,photo_id,rate_cents,session_started_at,created_at,expires_at)
 VALUES(p_room_id,p_photo_id,p_rate_cents,v_room.current_session_started_at,
  v_time,v_time+interval '30 seconds') RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'request_id',v_id,
   'expires_at',v_time+interval '30 seconds','status','pending');
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_timer_request(uuid,uuid,bigint) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_timer_request(uuid,uuid,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_timer_request_status(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
 v_q corp_private.redline_timer_requests%ROWTYPE;
 v_opt_in boolean:=false;v_enabled boolean:=true;
BEGIN
 IF v_user IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
  WHERE id=p_room_id AND (owner_id=v_user OR member_id=v_user) FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_authorized');END IF;
 PERFORM corp_private.redline_resolve_timer_request(p_room_id);
 SELECT * INTO v_q FROM corp_private.redline_timer_requests
  WHERE room_id=p_room_id AND session_started_at IS NOT DISTINCT FROM
   v_room.current_session_started_at
  ORDER BY created_at DESC LIMIT 1;
 SELECT coalesce(f.sender_auto_accept,false),coalesce(f.timer_requests_enabled,true)
 INTO v_opt_in,v_enabled FROM corp_private.redline_room_features f WHERE room_id=p_room_id;
 RETURN jsonb_build_object('ok',true,'server_now',clock_timestamp(),
  'sender_auto_accept',coalesce(v_opt_in,false),
  'timer_requests_enabled',coalesce(v_enabled,true),
  'request',CASE WHEN v_q.id IS NULL THEN NULL ELSE jsonb_build_object(
   'id',v_q.id,'photo_id',v_q.photo_id,'rate_cents',v_q.rate_cents,
   'created_at',v_q.created_at,'expires_at',v_q.expires_at,'status',v_q.status,
   'consent_mode',v_q.consent_mode,'responded_at',v_q.responded_at) END);
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_timer_request_status(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_timer_request_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_timer_request_respond(
 p_request_id uuid,p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
 v_q corp_private.redline_timer_requests%ROWTYPE;
BEGIN
 IF v_user IS NULL OR p_accept IS NULL OR
   NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_sender_required');END IF;
 SELECT r.* INTO v_room FROM public.corp_private_photo_rooms r
  JOIN corp_private.redline_timer_requests q ON q.room_id=r.id
  WHERE q.id=p_request_id FOR UPDATE OF r;
 IF NOT FOUND OR NOT v_room.active OR v_room.member_id<>v_user THEN
  RETURN jsonb_build_object('ok',false,'reason','sender_room_required');END IF;
 PERFORM corp_private.redline_resolve_timer_request(v_room.id);
 SELECT * INTO v_q FROM corp_private.redline_timer_requests
  WHERE id=p_request_id AND room_id=v_room.id FOR UPDATE;
 IF NOT FOUND OR v_q.status<>'pending' OR v_q.expires_at<=clock_timestamp() THEN
  RETURN jsonb_build_object('ok',false,'reason','request_not_pending');END IF;
 UPDATE corp_private.redline_timer_requests SET
  status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
  consent_mode=CASE WHEN p_accept THEN 'explicit' ELSE NULL END,
  responded_at=clock_timestamp() WHERE id=p_request_id;
 RETURN jsonb_build_object('ok',true,'status',
  CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END);
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_timer_request_respond(uuid,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_timer_request_respond(uuid,boolean) TO authenticated;

-- The original Start RPC is also protected: no outdated client can bypass
-- sender acceptance by calling corp_redline_photo_timer_start directly.
CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_start(
 p_room_id uuid,p_photo_id uuid,p_rate_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
 v_user uuid:=(SELECT auth.uid());v_owner uuid;v_member uuid;v_active boolean;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_q corp_private.redline_timer_requests%ROWTYPE;
 v_enabled boolean:=true;v_auto boolean:=false;
 v_id uuid;v_time timestamptz:=clock_timestamp();
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR p_photo_id IS NULL
  OR p_rate_cents IS NULL OR p_rate_cents NOT BETWEEN 1 AND 100000
  OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_and_valid_rate_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR v_user<>v_room.owner_id OR NOT v_room.active THEN
  RETURN jsonb_build_object('ok',false,'reason','active_owner_room_required');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.corp_private_photo_entries e
   WHERE e.id=p_photo_id AND e.room_id=p_room_id AND e.uploaded_by=v_room.member_id
    AND e.decision_status<>'rejected') THEN
  RETURN jsonb_build_object('ok',false,'reason','photo_not_available_for_timing');END IF;
 PERFORM corp_private.redline_resolve_timer_request(p_room_id);
 SELECT coalesce(timer_requests_enabled,true),coalesce(sender_auto_accept,false)
 INTO v_enabled,v_auto FROM corp_private.redline_room_features WHERE room_id=p_room_id;
 IF NOT coalesce(v_enabled,true) THEN
  RETURN jsonb_build_object('ok',false,'reason','timer_requests_disabled');END IF;
 SELECT * INTO v_q FROM corp_private.redline_timer_requests
 WHERE room_id=p_room_id AND photo_id=p_photo_id AND rate_cents=p_rate_cents
 AND status='accepted'
 AND session_started_at IS NOT DISTINCT FROM v_room.current_session_started_at
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR (v_q.consent_mode='preauthorized_timeout' AND NOT coalesce(v_auto,false)) THEN
  RETURN jsonb_build_object('ok',false,'reason','sender_consent_required');END IF;
 UPDATE public.corp_private_photo_timers t
 SET stopped_at=least(v_time,t.heartbeat_at+interval '45 seconds'),
 earned_cents=corp_private.redline_timer_prorated_cents(t.rate_cents,
   greatest(0,floor(extract(epoch from
     (least(v_time,t.heartbeat_at+interval '45 seconds')-t.started_at)))::bigint))
 WHERE t.room_id=p_room_id AND t.stopped_at IS NULL
 AND t.heartbeat_at<v_time-interval '75 seconds';
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers t
  WHERE t.room_id=p_room_id AND t.stopped_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_current_timer_first');END IF;
 INSERT INTO public.corp_private_photo_timers(
  room_id,photo_id,owner_id,recipient_id,rate_cents,started_at,heartbeat_at)
 VALUES(p_room_id,p_photo_id,v_room.owner_id,v_room.member_id,p_rate_cents,v_time,v_time)
 RETURNING id INTO v_id;
 UPDATE corp_private.redline_timer_requests SET status='started',responded_at=v_time
 WHERE id=v_q.id;
 RETURN jsonb_build_object('ok',true,'session_id',v_id,'consent_request_id',v_q.id);
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_photo_timer_start(uuid,uuid,bigint) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_photo_timer_start(uuid,uuid,bigint) TO authenticated;

-- One negotiation is opened when the owner first prices a photo manually.
CREATE OR REPLACE FUNCTION corp_private.redline_open_price_negotiation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_room public.corp_private_photo_rooms%ROWTYPE;v_enabled boolean:=true;
BEGIN
 IF NEW.decision_status<>'accepted' OR OLD.decision_status='accepted'
  OR NEW.auto_timer_session_id IS NOT NULL OR NEW.amount_cents IS NULL
 THEN RETURN NEW;END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=NEW.room_id;
 IF NOT FOUND OR NOT v_room.active OR NEW.uploaded_by<>v_room.member_id
   OR (v_room.current_session_started_at IS NOT NULL AND
     NEW.created_at<v_room.current_session_started_at) THEN RETURN NEW;END IF;
 SELECT negotiation_enabled INTO v_enabled FROM corp_private.redline_room_features
  WHERE room_id=NEW.room_id;
 IF coalesce(v_enabled,true) THEN
  INSERT INTO corp_private.redline_price_negotiations(
   photo_id,room_id,original_cents,session_started_at)
  VALUES(NEW.id,NEW.room_id,NEW.amount_cents,v_room.current_session_started_at)
  ON CONFLICT(photo_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION corp_private.redline_open_price_negotiation() FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS redline_manual_price_negotiation ON public.corp_private_photo_entries;
CREATE TRIGGER redline_manual_price_negotiation
 AFTER UPDATE OF decision_status,amount_cents ON public.corp_private_photo_entries
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_open_price_negotiation();

CREATE OR REPLACE FUNCTION public.corp_redline_price_negotiation_status(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
 v_enabled boolean:=true;
BEGIN
 IF v_user IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
  WHERE id=p_room_id AND (owner_id=v_user OR member_id=v_user);
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_authorized');END IF;
 SELECT negotiation_enabled INTO v_enabled FROM corp_private.redline_room_features WHERE room_id=p_room_id;
 RETURN jsonb_build_object('ok',true,'enabled',coalesce(v_enabled,true),
 'offers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC)
 FROM (SELECT n.photo_id,n.original_cents,n.offer_cents,n.offer_count,n.status,n.updated_at
 FROM corp_private.redline_price_negotiations n
 WHERE n.room_id=p_room_id AND n.session_started_at IS NOT DISTINCT FROM
   v_room.current_session_started_at
 ORDER BY n.updated_at DESC LIMIT 30) x),'[]'::jsonb));
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_status(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_price_negotiation_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_price_negotiation_act(
 p_photo_id uuid,p_action text,p_amount_cents bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
 v_n corp_private.redline_price_negotiations%ROWTYPE;v_e public.corp_private_photo_entries%ROWTYPE;
 v_enabled boolean:=true;v_status text;
BEGIN
 IF v_user IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT r.* INTO v_room FROM public.corp_private_photo_rooms r
  JOIN corp_private.redline_price_negotiations n ON n.room_id=r.id
  WHERE n.photo_id=p_photo_id FOR UPDATE OF r;
 IF NOT FOUND OR NOT v_room.active OR
   (v_room.owner_id<>v_user AND v_room.member_id<>v_user) THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_member_required');END IF;
 SELECT * INTO v_n FROM corp_private.redline_price_negotiations
   WHERE photo_id=p_photo_id AND room_id=v_room.id FOR UPDATE;
 SELECT * INTO v_e FROM public.corp_private_photo_entries
   WHERE id=p_photo_id AND room_id=v_room.id FOR UPDATE;
 SELECT negotiation_enabled INTO v_enabled FROM corp_private.redline_room_features WHERE room_id=v_room.id;
 IF NOT FOUND THEN v_enabled:=true;END IF;
 IF NOT coalesce(v_enabled,true) OR v_n.status NOT IN ('awaiting_sender','awaiting_owner')
  OR v_n.session_started_at IS DISTINCT FROM v_room.current_session_started_at
  OR v_e.settled_at IS NOT NULL OR v_e.decision_status<>'accepted' THEN
  RETURN jsonb_build_object('ok',false,'reason','negotiation_not_active');END IF;
 IF p_action='counter' AND v_user=v_room.member_id AND v_n.status='awaiting_sender' THEN
  IF v_n.offer_count>=3 OR p_amount_cents IS NULL OR p_amount_cents<0 OR
    p_amount_cents>=v_n.original_cents THEN
   RETURN jsonb_build_object('ok',false,'reason','counter_must_be_lower_than_original');END IF;
  -- Do not negotiate a balance after any room partial or full installment.
  IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
   WHERE p.room_id=v_room.id AND p.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at) THEN
   RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');END IF;
  UPDATE corp_private.redline_price_negotiations SET
   offer_cents=p_amount_cents,offer_count=offer_count+1,
   status='awaiting_owner',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='awaiting_owner';
 ELSIF p_action='accept_original' AND v_user=v_room.member_id AND v_n.status='awaiting_sender' THEN
  UPDATE corp_private.redline_price_negotiations SET
   status='agreed',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='accept_counter' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
   WHERE p.room_id=v_room.id AND p.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at) THEN
   RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');END IF;
  UPDATE public.corp_private_photo_entries SET amount_cents=v_n.offer_cents,
    priced_at=clock_timestamp()
   WHERE id=p_photo_id AND room_id=v_room.id AND settled_at IS NULL;
  UPDATE corp_private.redline_price_negotiations SET
   status='agreed',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='reject_counter' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  v_status:=CASE WHEN v_n.offer_count>=3 THEN 'original_final' ELSE 'awaiting_sender' END;
  UPDATE corp_private.redline_price_negotiations SET
   status=v_status,updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
 ELSIF p_action='finalize_original' AND v_user=v_room.owner_id THEN
  UPDATE corp_private.redline_price_negotiations SET
   status='original_final',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='original_final';
 ELSE RETURN jsonb_build_object('ok',false,'reason','action_not_permitted');END IF;
 RETURN jsonb_build_object('ok',true,'photo_id',p_photo_id,'status',v_status,
  'original_cents',v_n.original_cents,'offer_count',v_n.offer_count+
    CASE WHEN p_action='counter' THEN 1 ELSE 0 END);
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_act(uuid,text,bigint)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_price_negotiation_act(uuid,text,bigint)
 TO authenticated;
