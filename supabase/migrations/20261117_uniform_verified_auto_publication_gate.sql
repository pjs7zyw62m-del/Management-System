-- BLACKCELL 100% verification checklist, distinct from AI confidence.
create table if not exists public.corp_uniform_auto_publication_events (
 id bigint generated always as identity primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 asset_id uuid not null references public.corp_social_assets(id) on delete cascade,
 readiness integer not null check(readiness=100),
 action text not null check(action='auto_approved'),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.corp_uniform_auto_publication_events enable row level security;
revoke all on public.corp_uniform_auto_publication_events from public,anon;
grant select,insert on public.corp_uniform_auto_publication_events to authenticated;
drop policy if exists bc_uniform_auto_pub_owner_select on public.corp_uniform_auto_publication_events;
create policy bc_uniform_auto_pub_owner_select on public.corp_uniform_auto_publication_events
 for select to authenticated using(owner_id=(select auth.uid()) and corp_private.social_verified()
 and exists(select 1 from public.corp_access_members m
 where m.user_id=(select auth.uid()) and m.active and m.role='owner' and m.clearance_level=7));
drop policy if exists bc_uniform_auto_pub_owner_insert on public.corp_uniform_auto_publication_events;
create policy bc_uniform_auto_pub_owner_insert on public.corp_uniform_auto_publication_events
 for insert to authenticated with check(owner_id=(select auth.uid()) and corp_private.social_verified()
 and exists(select 1 from public.corp_access_members m
 where m.user_id=(select auth.uid()) and m.active and m.role='owner' and m.clearance_level=7));
CREATE OR REPLACE FUNCTION public.blackcell_uniform_auto_publish_100(p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 uid uuid := (select auth.uid());
 access jsonb;
 photo public.corp_social_assets%rowtype;
 ai public.corp_social_ai_analysis%rowtype;
 ref public.corp_uniform_training_references%rowtype;
 world text := '';
 rights_ok boolean := false;
 safe_ok boolean := false;
 ai_ok boolean := false;
 ref_ok boolean := false;
 route_ok boolean := false;
 readiness integer := 0;
 album_id uuid;
 album_title text;
begin
 if uid is null or not exists(select 1 from public.corp_access_members m
   where m.user_id=uid and m.active=true and m.role='owner' and m.clearance_level=7) then
  raise exception 'Verified Level 7 owner required' using errcode='42501';
 end if;
 access:=public.corp_code_status();
 if coalesce((access->>'verified')::boolean,false) is not true
 or coalesce((access->>'ok')::boolean,false) is not true then
  raise exception 'Corporate Access verification required' using errcode='42501';
 end if;
 select a.* into photo from public.corp_social_assets a
  where a.id=p_asset_id and a.owner_id=uid for update;
 if not found then return jsonb_build_object('ok',false,'approved',false,'readiness',0,'reason','asset_not_found');end if;
 if photo.kind<>'photo' or photo.purpose<>'library'
 or photo.source_provider<>'world-bunny-v1' or photo.review_status<>'pending' then
  return jsonb_build_object('ok',true,'approved',false,'readiness',0,'reason','not_pending_world_photo');end if;
 select x.* into ai from public.corp_social_ai_analysis x
  where x.asset_id=photo.id and x.owner_id=uid and x.status='suggested' limit 1;
 select r.* into ref from public.corp_uniform_training_references r
  where r.owner_id=uid and r.source_kind='asset' and r.source_id=photo.id
   and r.frame_seconds=0 and r.reference_status='verified' limit 1;
 select substring(t from '^maf:(military|police|fire|medical|security|professional)$')
 into world from unnest(coalesce(ai.tags,'{}'::text[])) t
 where t ~ '^maf:(military|police|fire|medical|security|professional)$'
 limit 1;
 rights_ok:=photo.rights_confirmed is true;
 safe_ok:=photo.adult_restricted is false and ai.id is not null and ai.nudity_level='none';
 ai_ok:=ai.id is not null and ai.confidence='high' and world is not null
  and ai.military_category not in ('Unsorted','')
  and (world<>'military' or
    (ai.country_code ~ '^[A-Z]{2}$' and ai.military_branch<>'Unspecified'));
 ref_ok:=ref.id is not null and ref.world=world
  and ref.country_code=ai.country_code and ref.branch=ai.military_branch
  and ref.category=ai.military_category and ref.world<>'unsorted'
  and length(trim(ref.visual_evidence))>=15
  and (ref.camouflage_pattern='' or ref.camouflage_pattern=ai.camouflage_pattern)
  and (ref.uniform_name='' or ref.uniform_name=ai.uniform_type);
 route_ok:=ai_ok and ref_ok
  and (select count(*) from unnest(coalesce(ai.tags,'{}'::text[])) t
       where t ~ '^maf:(military|police|fire|medical|security|professional|unsorted)$')=1
  and (world<>'military' or (ref.country_code<>'' and ref.branch<>'Unspecified'));
 readiness:=(case when rights_ok then 20 else 0 end)
   +(case when safe_ok then 20 else 0 end)
   +(case when ai_ok then 20 else 0 end)
   +(case when ref_ok then 20 else 0 end)
   +(case when route_ok then 20 else 0 end);
 if readiness<100 then
  return jsonb_build_object('ok',true,'approved',false,'readiness',readiness,
    'reason','owner_approval_required','checks',
    jsonb_build_object('rights',rights_ok,'non_restricted',safe_ok,
     'ai_high_and_complete',ai_ok,'owner_verified_same_photo_reference',ref_ok,
     'valid_destination',route_ok),
    'notice','Readiness is an independent verification checklist, not AI accuracy probability.');
 end if;
 select a.id into album_id from public.corp_social_albums a
  where a.owner_id=uid and a.military_country_code=ref.country_code
   and a.military_branch=ref.branch and a.military_category=ref.category
   and ('maf:'||ref.world)=any(a.military_tags)
  order by a.created_at limit 1;
 if album_id is null then
  album_title:=left(initcap(ref.world)||' / '||
    (case when ref.country_code='' then 'Country unconfirmed' else ref.country_code end)||' / '||
    (case when ref.world='military' then ref.branch||' / ' else '' end)||ref.category,100);
  insert into public.corp_social_albums(owner_id,title,description,
   military_country_code,military_branch,military_category,military_era,military_tags)
  values(uid,album_title,'BLACKCELL fully verified photo auto-filed',ref.country_code,
   ref.branch,ref.category,left(ref.era,60),array['maf:'||ref.world])
  returning id into album_id;
 end if;
 insert into public.corp_social_album_items(album_id,asset_id,added_by)
  values(album_id,photo.id,uid) on conflict on constraint corp_social_album_items_pkey do nothing;
 update public.corp_social_assets a set
  review_status='approved',reviewed_by=uid,reviewed_at=now(),
  military_country_code=ref.country_code,military_branch=ref.branch,
  military_category=ref.category,military_era=left(ref.era,60),
  military_tags=array['maf:'||ref.world]
 where a.id=photo.id and a.owner_id=uid and a.review_status='pending'
  and a.rights_confirmed=true and a.adult_restricted=false;
 if not found then raise exception 'Approval preconditions changed' using errcode='40001'; end if;
 update public.corp_social_ai_analysis x set status='approved',updated_at=now()
 where x.asset_id=photo.id and x.owner_id=uid and x.status='suggested';
 insert into public.corp_uniform_auto_publication_events(owner_id,asset_id,readiness,action,details)
 values(uid,photo.id,100,'auto_approved',
 jsonb_build_object('verified_reference',ref.id,'approved_album',album_id,
 'rights',true,'nudity','none','ai_confidence','high','gate','all_five_checks'));
 return jsonb_build_object('ok',true,'approved',true,'readiness',100,'album_id',album_id,
  'reason','all_checks_passed','notice','100% checklist readiness is not AI certainty.');
end $function$;
revoke all on function public.blackcell_uniform_auto_publish_100(uuid) from public,anon;
grant execute on function public.blackcell_uniform_auto_publish_100(uuid) to authenticated;
