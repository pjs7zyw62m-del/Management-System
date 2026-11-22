-- REDLINE owner-start timers: immediate Start with a server-enforced owner switch
-- that optionally gives the sender an in-room Stop Timer control.
-- REDLINE records bookkeeping only. It does not initiate payment.
ALTER TABLE corp_private.redline_room_features
 ADD COLUMN IF NOT EXISTS sender_can_stop_timer boolean NOT NULL DEFAULT false;
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
 'sender_auto_accept',coalesce(v_features.sender_auto_accept,false),
 'sender_can_stop_timer',coalesce(v_features.sender_can_stop_timer,false));
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
 IF p_key NOT IN ('timer_requests_enabled','negotiation_enabled','sender_auto_accept','sender_can_stop_timer')
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
 ELSIF p_key='sender_can_stop_timer' THEN
  UPDATE corp_private.redline_room_features SET sender_can_stop_timer=p_enabled,
    updated_at=clock_timestamp() WHERE room_id=p_room_id;
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
CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_start(
 p_room_id uuid,p_photo_id uuid,p_rate_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
 v_user uuid:=(SELECT auth.uid());v_owner uuid;v_member uuid;v_active boolean;
 v_room public.corp_private_photo_rooms%ROWTYPE;
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
    AND e.decision_status<>'rejected'
    AND (v_room.current_session_started_at IS NULL OR e.created_at>=v_room.current_session_started_at)) THEN
  RETURN jsonb_build_object('ok',false,'reason','photo_not_available_for_timing');END IF;
 -- Owner starts the timer in the verified private room immediately.
 -- No timer consent request, sender response, or timeout is required.
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
 RETURN jsonb_build_object('ok',true,'session_id',v_id,'mode','owner_auto_start');
END;$$;

REVOKE ALL ON FUNCTION public.corp_redline_photo_timer_start(uuid,uuid,bigint) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_photo_timer_start(uuid,uuid,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.corp_redline_sender_stop_timer(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $stop$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_now timestamptz:=clock_timestamp();
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_timer public.corp_private_photo_timers%ROWTYPE;
 v_allowed boolean:=false;
 v_end timestamptz;v_seconds bigint;v_amount bigint;
 v_applied boolean:=false;
BEGIN
 IF v_user IS NULL OR p_session_id IS NULL OR
    NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_sender_required');
 END IF;
 SELECT r.* INTO v_room FROM public.corp_private_photo_rooms r
 JOIN public.corp_private_photo_timers t ON t.room_id=r.id
 WHERE t.id=p_session_id FOR UPDATE OF r;
 IF NOT FOUND OR NOT v_room.active OR v_user<>v_room.member_id THEN
  RETURN jsonb_build_object('ok',false,'reason','active_sender_room_required');
 END IF;
 SELECT f.sender_can_stop_timer INTO v_allowed
 FROM corp_private.redline_room_features f WHERE f.room_id=v_room.id;
 IF NOT COALESCE(v_allowed,false) THEN
  RETURN jsonb_build_object('ok',false,'reason','sender_stop_disabled');
 END IF;
 SELECT * INTO v_timer FROM public.corp_private_photo_timers
 WHERE id=p_session_id AND room_id=v_room.id FOR UPDATE;
 IF NOT FOUND OR v_timer.stopped_at IS NOT NULL OR
    (v_room.current_session_started_at IS NOT NULL AND
     v_timer.started_at<v_room.current_session_started_at) THEN
  RETURN jsonb_build_object('ok',false,'reason','timer_not_running');
 END IF;
 v_end=greatest(v_timer.started_at,least(v_now,v_timer.heartbeat_at+interval '45 seconds'));
 v_seconds=greatest(0,floor(extract(epoch FROM (v_end-v_timer.started_at)))::bigint);
 v_amount=corp_private.redline_timer_prorated_cents(v_timer.rate_cents,v_seconds);
 UPDATE public.corp_private_photo_timers
 SET stopped_at=v_end,earned_cents=v_amount WHERE id=v_timer.id;
 IF v_amount>0 THEN
  UPDATE public.corp_private_photo_entries e
  SET amount_cents=v_amount,decision_status='accepted',auto_timer_session_id=v_timer.id
  WHERE e.id=v_timer.photo_id AND e.room_id=v_room.id
   AND e.decision_status='pending' AND e.amount_cents IS NULL
  RETURNING true INTO v_applied;
 END IF;
 RETURN jsonb_build_object('ok',true,'photo_id',v_timer.photo_id,'earned_cents',v_amount,
   'elapsed_seconds',v_seconds,'completed_minutes',v_seconds/60,
   'photo_auto_submitted',COALESCE(v_applied,false),'stopped_by','sender');
END;$stop$;
REVOKE ALL ON FUNCTION public.corp_redline_sender_stop_timer(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_sender_stop_timer(uuid) TO authenticated;
