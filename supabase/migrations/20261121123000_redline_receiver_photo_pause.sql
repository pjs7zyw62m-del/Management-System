-- REDLINE: receiver-controlled pause for NEW sender photographs only.
-- Existing chat, photos, prices and timer records are left untouched.
ALTER TABLE public.corp_private_photo_rooms
  ADD COLUMN IF NOT EXISTS photo_sending_paused boolean NOT NULL DEFAULT false;

-- RLS continues to restrict room UPDATE to the verified owner.
-- Defend entry creation separately from the client-side form and storage API.
CREATE OR REPLACE FUNCTION corp_private.redline_block_paused_photo_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.corp_private_photo_rooms r
    WHERE r.id = NEW.room_id AND r.photo_sending_paused
  ) THEN
    RAISE EXCEPTION 'The receiver has paused new photo sending'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION corp_private.redline_block_paused_photo_entry()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS redline_block_paused_photo_entry
  ON public.corp_private_photo_entries;
CREATE TRIGGER redline_block_paused_photo_entry
BEFORE INSERT ON public.corp_private_photo_entries
FOR EACH ROW EXECUTE FUNCTION corp_private.redline_block_paused_photo_entry();

-- Both existing permissive storage INSERT policies must deny this bucket when
-- its receiver pauses; changing only one would leave the other OR branch open.
ALTER POLICY bc_redline_photo_upload_sender ON storage.objects
WITH CHECK (
  bucket_id = 'corp-private-photo-ledger'
  AND (SELECT corp_private.photo_ledger_verified())
  AND (storage.foldername(name))[1] IS NOT NULL
  AND split_part(name, '/', 3) = ''
  AND EXISTS (
    SELECT 1 FROM public.corp_private_photo_rooms r
    WHERE r.id::text = (storage.foldername(name))[1]
      AND r.active = true
      AND NOT r.photo_sending_paused
      AND r.member_id = (SELECT auth.uid())
  )
);
ALTER POLICY bc_redline_restrict_insert_sender ON storage.objects
WITH CHECK (
  bucket_id <> 'corp-private-photo-ledger'
  OR (
    (SELECT corp_private.photo_ledger_verified())
    AND split_part(name, '/', 3) = ''
    AND EXISTS (
      SELECT 1 FROM public.corp_private_photo_rooms r
      WHERE r.id::text = (storage.foldername(name))[1]
        AND r.active
        AND NOT r.photo_sending_paused
        AND r.member_id = (SELECT auth.uid())
    )
  )
);
