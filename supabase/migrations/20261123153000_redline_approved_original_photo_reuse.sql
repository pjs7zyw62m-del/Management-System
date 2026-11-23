-- BLACKCELL REDLINE: allow a sender to reuse an already approved
-- original in the same active private room via a NEW pending review.
-- Retains the existing trigger, tombstone check, payment immutability,
-- duplicate/pending/rejection safeguards and explicit sender verification.
-- No new bonus eligibility: paid five-star reviews remain separately required.
CREATE OR REPLACE FUNCTION corp_private.redline_validate_five_star_resubmission()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
DECLARE
 v_source public.corp_private_photo_entries%ROWTYPE;
 v_room public.corp_private_photo_rooms%ROWTYPE;
BEGIN
 IF NEW.resubmission_origin_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.resubmission_origin_id=NEW.id THEN
  RAISE EXCEPTION 'A photograph cannot reuse itself' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_source FROM public.corp_private_photo_entries
 WHERE id=NEW.resubmission_origin_id AND room_id=NEW.room_id;
 IF NOT FOUND OR v_source.resubmission_origin_id IS NOT NULL
    OR v_source.uploaded_by IS DISTINCT FROM (SELECT auth.uid())
    OR v_source.decision_status IS DISTINCT FROM 'accepted' THEN
  RAISE EXCEPTION 'Reuse requires an original photograph approved in your own private room'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=NEW.room_id AND member_id=(SELECT auth.uid())
   AND active AND NOT photo_sending_paused;
 IF NOT FOUND OR (v_room.current_session_started_at IS NOT NULL
   AND v_source.created_at < v_room.current_session_started_at) THEN
  RAISE EXCEPTION 'Photo reuse is unavailable in this room or session'
    USING ERRCODE='23514';
 END IF;
 -- Serialize simultaneous reuse attempts of this original across devices.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_source.id::text,0));
 IF EXISTS(
  SELECT 1 FROM public.corp_private_photo_entries prior
  WHERE prior.room_id=NEW.room_id
   AND prior.resubmission_origin_id=v_source.id
   AND prior.decision_status IN ('pending','rejected')
 ) THEN
  RAISE EXCEPTION 'The photo has an awaiting or rejected reuse; no new reuse allowed'
    USING ERRCODE='23514';
 END IF;
 -- The separate redline_no_removed_resubmission trigger rejects tombstoned
 -- originals before the row can be written.
 IF NEW.uploaded_by IS DISTINCT FROM (SELECT auth.uid())
    OR NEW.decision_status IS DISTINCT FROM 'pending'
    OR NEW.amount_cents IS NOT NULL
    OR NEW.priced_at IS NOT NULL OR NEW.decided_at IS NOT NULL
    OR NEW.settled_at IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid pending private photo reuse'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
