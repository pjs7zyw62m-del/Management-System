-- REDLINE repeat bonus: integrate a one-time private award into the room's
-- authoritative assigned/paid/outstanding balance and external payment flow.
-- Preserve the existing exact photo/timer deduplication implementation.
ALTER FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 RENAME TO corp_redline_room_payment_status_without_bonuses;
REVOKE ALL ON FUNCTION public.corp_redline_room_payment_status_without_bonuses(uuid,boolean)
 FROM PUBLIC,anon,authenticated;

-- Accrual time is the time REDLINE recognizes the earned bonus, not an older
-- photo's original price timestamp.
CREATE OR REPLACE FUNCTION corp_private.redline_repeat_photo_bonus_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
BEGIN
  NEW.earned_at=clock_timestamp();
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_repeat_photo_bonus_clock() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER redline_repeat_photo_bonus_clock
 BEFORE INSERT ON corp_private.redline_repeat_photo_bonuses
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_repeat_photo_bonus_clock();

CREATE OR REPLACE FUNCTION public.corp_redline_room_payment_status(
 p_room_id uuid,p_archive boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 v_base jsonb;
 v_award_status jsonb;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_bonus_all numeric:=0;
 v_bonus_paid numeric:=0;
 v_bonus_unpaid numeric:=0;
 v_legacy_photo_unpaid numeric:=0;
 v_legacy_timer_unpaid numeric:=0;
 v_credits numeric:=0;
 v_bonus_credit numeric:=0;
 v_bonus_remaining numeric:=0;
 v_total numeric:=0;
 v_paid numeric:=0;
 v_remaining numeric:=0;
BEGIN
 v_base:=public.corp_redline_room_payment_status_without_bonuses(p_room_id,p_archive);
 IF v_base->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_base; END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id;
 -- Only a verified participant in an active current room can create awards.
 -- Status in archive mode is strictly read-only.
 IF NOT p_archive AND v_room.active THEN
  v_award_status:=public.corp_redline_repeat_bonus_status(p_room_id);
  IF v_award_status->>'ok' IS DISTINCT FROM 'true' THEN
   RETURN v_award_status;
  END IF;
 END IF;
 SELECT coalesce(sum(b.bonus_cents),0),
        coalesce(sum(b.bonus_cents) FILTER (WHERE b.settled_at IS NOT NULL),0)
 INTO v_bonus_all,v_bonus_paid
 FROM corp_private.redline_repeat_photo_bonuses b
 WHERE b.room_id=p_room_id AND (
  (NOT p_archive AND (v_room.current_session_started_at IS NULL
                      OR b.earned_at>=v_room.current_session_started_at))
  OR (p_archive AND v_room.current_session_started_at IS NOT NULL
      AND b.earned_at<v_room.current_session_started_at))
 );
 v_bonus_unpaid:=v_bonus_all-v_bonus_paid;

 -- The original ledger allocates room-level credits to unsettled photo
 -- prices before uncredited timers. Only surplus can pay a repeat bonus.
 SELECT coalesce(sum(e.amount_cents),0) INTO v_legacy_photo_unpaid
 FROM public.corp_private_photo_entries e
 LEFT JOIN public.corp_private_photo_timers t
   ON t.id=e.auto_timer_session_id AND t.room_id=e.room_id
 WHERE e.room_id=p_room_id AND e.decision_status='accepted' AND e.amount_cents>0
   AND e.settled_at IS NULL AND t.settled_at IS NULL
   AND ((NOT p_archive AND (v_room.current_session_started_at IS NULL
          OR e.created_at>=v_room.current_session_started_at))
      OR (p_archive AND v_room.current_session_started_at IS NOT NULL
          AND e.created_at<v_room.current_session_started_at));

 SELECT coalesce(sum(t.earned_cents),0) INTO v_legacy_timer_unpaid
 FROM public.corp_private_photo_timers t
 WHERE t.room_id=p_room_id AND t.stopped_at IS NOT NULL AND t.earned_cents>0
   AND t.settled_at IS NULL
   AND ((NOT p_archive AND (v_room.current_session_started_at IS NULL
          OR t.started_at>=v_room.current_session_started_at))
      OR (p_archive AND v_room.current_session_started_at IS NOT NULL
          AND t.started_at<v_room.current_session_started_at))
   AND NOT EXISTS (
     SELECT 1 FROM public.corp_private_photo_entries e
     WHERE e.room_id=p_room_id AND e.auto_timer_session_id=t.id
       AND e.decision_status='accepted' AND e.amount_cents>0
   );
 v_credits:=coalesce((v_base->>'payment_credit_cents')::numeric,0);
 v_bonus_credit:=least(v_bonus_unpaid,
      greatest(v_credits-v_legacy_photo_unpaid-v_legacy_timer_unpaid,0));
 v_bonus_remaining:=greatest(v_bonus_unpaid-v_bonus_credit,0);
 v_total:=(v_base->>'assigned_cents')::numeric+v_bonus_all;
 v_paid:=least(v_total,(v_base->>'paid_cents')::numeric+v_bonus_paid+v_bonus_credit);
 v_remaining:=(v_base->>'remaining_cents')::numeric+v_bonus_remaining;
 RETURN v_base||jsonb_build_object(
   'assigned_cents',v_total,
   'paid_cents',v_paid,
   'remaining_cents',v_remaining,
   'bonus_assigned_cents',v_bonus_all,
   'bonus_paid_cents',v_bonus_paid+v_bonus_credit,
   'bonus_owed_cents',v_bonus_remaining,
   'bonus_payment_credit_cents',v_bonus_credit
 );
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 TO authenticated;

-- Record pay-in-full against the entire verified balance, including bonus.
-- Use an immutable room payment receipt rather than mutating each photo
-- because partial payments and legacy settled flags must remain consistent.
CREATE OR REPLACE FUNCTION public.corp_redline_record_paid_in_full(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_status jsonb;
 v_due numeric;
 v_now timestamptz:=clock_timestamp();
 v_payment uuid;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR
    NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR v_room.owner_id IS DISTINCT FROM v_user OR NOT v_room.active THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_owner_required');
 END IF;
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers t
  WHERE t.room_id=p_room_id AND t.stopped_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_current_timer_first');
 END IF;
 v_status:=public.corp_redline_room_payment_status(p_room_id,false);
 IF v_status->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_status; END IF;
 v_due:=(v_status->>'remaining_cents')::numeric;
 IF v_due>0 THEN
  INSERT INTO corp_private.redline_room_payments(
   room_id,session_started_at,amount_cents,kind,note,recorded_by,created_at
  ) VALUES(p_room_id,v_room.current_session_started_at,v_due,'full',
   'Paid in full including REDLINE repeat-photo bonuses',v_user,v_now)
  RETURNING id INTO v_payment;
 END IF;
 RETURN jsonb_build_object(
  'ok',true,'payment_id',v_payment,'payment_ledger',true,
  'recorded_total_cents',greatest(0,v_due),'total_owed_cents',0,
  'remaining_photo_cents',0,'remaining_timer_cents',0,
  'bonus_included',true,'recorded_at',v_now
 );
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_record_paid_in_full(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_record_paid_in_full(uuid) TO authenticated;

-- Avoid dual-crediting a bonus by separately settling it after a room credit.
-- All awards must use the existing owner-confirmed room payment workflow.
REVOKE EXECUTE ON FUNCTION public.corp_redline_repeat_bonus_mark_paid(uuid)
 FROM authenticated;
