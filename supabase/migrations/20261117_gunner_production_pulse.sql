-- Owner-only, read-only 14-day production pulse for BLACKCELL Gunner Command.
-- Counts photo/video *asset* rows only; stream records can overlap and are intentionally
-- excluded from these pacing numbers. Uploaded files are not necessarily unique,
-- verified, rights-confirmed or published. No billing claims are made.
create or replace function public.blackcell_gunner_production_pulse()
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
 v_uid uuid := (select auth.uid());
 v_status jsonb;
 v_days jsonb;
 v_summary jsonb;
begin
 if v_uid is null or not exists (
   select 1 from public.corp_access_members m
   where m.user_id = v_uid and m.active = true
    and m.role = 'owner' and m.clearance_level = 7
 ) then
   raise exception 'BLACKCELL owner access required' using errcode = '42501';
 end if;
 v_status := public.corp_code_status();
 if coalesce((v_status->>'verified')::boolean,false) is not true
    or coalesce((v_status->>'ok')::boolean,false) is not true then
   raise exception 'BLACKCELL corporate verification required' using errcode = '42501';
 end if;

 with days as (
   select gs::date as d from generate_series(
     ((now() at time zone 'America/Los_Angeles')::date - 13)::timestamp,
     (now() at time zone 'America/Los_Angeles')::date::timestamp,
     interval '1 day'
   ) gs
 ), recent as (
   select (a.created_at at time zone 'America/Los_Angeles')::date as d,
     count(*) filter (where a.kind = 'photo')::int as photos,
     count(*) filter (where a.kind = 'video')::int as videos,
     coalesce(sum(greatest(coalesce(a.bytes,0),0)),0)::bigint as bytes,
     count(*) filter(where a.review_status='approved')::int as approved,
     count(*) filter(where a.review_status='pending')::int as pending
   from public.corp_social_assets a
   where a.owner_id = v_uid and a.kind in ('photo','video')
     and a.purpose in ('post','library')
     and a.created_at >= ((now() at time zone 'America/Los_Angeles')::date - 13)::timestamp
                         at time zone 'America/Los_Angeles'
     and a.created_at < (((now() at time zone 'America/Los_Angeles')::date + 1)::timestamp
                         at time zone 'America/Los_Angeles')
   group by 1
 ), totals as (
   select d.d,coalesce(r.photos,0) as photos,coalesce(r.videos,0) as videos,
     coalesce(r.bytes,0) as bytes,coalesce(r.approved,0) as approved,
     coalesce(r.pending,0) as pending
   from days d left join recent r on r.d = d.d
 )
 select
   jsonb_agg(jsonb_build_object('day',d::text,'photos',photos,'videos',videos) order by d),
   jsonb_build_object(
    'photos_14d',sum(photos),'videos_14d',sum(videos),
    'photos_last_7d',sum(photos) filter (where d >= (now() at time zone 'America/Los_Angeles')::date - 6),
    'photos_prior_7d',sum(photos) filter (where d < (now() at time zone 'America/Los_Angeles')::date - 6),
    'videos_last_7d',sum(videos) filter (where d >= (now() at time zone 'America/Los_Angeles')::date - 6),
    'videos_prior_7d',sum(videos) filter (where d < (now() at time zone 'America/Los_Angeles')::date - 6),
    'bytes_14d',sum(bytes),
    'approved_14d',sum(approved),'pending_14d',sum(pending),
    'active_days_14d',count(*) filter(where photos + videos > 0),
    'photos_today',sum(photos) filter(where d=(now() at time zone 'America/Los_Angeles')::date),
    'videos_today',sum(videos) filter(where d=(now() at time zone 'America/Los_Angeles')::date)
   )
 into v_days,v_summary
 from totals;

 return jsonb_build_object(
  'generated_at',now(),
  'timezone','America/Los_Angeles',
  'scope','Owner-authorized 14-day uploaded asset records; exact duplicates not excluded; stream may contain overlapping videos',
  'daily',coalesce(v_days,'[]'::jsonb),
  'summary',coalesce(v_summary,'{}'::jsonb),
  'billing_connected',false,
  'automatic_spending_enabled',false
 );
end
$function$;

revoke all on function public.blackcell_gunner_production_pulse() from public,anon;
grant execute on function public.blackcell_gunner_production_pulse() to authenticated;
