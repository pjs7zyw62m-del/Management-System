
-- BLACKCELL REDLINE: owner-recorded PARTIAL PAYMENTS (external payment records only).
-- A room-scoped, immutable ledger prevents duplicate timer/photo charges,
-- overpayments and crossing the boundary between current and archived sessions.
CREATE TABLE IF NOT EXISTS corp_private.redline_room_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
 session_started_at timestamptz,
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=9007199254740991),
 kind text NOT NULL CHECK(kind IN ('partial','full')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=180),
 recorded_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS redline_room_payments_by_room
 ON corp_private.redline_room_payments(room_id,created_at DESC);
ALTER TABLE corp_private.redline_room_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.redline_room_payments FROM public,anon,authenticated;

-- Current and archived balances are computed from the verified room, without
-- double-counting an auto-approved timer also stored as a photograph's price.
CREATE OR REPLACE FUNCTION public.corp_redline_room_payment_status(
 p_room_id uuid,p_archive boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_photo_assigned numeric:=0;v_photo_settled numeric:=0;
 v_extra_timers numeric:=0;v_extra_timers_settled numeric:=0;
 v_credits numeric:=0;v_photos_unpaid numeric:=0;v_timers_unpaid numeric:=0;
 v_photo_credit numeric:=0;v_timer_credit numeric:=0;
 v_total numeric:=0;v_remaining numeric:=0;
 v_history jsonb:='[]'::jsonb;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=p_room_id AND (owner_id=v_user OR member_id=v_user);
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_authorized'); END IF;
 SELECT COALESCE(sum(e.amount_cents),0),
        COALESCE(sum(CASE WHEN e.settled_at IS NOT NULL OR t.settled_at IS NOT NULL
         THEN e.amount_cents ELSE 0 END),0)
 INTO v_photo_assigned,v_photo_settled
 FROM public.corp_private_photo_entries e
 LEFT JOIN public.corp_private_photo_timers t ON t.id=e.auto_timer_session_id
   AND t.room_id=e.room_id
 WHERE e.room_id=p_room_id AND e.decision_status='accepted' AND e.amount_cents>0
  AND ((NOT p_archive AND (v_room.current_session_started_at IS NULL
    OR e.created_at>=v_room.current_session_started_at))
   OR (p_archive AND v_room.current_session_started_at IS NOT NULL
    AND e.created_at<v_room.current_session_started_at));
 SELECT COALESCE(sum(t.earned_cents),0),
        COALESCE(sum(CASE WHEN t.settled_at IS NOT NULL THEN t.earned_cents ELSE 0 END),0)
 INTO v_extra_timers,v_extra_timers_settled
 FROM public.corp_private_photo_timers t
 WHERE t.room_id=p_room_id AND t.stopped_at IS NOT NULL AND t.earned_cents>0
  AND ((NOT p_archive AND (v_room.current_session_started_at IS NULL
    OR t.started_at>=v_room.current_session_started_at))
   OR (p_archive AND v_room.current_session_started_at IS NOT NULL
    AND t.started_at<v_room.current_session_started_at))
  AND NOT EXISTS(
   SELECT 1 FROM public.corp_private_photo_entries e
   WHERE e.room_id=p_room_id AND e.auto_timer_session_id=t.id
    AND e.decision_status='accepted' AND e.amount_cents>0
  );
 SELECT COALESCE(sum(p.amount_cents),0) INTO v_credits
 FROM corp_private.redline_room_payments p
 WHERE p.room_id=p_room_id AND
 ((NOT p_archive AND p.session_started_at IS NOT DISTINCT FROM v_room.current_session_started_at)
 OR (p_archive AND p.session_started_at IS DISTINCT FROM v_room.current_session_started_at));
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb)
 INTO v_history FROM (
  SELECT p.id,p.amount_cents,p.kind,p.note,p.created_at
  FROM corp_private.redline_room_payments p
  WHERE p.room_id=p_room_id AND
  ((NOT p_archive AND p.session_started_at IS NOT DISTINCT FROM v_room.current_session_started_at)
  OR (p_archive AND p.session_started_at IS DISTINCT FROM v_room.current_session_started_at))
  ORDER BY p.created_at DESC,p.id DESC LIMIT 50
 ) x;
 v_photos_unpaid:=greatest(0,v_photo_assigned-v_photo_settled);
 v_timers_unpaid:=greatest(0,v_extra_timers-v_extra_timers_settled);
 v_total:=v_photo_assigned+v_extra_timers;
 v_photo_credit:=least(v_credits,v_photos_unpaid);
 v_timer_credit:=least(greatest(v_credits-v_photo_credit,0),v_timers_unpaid);
 v_remaining:=greatest(v_photos_unpaid+v_timers_unpaid-v_credits,0);
 RETURN jsonb_build_object(
  'ok',true,'room_id',p_room_id,'archive',p_archive,
  'assigned_cents',v_total,
  'paid_cents',least(v_total,v_photo_settled+v_extra_timers_settled+v_credits),
  'remaining_cents',v_remaining,
  'photo_assigned_cents',v_photo_assigned,
  'photo_paid_cents',v_photo_settled+v_photo_credit,
  'photo_owed_cents',v_photos_unpaid-v_photo_credit,
  'timer_extra_assigned_cents',v_extra_timers,
  'timer_extra_paid_cents',v_extra_timers_settled+v_timer_credit,
  'timer_extra_owed_cents',v_timers_unpaid-v_timer_credit,
  'payment_credit_cents',v_credits,
  'payment_history',v_history
 );
END;$function$;
REVOKE ALL ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean) TO authenticated;

-- Only the verified room OWNER can record an actual external payment. The
-- room lock serializes concurrent clicks with Pay in Full and session resets.
CREATE OR REPLACE FUNCTION public.corp_redline_record_partial_payment(
 p_room_id uuid,p_amount_cents bigint,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_status jsonb;v_remaining numeric;
 v_id uuid;v_now timestamptz:=clock_timestamp();
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR v_room.owner_id IS DISTINCT FROM v_user OR NOT v_room.active THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_owner_required');
 END IF;
 IF p_amount_cents IS NULL OR p_amount_cents<1 OR p_amount_cents>9007199254740991 THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_payment_amount');
 END IF;
 IF length(coalesce(p_note,''))>180 THEN
  RETURN jsonb_build_object('ok',false,'reason','note_too_long');
 END IF;
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers t
           WHERE t.room_id=p_room_id AND t.stopped_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_current_timer_first');
 END IF;
 v_status:=public.corp_redline_room_payment_status(p_room_id,false);
 IF v_status->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_status; END IF;
 v_remaining:=(v_status->>'remaining_cents')::numeric;
 IF p_amount_cents>v_remaining OR v_remaining<=0 THEN
  RETURN jsonb_build_object('ok',false,'reason','exceeds_outstanding',
   'remaining_cents',v_remaining);
 END IF;
 INSERT INTO corp_private.redline_room_payments(
  room_id,session_started_at,amount_cents,kind,note,recorded_by,created_at
 ) VALUES (p_room_id,v_room.current_session_started_at,p_amount_cents,'partial',
  trim(coalesce(p_note,'')),v_user,v_now) RETURNING id INTO v_id;
 RETURN jsonb_build_object(
  'ok',true,'payment_id',v_id,'amount_cents',p_amount_cents,
  'remaining_cents',v_remaining-p_amount_cents,'recorded_at',v_now
 );
END;$function$;
REVOKE ALL ON FUNCTION public.corp_redline_record_partial_payment(uuid,bigint,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.corp_redline_record_partial_payment(uuid,bigint,text) TO authenticated;

-- Pay in Full remains compatible with legacy settled_at records. If partial
-- records exist, it inserts only the REMAINING amount instead of marking the
-- entire photo/timer face value paid again.
CREATE OR REPLACE FUNCTION public.corp_redline_record_paid_in_full(p_room_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_time timestamptz:=clock_timestamp();
 v_photo_count bigint:=0;v_timer_count bigint:=0;
 v_photo_cents numeric:=0;v_timer_cents numeric:=0;
 v_remaining_photo_cents numeric:=0;v_remaining_timer_cents numeric:=0;
 v_status jsonb;v_due numeric:=0;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR v_room.owner_id IS DISTINCT FROM v_user OR NOT v_room.active THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_owner_required');
 END IF;
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers t
  WHERE t.room_id=p_room_id AND t.stopped_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_current_timer_first');
 END IF;
 IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
  WHERE p.room_id=p_room_id
   AND p.session_started_at IS NOT DISTINCT FROM v_room.current_session_started_at) THEN
  v_status:=public.corp_redline_room_payment_status(p_room_id,false);
  IF v_status->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_status; END IF;
  v_due:=(v_status->>'remaining_cents')::numeric;
  IF v_due>0 THEN
   INSERT INTO corp_private.redline_room_payments(
    room_id,session_started_at,amount_cents,kind,note,recorded_by,created_at
   ) VALUES(p_room_id,v_room.current_session_started_at,v_due,'full',
    'Paid in full (remaining balance)',v_user,v_time);
  END IF;
  RETURN jsonb_build_object('ok',true,'photo_count',0,'timer_count',0,
   'photo_cents',0,'timer_cents',0,'recorded_total_cents',v_due,
   'remaining_photo_cents',0,'remaining_timer_cents',0,
   'total_owed_cents',0,'payment_ledger',true,'recorded_at',v_time);
 END IF;
 WITH settled AS (
  UPDATE public.corp_private_photo_entries e SET settled_at=v_time
  WHERE e.room_id=p_room_id AND
   (v_room.current_session_started_at IS NULL OR e.created_at>=v_room.current_session_started_at)
   AND e.decision_status='accepted' AND e.amount_cents>0 AND e.settled_at IS NULL
  RETURNING e.amount_cents,e.auto_timer_session_id
 )
 SELECT count(*)::bigint,coalesce(sum(CASE WHEN auto_timer_session_id IS NULL
  THEN amount_cents ELSE 0 END),0) INTO v_photo_count,v_photo_cents FROM settled;
 WITH settled AS (
  UPDATE public.corp_private_photo_timers t SET settled_at=v_time
  WHERE t.room_id=p_room_id AND
   (v_room.current_session_started_at IS NULL OR t.started_at>=v_room.current_session_started_at)
   AND t.stopped_at IS NOT NULL AND t.earned_cents>0 AND t.settled_at IS NULL
  RETURNING t.earned_cents
 )
 SELECT count(*)::bigint,coalesce(sum(earned_cents),0)
 INTO v_timer_count,v_timer_cents FROM settled;
 SELECT coalesce(sum(e.amount_cents),0) INTO v_remaining_photo_cents
 FROM public.corp_private_photo_entries e
 WHERE e.room_id=p_room_id AND
  (v_room.current_session_started_at IS NULL OR e.created_at>=v_room.current_session_started_at)
  AND e.decision_status='accepted' AND e.amount_cents>0 AND e.settled_at IS NULL;
 SELECT coalesce(sum(t.earned_cents),0) INTO v_remaining_timer_cents
 FROM public.corp_private_photo_timers t
 WHERE t.room_id=p_room_id AND
  (v_room.current_session_started_at IS NULL OR t.started_at>=v_room.current_session_started_at)
  AND t.stopped_at IS NOT NULL AND t.earned_cents>0 AND t.settled_at IS NULL;
 RETURN jsonb_build_object('ok',true,'photo_count',v_photo_count,
  'timer_count',v_timer_count,'photo_cents',v_photo_cents,'timer_cents',v_timer_cents,
  'recorded_total_cents',v_photo_cents+v_timer_cents,
  'remaining_photo_cents',v_remaining_photo_cents,
  'remaining_timer_cents',v_remaining_timer_cents,'recorded_at',v_time);
END;$function$;
REVOKE ALL ON FUNCTION public.corp_redline_record_paid_in_full(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.corp_redline_record_paid_in_full(uuid) TO authenticated;
