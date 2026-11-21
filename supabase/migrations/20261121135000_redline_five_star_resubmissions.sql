-- REDLINE five-star resubmission: copies are new pending review entries;
-- originals, historical bids, timer amounts, ratings and archives are untouched.
ALTER TABLE public.corp_private_photo_entries
 ADD COLUMN IF NOT EXISTS resubmission_origin_id uuid
 REFERENCES public.corp_private_photo_entries(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS redline_resubmission_origin_idx
 ON public.corp_private_photo_entries(room_id,resubmission_origin_id,created_at DESC)
 WHERE resubmission_origin_id IS NOT NULL;

-- Never let an existing photo be relinked to another source after posting.
CREATE OR REPLACE FUNCTION corp_private.redline_resubmission_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
BEGIN
 IF NEW.resubmission_origin_id IS DISTINCT FROM OLD.resubmission_origin_id
 THEN RAISE EXCEPTION 'Photo resubmission origin cannot be edited'
  USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION corp_private.redline_resubmission_immutable()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_resubmission_immutable
 ON public.corp_private_photo_entries;
CREATE TRIGGER redline_resubmission_immutable
 BEFORE UPDATE ON public.corp_private_photo_entries
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_resubmission_immutable();

-- Sender can resubmit only THEIR originally accepted, receiver-rated
-- five-star photo from THIS active room/current session.
-- A pending resend prevents duplicates; any rejected resend permanently
-- blocks future copies even when earlier attempts were accepted.
CREATE OR REPLACE FUNCTION corp_private.redline_validate_five_star_resubmission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_source public.corp_private_photo_entries%ROWTYPE;
DECLARE v_room public.corp_private_photo_rooms%ROWTYPE;
DECLARE v_rating smallint;
BEGIN
 IF NEW.resubmission_origin_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.resubmission_origin_id=NEW.id THEN
  RAISE EXCEPTION 'A photograph cannot resubmit itself' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_source FROM public.corp_private_photo_entries
 WHERE id=NEW.resubmission_origin_id AND room_id=NEW.room_id;
 IF NOT FOUND OR v_source.resubmission_origin_id IS NOT NULL
    OR v_source.uploaded_by IS DISTINCT FROM (SELECT auth.uid())
    OR v_source.decision_status <> 'accepted' THEN
  RAISE EXCEPTION 'Only your approved original photograph can be resubmitted'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=NEW.room_id AND member_id=(SELECT auth.uid())
   AND active AND NOT photo_sending_paused;
 IF NOT FOUND OR (v_room.current_session_started_at IS NOT NULL
   AND v_source.created_at < v_room.current_session_started_at) THEN
  RAISE EXCEPTION 'Resubmissions are unavailable in this room or session'
    USING ERRCODE='23514';
 END IF;
 SELECT stars INTO v_rating FROM public.corp_redline_photo_ratings
 WHERE photo_id=v_source.id;
 IF v_rating IS DISTINCT FROM 5 THEN
  RAISE EXCEPTION 'Only five-star photographs may be resubmitted'
    USING ERRCODE='23514';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.corp_private_photo_entries prior
  WHERE prior.room_id=NEW.room_id
   AND prior.resubmission_origin_id=v_source.id
   AND prior.decision_status IN ('pending','rejected')
 ) THEN
  RAISE EXCEPTION 'Photo is waiting for review or was rejected; no further resubmissions'
    USING ERRCODE='23514';
 END IF;
 -- Source bytes must be copied into a fresh private storage key by the
 -- verified sender. Do not permit changing ownership or archive scope.
 IF NEW.uploaded_by IS DISTINCT FROM (SELECT auth.uid())
    OR NEW.decision_status<>'pending'
    OR NEW.amount_cents IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid pending five-star photo resend'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION corp_private.redline_validate_five_star_resubmission()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_validate_five_star_resubmission
 ON public.corp_private_photo_entries;
CREATE TRIGGER redline_validate_five_star_resubmission
 BEFORE INSERT ON public.corp_private_photo_entries
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_validate_five_star_resubmission();
