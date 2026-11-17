-- BLACKCELL Uniform Intelligence Phase 2: private local visual similarity fingerprints.
-- This is NOT an image embedding and is NOT used to grant publication or infer identity.
-- One owner-scoped 64-bit difference hash per non-restricted photo.
create table if not exists public.corp_uniform_visual_fingerprints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.corp_social_assets(id) on delete cascade,
  algorithm text not null default 'dhash-64-v1' check (algorithm = 'dhash-64-v1'),
  hash64 text not null check (hash64 ~ '^[0-9a-f]{16}$'),
  image_width integer not null check (image_width > 0 and image_width <= 100000),
  image_height integer not null check (image_height > 0 and image_height <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, asset_id, algorithm)
);
create index if not exists corp_uniform_visual_fingerprints_owner_idx
 on public.corp_uniform_visual_fingerprints (owner_id, updated_at desc);
alter table public.corp_uniform_visual_fingerprints enable row level security;

-- All requests must be owner-level seven and an active verified corporate session.
-- No adult-restricted, rejected, or third-party content can be fingerprinted via the Data API.
create policy "bc_visual_fingerprint_owner_read"
 on public.corp_uniform_visual_fingerprints for select to authenticated
 using (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and corp_private.is_owner((select auth.uid()))
  and exists (
   select 1 from public.corp_social_assets a
   where a.id = asset_id and a.owner_id = (select auth.uid()) and a.kind = 'photo'
    and a.purpose in ('library','post') and a.adult_restricted = false
    and a.review_status in ('pending','approved')
  )
 );
create policy "bc_visual_fingerprint_owner_insert"
 on public.corp_uniform_visual_fingerprints for insert to authenticated
 with check (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and corp_private.is_owner((select auth.uid()))
  and exists (
   select 1 from public.corp_social_assets a
   where a.id = asset_id and a.owner_id = (select auth.uid()) and a.kind = 'photo'
    and a.purpose in ('library','post') and a.adult_restricted = false
    and a.review_status in ('pending','approved')
  )
 );
create policy "bc_visual_fingerprint_owner_update"
 on public.corp_uniform_visual_fingerprints for update to authenticated
 using (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and corp_private.is_owner((select auth.uid()))
 )
 with check (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and corp_private.is_owner((select auth.uid()))
  and exists (
   select 1 from public.corp_social_assets a
   where a.id = asset_id and a.owner_id = (select auth.uid()) and a.kind = 'photo'
    and a.purpose in ('library','post') and a.adult_restricted = false
    and a.review_status in ('pending','approved')
  )
 );
grant select,insert,update on public.corp_uniform_visual_fingerprints to authenticated;
revoke all on public.corp_uniform_visual_fingerprints from anon;
comment on table public.corp_uniform_visual_fingerprints is
 'Private owner-only dHash visual similarity memory; best for near-duplicates, not semantic uniform recognition or publication permission.';
