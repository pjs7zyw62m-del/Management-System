-- BLACKCELL iCloud import: run with PRIVILEGED Supabase SQL access after
-- the remote copy finishes. Review counts before the INSERT and confirm the
-- owner UUID is correct. This DOES NOT fetch or delete any file.
-- Replace only the owner's UUID value below.
--
-- Preview candidate counts:
WITH settings AS (
 SELECT '<BLACKCELL_OWNER_UUID>'::uuid AS owner_uuid
)
SELECT COUNT(*) AS eligible_import_objects,
       COALESCE(SUM((o.metadata->>'size')::bigint),0) AS bytes
FROM storage.objects o CROSS JOIN settings s
WHERE o.bucket_id='corp-social-media'
  AND o.name LIKE s.owner_uuid::text || '/icloud-import/%'
  AND (o.metadata->>'mimetype') IN (
    'image/jpeg','image/png','image/webp','image/gif','image/heic',
    'video/mp4','video/webm','video/quicktime','video/x-m4v')
  AND (o.metadata->>'size')::bigint BETWEEN 1 AND 47185920;

-- After reviewing the preview, run this INSERT (idempotent by path).
-- CAUTION: S3 uploads alone do not create BLACKCELL gallery rows.
WITH settings AS (
 SELECT '<BLACKCELL_OWNER_UUID>'::uuid AS owner_uuid
), found AS (
 SELECT o.name, (o.metadata->>'size')::bigint AS bytes,
        (o.metadata->>'mimetype')::text AS mime_type,
        s.owner_uuid
 FROM storage.objects o CROSS JOIN settings s
 WHERE o.bucket_id='corp-social-media'
   AND o.name LIKE s.owner_uuid::text || '/icloud-import/%'
   AND (o.metadata->>'mimetype') IN (
     'image/jpeg','image/png','image/webp','image/gif','image/heic',
     'video/mp4','video/webm','video/quicktime','video/x-m4v')
   AND (o.metadata->>'size')::bigint BETWEEN 1 AND 47185920
)
INSERT INTO public.corp_social_assets
 (id,owner_id,post_id,purpose,kind,mime_type,filename,storage_path,bytes)
SELECT gen_random_uuid(),owner_uuid,NULL,'library',
       CASE WHEN mime_type LIKE 'image/%' THEN 'photo' ELSE 'video' END,
       mime_type,LEFT(regexp_replace(name,'^.*/',''),180),name,bytes
FROM found
ON CONFLICT (storage_path) DO NOTHING;
