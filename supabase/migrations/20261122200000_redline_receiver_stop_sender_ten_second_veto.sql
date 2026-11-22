-- Receiver STOP gives sender 10 seconds to veto on first two attempts.
-- Third receiver STOP finalizes automatically, regardless of sender response.
ALTER TABLE corp_private.redline_room_features ADD COLUMN IF NOT EXISTS sender_can_veto_stop_timer boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS corp_private.redline_timer_stop_veto(
 timer_id uuid PRIMARY KEY REFERENCES public.corp_private_photo_timers(id) ON DELETE CASCADE,
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 stop_attempts smallint NOT NULL DEFAULT 0 CHECK(stop_attempts BETWEEN 0 AND 3),
 status text NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','pending','vetoed','timed_out','forced','disabled')),
 pending_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='pending')=(pending_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS redline_timer_stop_veto_room_idx ON corp_private.redline_timer_stop_veto(room_id);
ALTER TABLE corp_private.redline_timer_stop_veto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.redline_timer_stop_veto FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION corp_private.redline_finalize_stop_timer(p_timer_id uuid,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_t public.corp_private_photo_timers%ROWTYPE; v_until timestamptz;
 v_seconds bigint;v_amount bigint;v_applied boolean:=false;
BEGIN
 SELECT * INTO v_t FROM public.corp_private_photo_timers WHERE id=p_timer_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','timer_not_found');END IF;
 IF v_t.stopped_at IS NULL THEN
  v_until=greatest(v_t.started_at,least(p_cutoff,v_t.heartbeat_at+interval '45 seconds'));
  v_seconds=greatest(0,floor(extract(epoch FROM(v_until-v_t.started_at)))::bigint);
  v_amount=corp_private.redline_timer_prorated_cents(v_t.rate_cents,v_seconds);
  UPDATE public.corp_private_photo_timers SET stopped_at=v_until,earned_cents=v_amount WHERE id=v_t.id;
  IF v_amount>0 THEN
   UPDATE public.corp_private_photo_entries e
    SET amount_cents=v_amount,decision_status='accepted',auto_timer_session_id=v_t.id
    WHERE e.id=v_t.photo_id AND e.room_id=v_t.room_id
     AND e.decision_status='pending' AND e.amount_cents IS NULL
    RETURNING true INTO v_applied;
  END IF;
 ELSE
  v_until=v_t.stopped_at;v_amount=v_t.earned_cents;
  v_seconds=greatest(0,floor(extract(epoch FROM(v_until-v_t.started_at)))::bigint);
 END IF;
 RETURN jsonb_build_object('ok',true,'status','stopped','photo_id',v_t.photo_id,
  'earned_cents',v_amount,'elapsed_seconds',v_seconds,'completed_minutes',v_seconds/60,
  'photo_auto_submitted',coalesce(v_applied,false),
  'photo_has_timer_price',exists(
   SELECT 1 FROM public.corp_private_photo_entries e
   WHERE e.id=v_t.photo_id AND e.auto_timer_session_id=v_t.id));
END;$fn$;
REVOKE ALL ON FUNCTION corp_private.redline_finalize_stop_timer(uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION corp_private.redline_resolve_expired_timer_stops(p_room_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_r record;
BEGIN
 FOR v_r IN SELECT timer_id,pending_until FROM corp_private.redline_timer_stop_veto
  WHERE room_id=p_room_id AND status='pending' AND pending_until<=clock_timestamp()
 LOOP
  PERFORM corp_private.redline_finalize_stop_timer(v_r.timer_id,v_r.pending_until);
  UPDATE corp_private.redline_timer_stop_veto SET status='timed_out',
   pending_until=NULL,updated_at=clock_timestamp()
   WHERE timer_id=v_r.timer_id AND status='pending' AND pending_until<=clock_timestamp();
 END LOOP;
END;$fn$;
REVOKE ALL ON FUNCTION corp_private.redline_resolve_expired_timer_stops(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_timer_stop_request(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_uid uuid:=(SELECT auth.uid());v_now timestamptz:=clock_timestamp();
 v_t public.corp_private_photo_timers%ROWTYPE;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_q corp_private.redline_timer_stop_veto%ROWTYPE;
 v_enabled boolean:=true;v_reply jsonb;
BEGIN
 IF v_uid IS NULL OR p_session_id IS NULL OR NOT(SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');END IF;
 SELECT * INTO v_t FROM public.corp_private_photo_timers WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND OR v_t.owner_id<>v_uid THEN
  RETURN jsonb_build_object('ok',false,'reason','owner_timer_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=v_t.room_id;
 IF NOT FOUND OR NOT v_room.active OR v_room.owner_id<>v_uid OR
  (v_room.current_session_started_at IS NOT NULL AND v_t.started_at<v_room.current_session_started_at) THEN
  RETURN jsonb_build_object('ok',false,'reason','active_owner_room_required');END IF;
 IF v_t.stopped_at IS NOT NULL THEN
  RETURN corp_private.redline_finalize_stop_timer(p_session_id,v_now);END IF;
 INSERT INTO corp_private.redline_timer_stop_veto(timer_id,room_id)
 VALUES(v_t.id,v_t.room_id) ON CONFLICT(timer_id) DO NOTHING;
 SELECT * INTO v_q FROM corp_private.redline_timer_stop_veto WHERE timer_id=v_t.id FOR UPDATE;
 IF v_q.status='pending' THEN
  IF v_q.pending_until<=v_now THEN
   v_reply=corp_private.redline_finalize_stop_timer(v_t.id,v_q.pending_until);
   UPDATE corp_private.redline_timer_stop_veto SET status='timed_out',
    pending_until=NULL,updated_at=v_now WHERE timer_id=v_t.id;
   RETURN v_reply;
  END IF;
  RETURN jsonb_build_object('ok',true,'status','pending','attempts',v_q.stop_attempts,'expires_at',v_q.pending_until);
 END IF;
 SELECT coalesce(sender_can_veto_stop_timer,true) INTO v_enabled
 FROM corp_private.redline_room_features WHERE room_id=v_t.room_id;
 v_q.stop_attempts:=v_q.stop_attempts+1;
 IF v_q.stop_attempts>=3 OR NOT coalesce(v_enabled,true) THEN
  v_reply=corp_private.redline_finalize_stop_timer(v_t.id,v_now);
  UPDATE corp_private.redline_timer_stop_veto SET stop_attempts=v_q.stop_attempts,
   status=CASE WHEN coalesce(v_enabled,true) THEN 'forced' ELSE 'disabled' END,
   pending_until=NULL,updated_at=v_now WHERE timer_id=v_t.id;
  RETURN v_reply;
 END IF;
 UPDATE corp_private.redline_timer_stop_veto SET
  stop_attempts=v_q.stop_attempts,status='pending',
  pending_until=v_now+interval '10 seconds',updated_at=v_now
 WHERE timer_id=v_t.id RETURNING * INTO v_q;
 RETURN jsonb_build_object('ok',true,'status','pending','attempts',v_q.stop_attempts,
  'expires_at',v_q.pending_until,'photo_id',v_t.photo_id);
END;$fn$;
REVOKE ALL ON FUNCTION public.corp_redline_timer_stop_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_timer_stop_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_timer_stop_veto(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_uid uuid:=(SELECT auth.uid());v_now timestamptz:=clock_timestamp();
 v_t public.corp_private_photo_timers%ROWTYPE;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_q corp_private.redline_timer_stop_veto%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR p_session_id IS NULL OR NOT(SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_sender_required');END IF;
 SELECT * INTO v_t FROM public.corp_private_photo_timers WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','timer_not_found');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=v_t.room_id;
 IF NOT FOUND OR NOT v_room.active OR v_room.member_id<>v_uid
  OR (v_room.current_session_started_at IS NOT NULL AND v_t.started_at<v_room.current_session_started_at) THEN
  RETURN jsonb_build_object('ok',false,'reason','active_sender_room_required');END IF;
 SELECT * INTO v_q FROM corp_private.redline_timer_stop_veto WHERE timer_id=v_t.id FOR UPDATE;
 IF NOT FOUND OR v_q.status<>'pending' OR v_t.stopped_at IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_request_not_pending');END IF;
 IF v_q.pending_until<=v_now THEN
  PERFORM corp_private.redline_finalize_stop_timer(v_t.id,v_q.pending_until);
  UPDATE corp_private.redline_timer_stop_veto SET status='timed_out',
   pending_until=NULL,updated_at=v_now WHERE timer_id=v_t.id;
  RETURN jsonb_build_object('ok',false,'reason','stop_request_expired');
 END IF;
 IF v_q.stop_attempts>=3 THEN
  RETURN jsonb_build_object('ok',false,'reason','third_stop_cannot_be_vetoed');END IF;
 UPDATE corp_private.redline_timer_stop_veto SET status='vetoed',
  pending_until=NULL,updated_at=v_now WHERE timer_id=v_t.id;
 RETURN jsonb_build_object('ok',true,'status','vetoed',
  'attempts',v_q.stop_attempts,'vetoes_remaining',2-v_q.stop_attempts);
END;$fn$;
REVOKE ALL ON FUNCTION public.corp_redline_timer_stop_veto(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_timer_stop_veto(uuid) TO authenticated;
