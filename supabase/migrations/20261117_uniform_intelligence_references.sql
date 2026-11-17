-- BLACKCELL Uniform Intelligence: private owner-maintained visual references.
-- Independent of review_status: verifying a reference NEVER publishes its source.
create table if not exists public.corp_uniform_training_references (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_kind text not null check (source_kind in ('asset','stream_video')),
 source_id uuid not null,
 frame_seconds integer not null default 0 check(frame_seconds between 0 and 864000),
 world text not null default 'unsorted' check(world in ('military','police','fire','medical','security','professional','unsorted')),
 country_code text not null default '' check(country_code='' or country_code ~ '^[A-Z]{2}$'),
 branch text not null default 'Unspecified' check(length(branch) between 1 and 70),
 category text not null default 'Unsorted' check(length(category) between 1 and 80),
 uniform_name text not null default '' check(length(uniform_name)<=160),
 era text not null default '' check(length(era)<=90),
 visual_evidence text not null default '' check(length(visual_evidence)<=1200),
 lookalike_country text not null default '' check(lookalike_country='' or lookalike_country ~ '^[A-Z]{2}$'),
 lookalike_branch text not null default '' check(length(lookalike_branch)<=70),
 distinguishing_features text not null default '' check(length(distinguishing_features)<=1000),
 tags text[] not null default '{}'::text[],
 reference_status text not null default 'draft' check(reference_status in ('draft','verified')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint bc_uniform_ref_unique unique(owner_id,source_kind,source_id,frame_seconds),
 constraint bc_uniform_ref_military_branch check(world='military' or branch='Unspecified'),
 constraint bc_uniform_ref_verified_evidence check(reference_status='draft' or (world<>'unsorted' and length(trim(visual_evidence))>=15))
);
create index if not exists bc_uniform_ref_owner_status_idx on public.corp_uniform_training_references(owner_id,reference_status,updated_at desc);
create index if not exists bc_uniform_ref_lookup_idx on public.corp_uniform_training_references(reference_status,world,country_code,branch);
alter table public.corp_uniform_training_references enable row level security;
revoke all on public.corp_uniform_training_references from public,anon;
grant select,insert,update,delete on public.corp_uniform_training_references to authenticated;
create policy bc_uniform_ref_owner_read on public.corp_uniform_training_references
 for select to authenticated
 using (owner_id=(select auth.uid()) and corp_private.social_verified()
  and exists(select 1 from public.corp_access_members m
   where m.user_id=(select auth.uid()) and m.active=true and m.role='owner' and m.clearance_level=7));
create policy bc_uniform_ref_owner_create on public.corp_uniform_training_references
 for insert to authenticated
 with check (owner_id=(select auth.uid()) and corp_private.social_verified()
  and exists(select 1 from public.corp_access_members m
   where m.user_id=(select auth.uid()) and m.active=true and m.role='owner' and m.clearance_level=7)
  and ((source_kind='asset' and exists(select 1 from public.corp_social_assets a
    where a.id=source_id and a.kind in ('photo','video') and a.review_status<>'rejected'))
    or (source_kind='stream_video' and exists(select 1 from public.corp_stream_videos v
     where v.id=source_id and v.review_status<>'rejected'))));
create policy bc_uniform_ref_owner_update on public.corp_uniform_training_references
 for update to authenticated
 using (owner_id=(select auth.uid()) and corp_private.social_verified()
  and exists(select 1 from public.corp_access_members m where m.user_id=(select auth.uid()) and m.active=true and m.role='owner' and m.clearance_level=7))
 with check(owner_id=(select auth.uid()) and corp_private.social_verified()
  and exists(select 1 from public.corp_access_members m where m.user_id=(select auth.uid()) and m.active=true and m.role='owner' and m.clearance_level=7)
  and ((source_kind='asset' and exists(select 1 from public.corp_social_assets a
    where a.id=source_id and a.kind in ('photo','video') and a.review_status<>'rejected'))
    or (source_kind='stream_video' and exists(select 1 from public.corp_stream_videos v
     where v.id=source_id and v.review_status<>'rejected'))));
create policy bc_uniform_ref_owner_delete on public.corp_uniform_training_references
 for delete to authenticated
 using (owner_id=(select auth.uid()) and corp_private.social_verified()
  and exists(select 1 from public.corp_access_members m where m.user_id=(select auth.uid()) and m.active=true and m.role='owner' and m.clearance_level=7));