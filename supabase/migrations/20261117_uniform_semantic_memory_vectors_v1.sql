-- BLACKCELL Uniform Intelligence semantic similarity v1.
-- Semantic vectors are derived from EXISTING private AI visual descriptions, not original image bytes.
-- Protected by BLACKCELL owner Level-7 verification and source-media RLS.
-- This NEVER authorizes publication, establishes identity, or proves a country's uniform.

create table if not exists public.corp_uniform_semantic_vectors (
  asset_id uuid primary key references public.corp_social_assets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  embedding extensions.vector(512) not null,
  model text not null default 'text-embedding-3-small' check (model = 'text-embedding-3-small'),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  source_summary text not null check (char_length(source_summary) between 1 and 2200),
  uniform_world text not null default 'unsorted',
  updated_at timestamptz not null default now()
);
create index if not exists corp_uniform_semantic_vectors_owner_idx
 on public.corp_uniform_semantic_vectors (owner_id, updated_at desc);
alter table public.corp_uniform_semantic_vectors enable row level security;

create policy "bc_semantic_owner_read" on public.corp_uniform_semantic_vectors
 for select to authenticated
 using (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and corp_private.is_owner((select auth.uid()))
  and exists (
   select 1 from public.corp_social_assets a
   where a.id = asset_id and a.owner_id = (select auth.uid())
    and a.kind = 'photo' and a.purpose in ('library','post')
    and a.adult_restricted = false and a.review_status in ('pending','approved')
  )
 );

create policy "bc_semantic_owner_insert" on public.corp_uniform_semantic_vectors
 for insert to authenticated
 with check (
  owner_id = (select auth.uid())
  and corp_private.social_verified()
  and corp_private.is_owner((select auth.uid()))
  and exists (
   select 1 from public.corp_social_assets a
   where a.id = asset_id and a.owner_id = (select auth.uid())
    and a.kind = 'photo' and a.purpose in ('library','post')
    and a.adult_restricted = false and a.review_status in ('pending','approved')
  )
 );

create policy "bc_semantic_owner_update" on public.corp_uniform_semantic_vectors
 for update to authenticated
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
   where a.id = asset_id and a.owner_id = (select auth.uid())
    and a.kind = 'photo' and a.purpose in ('library','post')
    and a.adult_restricted = false and a.review_status in ('pending','approved')
  )
 );

grant select,insert,update on public.corp_uniform_semantic_vectors to authenticated;
revoke all on public.corp_uniform_semantic_vectors from anon;

-- SECURITY INVOKER + RLS on both source and matched records; cannot scan another owner's library.
create or replace function public.bc_uniform_semantic_neighbors(
  p_asset_id uuid,
  p_max_results integer default 12
) returns table (
  asset_id uuid,
  filename text,
  uniform_world text,
  similarity double precision
)
language sql stable security invoker set search_path = public, extensions
as $$
  with source as (
    select v.owner_id, v.embedding
      from public.corp_uniform_semantic_vectors v
     where v.asset_id = p_asset_id and v.owner_id = (select auth.uid())
  )
  select v.asset_id, coalesce(a.filename,'Media')::text, v.uniform_world,
         (1.0 - (v.embedding <=> s.embedding))::double precision as similarity
  from source s
  join public.corp_uniform_semantic_vectors v on v.owner_id=s.owner_id
  join public.corp_social_assets a on a.id=v.asset_id
  where v.asset_id <> p_asset_id
    and a.owner_id = (select auth.uid())
    and a.kind = 'photo' and a.purpose in ('library','post')
    and a.adult_restricted = false and a.review_status in ('pending','approved')
    and corp_private.is_owner((select auth.uid()))
  order by v.embedding <=> s.embedding
  limit least(greatest(coalesce(p_max_results,12),1),24);
$$;
revoke all on function public.bc_uniform_semantic_neighbors(uuid,integer) from public, anon;
grant execute on function public.bc_uniform_semantic_neighbors(uuid,integer) to authenticated;

comment on table public.corp_uniform_semantic_vectors is
 'Owner-scoped cosine vectors of previously stored uniform visual descriptions; not raw image embeddings, media duplication, or publication decisions.';
