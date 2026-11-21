-- Private BLACKCELL OS wallpaper storage. Already installed on the live NEXUS Supabase project.
-- Idempotent because deployment histories may replay it.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('blackcell-os-wallpapers','blackcell-os-wallpapers',false,8388608,
array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif'])
on conflict (id) do nothing;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bc_os_wallpaper_select_own') then
  create policy "bc_os_wallpaper_select_own" on storage.objects for select to authenticated
  using(bucket_id='blackcell-os-wallpapers' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bc_os_wallpaper_insert_own') then
  create policy "bc_os_wallpaper_insert_own" on storage.objects for insert to authenticated
  with check(bucket_id='blackcell-os-wallpapers' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bc_os_wallpaper_update_own') then
  create policy "bc_os_wallpaper_update_own" on storage.objects for update to authenticated
  using(bucket_id='blackcell-os-wallpapers' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check(bucket_id='blackcell-os-wallpapers' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bc_os_wallpaper_delete_own') then
  create policy "bc_os_wallpaper_delete_own" on storage.objects for delete to authenticated
  using(bucket_id='blackcell-os-wallpapers' and (storage.foldername(name))[1]=(select auth.uid())::text);
 end if;
end $$;
