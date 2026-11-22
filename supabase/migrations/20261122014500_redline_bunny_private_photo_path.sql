-- REDLINE private Bunny-only new photo uploads.
-- Preserve all legacy records and constraints; do not touch storage objects.
-- The previous INSERT RLS policy accepted only "{room}/{id}.{ext}" and would
-- silently block verified Bunny files from the new redline/v1 namespace.
ALTER TABLE public.corp_private_photo_entries
 DROP CONSTRAINT IF EXISTS corp_photo_path_format;
ALTER TABLE public.corp_private_photo_entries
 ADD CONSTRAINT corp_photo_path_format CHECK (
  image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|heic|heif)$'
  OR image_path ~ '^redline/v1/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|heic|heif)$'
 );
DROP POLICY IF EXISTS corp_photo_entries_member_bunny_upload
 ON public.corp_private_photo_entries;
CREATE POLICY corp_photo_entries_member_bunny_upload
 ON public.corp_private_photo_entries
 FOR INSERT TO authenticated
 WITH CHECK (
  corp_private.photo_ledger_verified()
  AND uploaded_by = (SELECT auth.uid())
  AND decision_status = 'pending'
  AND decided_at IS NULL
  AND amount_cents IS NULL
  AND priced_at IS NULL
  AND settled_at IS NULL
  -- Path must be EXACTLY this sender's room and photo ID, with an
  -- approved extension. This never authorizes writes to another room.
  AND image_path ~ (
   '^redline/v1/' || room_id::text || '/' || uploaded_by::text || '/' ||
   id::text || '[.](jpg|png|webp|heic|heif)$'
  )
  AND EXISTS (
   SELECT 1 FROM public.corp_private_photo_rooms r
   WHERE r.id = room_id AND r.active
    AND r.member_id = (SELECT auth.uid())
    AND r.photo_sending_paused IS NOT TRUE
  )
 );
-- The existing legacy photo INSERT policy and immutable price-history
-- triggers remain unchanged. No archived photos are deleted or altered.
