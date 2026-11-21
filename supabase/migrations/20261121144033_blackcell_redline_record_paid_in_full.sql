-- BLACKCELL REDLINE deployed server-authorized atomic full-payment record.
-- No funds are transferred; original photo and timer prices are preserved.
CREATE OR REPLACE FUNCTION public.corp_redline_record_paid_in_full(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_time timestamptz := clock_timestamp();
 v_photo_count bigint := 0;
 v_timer_count bigint := 0;
 v_photo_cents numeric := 0;
 v_timer_cents numeric := 0;
 v_remaining_photo_cents numeric := 0;
 v_remaining_timer_cents numeric := 0;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL
  OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
 END IF;

 -- Serializes with timer starts and room session resets.
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR v_room.owner_id IS DISTINCT FROM v_user THEN
  RETURN jsonb_build_object('ok',false,'reason','room_owner_required');
 END IF;

 -- Never silently pay an actively accruing timer.
 IF EXISTS (SELECT 1 FROM public.corp_private_photo_timers t
            WHERE t.room_id=p_room_id AND t.stopped_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_current_timer_first');
 END IF;

 -- Settle ALL accepted current-session photo obligations (not just the UI's first 200).
 -- A timer-auto-accepted photo has the same amount as its linked timer: report
 -- it only under timer_cents to avoid double-counting the payment summary.
 WITH settled AS (
  UPDATE public.corp_private_photo_entries e
  SET settled_at=v_time
  WHERE e.room_id=p_room_id
   AND (v_room.current_session_started_at IS NULL
        OR e.created_at>=v_room.current_session_started_at)
   AND e.decision_status='accepted'
   AND e.amount_cents>0
   AND e.settled_at IS NULL
  RETURNING e.amount_cents,e.auto_timer_session_id
 )
 SELECT count(*)::bigint,
        coalesce(sum(CASE WHEN auto_timer_session_id IS NULL
                          THEN amount_cents ELSE 0 END),0)
 INTO v_photo_count,v_photo_cents FROM settled;

 WITH settled AS (
  UPDATE public.corp_private_photo_timers t
  SET settled_at=v_time
  WHERE t.room_id=p_room_id
   AND (v_room.current_session_started_at IS NULL
        OR t.started_at>=v_room.current_session_started_at)
   AND t.stopped_at IS NOT NULL
   AND t.earned_cents>0
   AND t.settled_at IS NULL
  RETURNING t.earned_cents
 )
 SELECT count(*)::bigint,coalesce(sum(earned_cents),0)
 INTO v_timer_count,v_timer_cents FROM settled;

 SELECT coalesce(sum(e.amount_cents),0)
 INTO v_remaining_photo_cents
 FROM public.corp_private_photo_entries e
 WHERE e.room_id=p_room_id
  AND (v_room.current_session_started_at IS NULL
       OR e.created_at>=v_room.current_session_started_at)
  AND e.decision_status='accepted' AND e.amount_cents>0
  AND e.settled_at IS NULL;

 SELECT coalesce(sum(t.earned_cents),0)
 INTO v_remaining_timer_cents
 FROM public.corp_private_photo_timers t
 WHERE t.room_id=p_room_id
  AND (v_room.current_session_started_at IS NULL
       OR t.started_at>=v_room.current_session_started_at)
  AND t.stopped_at IS NOT NULL AND t.earned_cents>0
  AND t.settled_at IS NULL;

 RETURN jsonb_build_object(
  'ok',true,
  'photo_count',v_photo_count,
  'timer_count',v_timer_count,
  'photo_cents',v_photo_cents,
  'timer_cents',v_timer_cents,
  'recorded_total_cents',v_photo_cents+v_timer_cents,
  'remaining_photo_cents',v_remaining_photo_cents,
  'remaining_timer_cents',v_remaining_timer_cents,
  'recorded_at',v_time
 );
END;
$function$

REVOKE ALL ON FUNCTION public.corp_redline_record_paid_in_full(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.corp_redline_record_paid_in_full(uuid) TO authenticated;
