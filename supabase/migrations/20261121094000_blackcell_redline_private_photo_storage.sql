-- REDLINE private photo uploads, sender-only writes and two-party reads.
-- Applied to production Supabase on 2026-11-21. Idempotent repository record.
-- Existing REDLINE records and other storage buckets are not modified.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('corp-private-photo-ledger','corp-private-photo-ledger',false,12582912,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[])
on conflict (id) do update
set public=false, file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists bc_redline_photo_read_room on storage.objects;
create policy bc_redline_photo_read_room on storage.objects
for select to authenticated
using (
 bucket_id='corp-private-photo-ledger'
 and (select corp_private.photo_ledger_verified())
 and exists (
  select 1 from public.corp_private_photo_rooms r
  where r.id::text=(storage.foldername(name))[1]
  and (r.member_id=(select auth.uid()) or r.owner_id=(select auth.uid()))
 )
);

drop policy if exists bc_redline_photo_upload_sender on storage.objects;
create policy bc_redline_photo_upload_sender on storage.objects
for insert to authenticated
with check (
 bucket_id='corp-private-photo-ledger'
 and (select corp_private.photo_ledger_verified())
 and (storage.foldername(name))[1] is not null
 and split_part(name,'/',3)=''
 and exists (
  select 1 from public.corp_private_photo_rooms r
  where r.id::text=(storage.foldername(name))[1]
   and r.active=true and r.member_id=(select auth.uid())
 )
);

drop policy if exists bc_redline_photo_cleanup_unposted on storage.objects;
create policy bc_redline_photo_cleanup_unposted on storage.objects
for delete to authenticated
using (
 bucket_id='corp-private-photo-ledger'
 and (select corp_private.photo_ledger_verified())
 and exists (
  select 1 from public.corp_private_photo_rooms r
  where r.id::text=(storage.foldername(name))[1] and r.member_id=(select auth.uid())
   and r.active=true
   and not exists (
    select 1 from public.corp_private_photo_entries e
    where e.room_id=r.id and e.image_path=name
   )
 )
);

-- A legacy permissive storage.objects policy grants broad privileges.
-- These additional RESTRICTIVE policies prevent bypassing REDLINE's
-- specific checks while leaving other storage buckets unaffected.

drop policy if exists bc_redline_restrict_read_room on storage.objects;
create policy bc_redline_restrict_read_room on storage.objects as restrictive
for select to public
using (
 bucket_id<>'corp-private-photo-ledger'
 or (
  (select corp_private.photo_ledger_verified())
  and exists (
   select 1 from public.corp_private_photo_rooms r
   where r.id::text=(storage.foldername(name))[1]
    and (r.owner_id=(select auth.uid()) or r.member_id=(select auth.uid()))
  )
 )
);

drop policy if exists bc_redline_restrict_insert_sender on storage.objects;
create policy bc_redline_restrict_insert_sender on storage.objects as restrictive
for insert to public
with check (
 bucket_id<>'corp-private-photo-ledger'
 or (
  (select corp_private.photo_ledger_verified())
  and split_part(name,'/',3)=''
  and exists (
   select 1 from public.corp_private_photo_rooms r
   where r.id::text=(storage.foldername(name))[1]
    and r.active and r.member_id=(select auth.uid())
  )
 )
);

drop policy if exists bc_redline_restrict_no_update on storage.objects;
create policy bc_redline_restrict_no_update on storage.objects as restrictive
for update to public
using (bucket_id<>'corp-private-photo-ledger')
with check (bucket_id<>'corp-private-photo-ledger');

drop policy if exists bc_redline_restrict_delete_unposted on storage.objects;
create policy bc_redline_restrict_delete_unposted on storage.objects as restrictive
for delete to public
using (
 bucket_id<>'corp-private-photo-ledger'
 or (
  (select corp_private.photo_ledger_verified())
  and exists (
   select 1 from public.corp_private_photo_rooms r
   where r.id::text=(storage.foldername(name))[1]
    and r.active and r.member_id=(select auth.uid())
    and not exists (
     select 1 from public.corp_private_photo_entries e
     where e.room_id=r.id and e.image_path=name
    )
  )
 )
);
