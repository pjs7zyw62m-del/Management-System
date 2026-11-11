-- BLACKCELL NETWORK: photo/video intake gate. Does not delete existing files.
-- Existing rows remain approved; future library and post media start pending.
alter table public.corp_social_assets
 add column if not exists review_status text not null default 'approved',
 add column if not exists adult_restricted boolean not null default false,
 add column if not exists rights_confirmed boolean not null default false,
 add column if not exists ages_confirmed boolean not null default false,
 add column if not exists source_provider text not null default 'manual',
 add column if not exists reviewed_at timestamptz,
 add column if not exists reviewed_by uuid references auth.users(id);

alter table public.corp_social_assets
 drop constraint if exists corp_social_assets_review_status_valid;
alter table public.corp_social_assets
 add constraint corp_social_assets_review_status_valid
 check (review_status in ('pending','approved','rejected'));
alter table public.corp_social_assets
 drop constraint if exists corp_social_assets_source_provider_length;
alter table public.corp_social_assets
 add constraint corp_social_assets_source_provider_length
 check (length(source_provider) between 1 and 70);

create or replace function corp_private.corp_media_intake_guard()
returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if TG_OP='INSERT' then
  if NEW.purpose in ('library','post') then
   NEW.review_status:='pending';
   NEW.reviewed_at:=null; NEW.reviewed_by:=null;
   NEW.rights_confirmed:=false; NEW.ages_confirmed:=false;
  end if;
  return NEW;
 end if;
 -- Immutable storage and ownership across all asset edits.
 if NEW.id is distinct from OLD.id or NEW.owner_id is distinct from OLD.owner_id
   or NEW.storage_path is distinct from OLD.storage_path
   or NEW.purpose is distinct from OLD.purpose or NEW.kind is distinct from OLD.kind
 then
  raise exception 'Media identity, storage path and ownership are immutable';
 end if;
 if NEW.review_status is distinct from OLD.review_status
  or NEW.adult_restricted is distinct from OLD.adult_restricted
  or NEW.rights_confirmed is distinct from OLD.rights_confirmed
  or NEW.ages_confirmed is distinct from OLD.ages_confirmed
  or NEW.reviewed_by is distinct from OLD.reviewed_by
  or NEW.reviewed_at is distinct from OLD.reviewed_at
 then
  if not corp_private.social_verified() or not corp_private.is_owner((select auth.uid())) then
   raise exception 'Only a verified BLACKCELL Level 7 owner may change media approval or restriction';
  end if;
  if NEW.review_status='approved' and OLD.review_status <> 'approved' then
   if not NEW.rights_confirmed then
    raise exception 'Rights and consent review is required before approval';
   end if;
   if NEW.adult_restricted and not NEW.ages_confirmed then
    raise exception 'Adult-only material requires a verified-age review declaration';
   end if;
   NEW.reviewed_at:=now();
   NEW.reviewed_by:=(select auth.uid());
  end if;
 end if;
 return NEW;
end $body$;

drop trigger if exists trg_corp_media_intake_guard on public.corp_social_assets;
create trigger trg_corp_media_intake_guard
before insert or update on public.corp_social_assets
for each row execute function corp_private.corp_media_intake_guard();

-- Pending media and all adult-restricted media are owner/admin only.
drop policy if exists corp_social_assets_read on public.corp_social_assets;
create policy corp_social_assets_read on public.corp_social_assets
for select to authenticated
using (
 corp_private.social_verified() and corp_private.social_member_active(owner_id)
 and (
  (review_status='approved' and adult_restricted=false)
  or owner_id=(select auth.uid())
  or corp_private.is_owner((select auth.uid()))
 )
);
drop policy if exists corp_social_asset_admin_review on public.corp_social_assets;
create policy corp_social_asset_admin_review on public.corp_social_assets
for update to authenticated
using (
 purpose in ('library','post') and corp_private.social_verified()
 and corp_private.is_owner((select auth.uid()))
)
with check (
 purpose in ('library','post') and corp_private.social_verified()
 and corp_private.is_owner((select auth.uid()))
);

-- Supabase Storage signed URLs must obey identical pending/adult restrictions.
drop policy if exists corp_social_media_read on storage.objects;
create policy corp_social_media_read on storage.objects
for select to authenticated
using (
 bucket_id='corp-social-media' and corp_private.social_verified()
 and exists (
  select 1 from public.corp_social_assets a
  where a.storage_path=objects.name and corp_private.social_member_active(a.owner_id)
   and (
     (a.review_status='approved' and a.adult_restricted=false)
     or a.owner_id=(select auth.uid())
     or corp_private.is_owner((select auth.uid()))
   )
 )
);
-- An album association must not leak pending/adult-restricted media to members.
drop policy if exists corp_album_items_member_read on public.corp_social_album_items;
create policy corp_album_items_member_read on public.corp_social_album_items
for select to authenticated
using (
 corp_private.social_verified()
 and exists(
  select 1 from public.corp_social_albums al
  where al.id=album_id and corp_private.social_member_active(al.owner_id)
 )
 and exists(
  select 1 from public.corp_social_assets a
  where a.id=asset_id and
   ((a.review_status='approved' and a.adult_restricted=false)
    or a.owner_id=(select auth.uid())
    or corp_private.is_owner((select auth.uid())))
 )
);
-- Permit authenticated users to continue reading/writing under RLS as before.
-- A separate owner-only review UI controls approval transitions.
