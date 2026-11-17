-- BLACKCELL Gunner Command v1: private goals + exact RLS-respecting aggregate analytics.
-- Database changes were deployed to BLACKCELL and this migration records their source.
create table if not exists public.corp_gunner_collection_goals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 dimension text not null check (dimension in ('country','branch','world','era','pattern')),
 value text not null check (length(trim(value)) between 1 and 90),
 target_count integer not null default 10 check(target_count between 1 and 10000),
 priority smallint not null default 3 check(priority between 1 and 5),
 note text not null default '' check(length(note)<=300),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint corp_gunner_goal_unique unique(owner_id,dimension,value)
);
create index if not exists corp_gunner_goals_owner_enabled
 on public.corp_gunner_collection_goals(owner_id,enabled,priority desc);
alter table public.corp_gunner_collection_goals enable row level security;
revoke all on table public.corp_gunner_collection_goals from public,anon;
grant select,insert,update,delete on table public.corp_gunner_collection_goals to authenticated;

drop policy if exists gunner_goals_owner_delete on public.corp_gunner_collection_goals;
create policy gunner_goals_owner_delete on public.corp_gunner_collection_goals for delete to authenticated using (((owner_id = ( SELECT auth.uid() AS uid)) AND corp_private.social_verified() AND (EXISTS ( SELECT 1
   FROM corp_access_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = 'owner'::text) AND (m.clearance_level = 7))))));

drop policy if exists gunner_goals_owner_insert on public.corp_gunner_collection_goals;
create policy gunner_goals_owner_insert on public.corp_gunner_collection_goals for insert to authenticated with check (((owner_id = ( SELECT auth.uid() AS uid)) AND corp_private.social_verified() AND (EXISTS ( SELECT 1
   FROM corp_access_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = 'owner'::text) AND (m.clearance_level = 7))))));

drop policy if exists gunner_goals_owner_select on public.corp_gunner_collection_goals;
create policy gunner_goals_owner_select on public.corp_gunner_collection_goals for select to authenticated using (((owner_id = ( SELECT auth.uid() AS uid)) AND corp_private.social_verified() AND (EXISTS ( SELECT 1
   FROM corp_access_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = 'owner'::text) AND (m.clearance_level = 7))))));

drop policy if exists gunner_goals_owner_update on public.corp_gunner_collection_goals;
create policy gunner_goals_owner_update on public.corp_gunner_collection_goals for update to authenticated using (((owner_id = ( SELECT auth.uid() AS uid)) AND corp_private.social_verified() AND (EXISTS ( SELECT 1
   FROM corp_access_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = 'owner'::text) AND (m.clearance_level = 7)))))) with check (((owner_id = ( SELECT auth.uid() AS uid)) AND corp_private.social_verified() AND (EXISTS ( SELECT 1
   FROM corp_access_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = 'owner'::text) AND (m.clearance_level = 7))))));

CREATE OR REPLACE FUNCTION public.blackcell_gunner_collection_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 v_uid uuid := (select auth.uid());
 v_status jsonb;
 v_media jsonb;
 v_stream jsonb;
 v_references jsonb;
 v_interest jsonb;
 v_duplicates jsonb;
 v_countries jsonb;
 v_branches jsonb;
 v_worlds jsonb;
 v_eras jsonb;
 v_liked_countries jsonb;
begin
 if v_uid is null or not exists (
   select 1 from public.corp_access_members m
   where m.user_id = v_uid and m.active = true
     and m.role='owner' and m.clearance_level=7
 ) then
  raise exception 'BLACKCELL owner access required' using errcode='42501';
 end if;
 v_status := public.corp_code_status();
 if coalesce((v_status->>'verified')::boolean,false) is not true
   or coalesce((v_status->>'ok')::boolean,false) is not true then
  raise exception 'BLACKCELL corporate verification required' using errcode='42501';
 end if;

 select jsonb_build_object(
  'total',count(*),
  'photos',count(*) filter(where a.kind='photo'),
  'videos',count(*) filter(where a.kind='video'),
  'approved',count(*) filter(where a.review_status='approved'),
  'pending',count(*) filter(where a.review_status='pending'),
  'rejected',count(*) filter(where a.review_status='rejected'),
  'missing_country',count(*) filter(where a.kind in ('photo','video') and (nullif(trim(a.military_country_code),'') is null or a.military_country_code='ZZ')),
  'missing_branch',count(*) filter(where a.kind in ('photo','video') and (nullif(trim(a.military_branch),'') is null or a.military_branch='Unspecified')),
  'missing_era',count(*) filter(where a.kind in ('photo','video') and nullif(trim(a.military_era),'') is null),
  'uploaded_week',count(*) filter(where a.created_at >= now()-interval '7 days'),
  'adult_restricted',count(*) filter(where a.adult_restricted=true)
 )
 into v_media
 from public.corp_social_assets a
 where a.kind in ('photo','video');

 select jsonb_build_object(
   'total',count(*),
   'approved',count(*) filter(where v.review_status='approved'),
   'pending',count(*) filter(where v.review_status='pending'),
   'adult_restricted',count(*) filter(where v.adult_restricted=true)
 ) into v_stream from public.corp_stream_videos v;

 select jsonb_build_object(
   'verified',count(*) filter(where r.reference_status='verified'),
   'draft',count(*) filter(where r.reference_status='draft'),
   'countries',count(distinct nullif(r.country_code,'')) filter(where r.reference_status='verified'),
   'uniforms',count(distinct nullif(r.uniform_name,'')) filter(where r.reference_status='verified'),
   'patterns',count(distinct nullif(r.camouflage_pattern,'')) filter(where r.reference_status='verified'),
   'video_frames',count(*) filter(where r.reference_status='verified' and r.source_kind='stream_video')
 ) into v_references
 from public.corp_uniform_training_references r where r.owner_id=v_uid;

 select jsonb_build_object(
    'favorites',(select count(*) from public.corp_social_photo_favorites f where f.user_id=v_uid),
    'rated',(select count(*) from public.corp_social_photo_tastes t where t.user_id=v_uid),
    'positive_ratings',(select count(*) from public.corp_social_photo_tastes t where t.user_id=v_uid and t.rating>=4),
    'negative_ratings',(select count(*) from public.corp_social_photo_tastes t where t.user_id=v_uid and t.rating<=2),
    'engaged_views',(select coalesce(sum(g.engaged_views),0) from public.corp_social_photo_rediscovery g where g.user_id=v_uid),
    'zoom_engagements',(select coalesce(sum(g.zoom_engaged_views),0) from public.corp_social_photo_rediscovery g where g.user_id=v_uid),
    'ai_analyzed',(select count(*) from public.corp_social_ai_analysis a where a.owner_id=v_uid),
    'ai_suggested',(select count(*) from public.corp_social_ai_analysis a where a.owner_id=v_uid and a.status='suggested')
 ) into v_interest;

 select jsonb_build_object('exact_duplicate_groups',count(*),'extra_copies',coalesce(sum(n-1),0))
 into v_duplicates
 from (
  select count(*) as n
  from public.corp_social_photo_fingerprints f
  where nullif(f.sha256,'') is not null
  group by f.sha256
  having count(*)>1
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object('code',x.code,'count',x.n) order by x.n desc,x.code),'[]'::jsonb)
 into v_countries
 from (
  select upper(a.military_country_code) as code,count(*) n
  from public.corp_social_assets a
  where a.kind in ('photo','video') and a.review_status<>'rejected'
   and nullif(trim(a.military_country_code),'') is not null and a.military_country_code<>'ZZ'
  group by upper(a.military_country_code) order by n desc,code limit 250
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object('branch',x.branch,'count',x.n) order by x.n desc,x.branch),'[]'::jsonb)
 into v_branches
 from (
  select a.military_branch as branch,count(*) n
  from public.corp_social_assets a
  where a.kind in ('photo','video') and a.review_status<>'rejected'
   and a.military_branch not in ('Unspecified','') and a.military_branch is not null
  group by a.military_branch order by n desc,branch limit 130
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object('world',x.world,'count',x.n) order by x.n desc,x.world),'[]'::jsonb)
 into v_worlds
 from (
  select substring(tag from '^maf:(military|police|fire|medical|security|professional|unsorted)$') as world, count(*) n
  from public.corp_social_assets a cross join lateral unnest(coalesce(a.military_tags,'{}'::text[])) tag
  where a.kind in ('photo','video') and a.review_status<>'rejected'
    and tag ~ '^maf:(military|police|fire|medical|security|professional|unsorted)$'
  group by world order by n desc,world
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object('era',x.era,'count',x.n) order by x.n desc,x.era),'[]'::jsonb)
 into v_eras
 from (
  select a.military_era as era,count(*) n
  from public.corp_social_assets a
  where a.kind in ('photo','video') and a.review_status<>'rejected'
   and nullif(trim(a.military_era),'') is not null
  group by a.military_era order by n desc,era limit 100
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object('code',x.code,'votes',x.n) order by x.n desc,x.code),'[]'::jsonb)
 into v_liked_countries
 from (
  select upper(a.military_country_code) as code,count(*) n
  from public.corp_social_photo_tastes t
  join public.corp_social_assets a on a.id=t.asset_id
  where t.user_id=v_uid and t.rating>=4 and nullif(trim(a.military_country_code),'') is not null
  group by upper(a.military_country_code) order by n desc,code limit 12
 ) x;

 return jsonb_build_object(
   'generated_at',now(),
   'scope','Authenticated BLACKCELL-visible catalog records; counts may overlap across independent stream and asset tables',
   'media',coalesce(v_media,'{}'::jsonb),
   'stream',coalesce(v_stream,'{}'::jsonb),
   'references',coalesce(v_references,'{}'::jsonb),
   'interest',coalesce(v_interest,'{}'::jsonb),
   'duplicates',coalesce(v_duplicates,'{}'::jsonb),
   'countries',coalesce(v_countries,'[]'::jsonb),
   'branches',coalesce(v_branches,'[]'::jsonb),
   'worlds',coalesce(v_worlds,'[]'::jsonb),
   'eras',coalesce(v_eras,'[]'::jsonb),
   'liked_countries',coalesce(v_liked_countries,'[]'::jsonb)
 );
end
$function$;
revoke all on function public.blackcell_gunner_collection_stats() from public,anon;
grant execute on function public.blackcell_gunner_collection_stats() to authenticated;
