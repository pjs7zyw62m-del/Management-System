-- Owner-only permanent REDLINE media deletion.
-- An immediate, private removal tombstone blocks new reads while Bunny DELETE
-- runs; a successful remote delete is recorded without erasing the financial
-- ledger, ratings or audit chronology.
CREATE TABLE IF NOT EXISTS corp_private.redline_photo_removals(
 photo_id uuid PRIMARY KEY REFERENCES public.corp_private_photo_entries(id) ON DELETE RESTRICT,
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE RESTRICT,
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 reason text NOT NULL DEFAULT 'inappropriate' CHECK(reason IN ('inappropriate')),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 removed_at timestamptz
);
CREATE INDEX IF NOT EXISTS redline_photo_removals_room_idx
 ON corp_private.redline_photo_removals(room_id,requested_at DESC);
ALTER TABLE corp_private.redline_photo_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.redline_photo_removals FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_remove_begin(
 p_room_id uuid,p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid := (SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_entry public.corp_private_photo_entries%ROWTYPE;
 v_removed timestamptz;
 v_legacy_present boolean;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR p_photo_id IS NULL OR
   NOT (SELECT corp_private.photo_ledger_verified()) OR
   NOT (SELECT corp_private.is_owner(v_user)) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR v_room.owner_id<>v_user THEN
  RETURN jsonb_build_object('ok',false,'reason','receiver_room_required');
 END IF;
 SELECT * INTO v_entry FROM public.corp_private_photo_entries
 WHERE id=p_photo_id AND room_id=p_room_id FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('ok',false,'reason','photo_not_found_in_room');
 END IF;
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers
   WHERE photo_id=p_photo_id AND room_id=p_room_id AND stopped_at IS NULL)
 THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_running_timer_before_deleting');
 END IF;

 INSERT INTO corp_private.redline_photo_removals(
  photo_id,room_id,requested_by,reason)
 VALUES(p_photo_id,p_room_id,v_user,'inappropriate')
 ON CONFLICT(photo_id) DO NOTHING;
 SELECT removed_at INTO v_removed FROM corp_private.redline_photo_removals
 WHERE photo_id=p_photo_id AND room_id=p_room_id;

 -- A previously approved timer request may no longer start against this file.
 UPDATE corp_private.redline_timer_requests SET status='cancelled',
  responded_at=clock_timestamp()
 WHERE room_id=p_room_id AND photo_id=p_photo_id
   AND status IN ('pending','accepted');
 -- The original price remains immutable if negotiation was not concluded.
 UPDATE corp_private.redline_price_negotiations
 SET status='original_final',updated_at=clock_timestamp()
 WHERE photo_id=p_photo_id AND room_id=p_room_id
   AND status IN ('awaiting_sender','awaiting_owner');

 -- The owner already emptied the old Supabase bucket. For old paths,
 -- distinguish a confirmed missing source from an existing object that must
 -- still be removed before recording success.
 v_legacy_present := EXISTS(
   SELECT 1 FROM storage.objects
   WHERE bucket_id='corp-private-photo-ledger'
    AND name=v_entry.image_path
 );
 RETURN jsonb_build_object(
  'ok',true,'status',CASE WHEN v_removed IS NULL THEN 'pending' ELSE 'removed' END,
  'room_id',p_room_id,'photo_id',p_photo_id,
  'path',v_entry.image_path,
  'legacy_object_exists',v_legacy_present);
END;
$$;
REVOKE ALL ON FUNCTION public.corp_redline_photo_remove_begin(uuid,uuid)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_photo_remove_begin(uuid,uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_remove_finish(
 p_room_id uuid,p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid := (SELECT auth.uid());
 v_entry public.corp_private_photo_entries%ROWTYPE;
 v_removed timestamptz;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR p_photo_id IS NULL OR
   NOT (SELECT corp_private.photo_ledger_verified()) OR
   NOT (SELECT corp_private.is_owner(v_user)) OR NOT EXISTS (
    SELECT 1 FROM public.corp_private_photo_rooms r
    WHERE r.id=p_room_id AND r.owner_id=v_user
   ) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_receiver_required');
 END IF;
 SELECT * INTO v_entry FROM public.corp_private_photo_entries
 WHERE id=p_photo_id AND room_id=p_room_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','photo_not_found'); END IF;
 IF NOT EXISTS(SELECT 1 FROM corp_private.redline_photo_removals
 WHERE room_id=p_room_id AND photo_id=p_photo_id) THEN
  RETURN jsonb_build_object('ok',false,'reason','removal_not_requested');
 END IF;
 IF EXISTS(SELECT 1 FROM public.corp_private_photo_timers
   WHERE photo_id=p_photo_id AND room_id=p_room_id AND stopped_at IS NULL)
 THEN
  RETURN jsonb_build_object('ok',false,'reason','stop_running_timer_before_deleting');
 END IF;
 UPDATE corp_private.redline_photo_removals
 SET removed_at=COALESCE(removed_at,clock_timestamp())
 WHERE room_id=p_room_id AND photo_id=p_photo_id
 RETURNING removed_at INTO v_removed;
 IF v_entry.decision_status='pending' THEN
  -- Pending photos are rejected with zero bid; the next queued photo
  -- becomes active while preserving a minimal history of this removal.
  UPDATE public.corp_private_photo_entries SET decision_status='rejected'
  WHERE id=p_photo_id AND room_id=p_room_id AND decision_status='pending';
 END IF;
 RETURN jsonb_build_object('ok',true,'status','removed','photo_id',p_photo_id,
   'removed_at',v_removed);
END;
$$;
REVOKE ALL ON FUNCTION public.corp_redline_photo_remove_finish(uuid,uuid)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_photo_remove_finish(uuid,uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_removal_status(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR
  NOT (SELECT corp_private.photo_ledger_verified()) OR NOT EXISTS(
   SELECT 1 FROM public.corp_private_photo_rooms r
    WHERE r.id=p_room_id AND (r.owner_id=v_user OR r.member_id=v_user)
  ) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');
 END IF;
 RETURN jsonb_build_object('ok',true,'photos',COALESCE(
  (SELECT jsonb_agg(jsonb_build_object(
   'photo_id',d.photo_id,
   'status',CASE WHEN d.removed_at IS NULL THEN 'pending' ELSE 'removed' END,
   'removed_at',d.removed_at)
   ORDER BY d.requested_at DESC)
  FROM corp_private.redline_photo_removals d
   WHERE d.room_id=p_room_id),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.corp_redline_photo_removal_status(uuid)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_photo_removal_status(uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_removal_check(
 p_room_id uuid,p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL OR p_photo_id IS NULL OR
  NOT (SELECT corp_private.photo_ledger_verified()) OR NOT EXISTS(
   SELECT 1 FROM public.corp_private_photo_rooms r
   WHERE r.id=p_room_id AND (r.owner_id=v_user OR r.member_id=v_user)
  ) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');
 END IF;
 RETURN jsonb_build_object('ok',true,'blocked',EXISTS(
  SELECT 1 FROM corp_private.redline_photo_removals d
  WHERE d.photo_id=p_photo_id AND d.room_id=p_room_id));
END;
$$;
REVOKE ALL ON FUNCTION public.corp_redline_photo_removal_check(uuid,uuid)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_photo_removal_check(uuid,uuid)
 TO authenticated;

-- Even old signed-in clients cannot start billing or resubmit a deleted file.
CREATE OR REPLACE FUNCTION corp_private.redline_refuse_removed_photo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_id uuid;
BEGIN
 IF TG_TABLE_NAME='corp_private_photo_entries' THEN
  v_id:=NEW.resubmission_origin_id;
 ELSE v_id:=NEW.photo_id; END IF;
 IF v_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM corp_private.redline_photo_removals WHERE photo_id=v_id
 ) THEN
  RAISE EXCEPTION 'This private photograph has been permanently removed'
  USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION corp_private.redline_refuse_removed_photo()
 FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS redline_no_removed_timer ON public.corp_private_photo_timers;
CREATE TRIGGER redline_no_removed_timer BEFORE INSERT
 ON public.corp_private_photo_timers FOR EACH ROW
 EXECUTE FUNCTION corp_private.redline_refuse_removed_photo();
DROP TRIGGER IF EXISTS redline_no_removed_timer_request ON corp_private.redline_timer_requests;
CREATE TRIGGER redline_no_removed_timer_request BEFORE INSERT
 ON corp_private.redline_timer_requests FOR EACH ROW
 EXECUTE FUNCTION corp_private.redline_refuse_removed_photo();
DROP TRIGGER IF EXISTS redline_no_removed_resubmission ON public.corp_private_photo_entries;
CREATE TRIGGER redline_no_removed_resubmission BEFORE INSERT
 ON public.corp_private_photo_entries FOR EACH ROW
 EXECUTE FUNCTION corp_private.redline_refuse_removed_photo();
