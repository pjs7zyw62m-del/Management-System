-- BLACKCELL Uniform AutoPilot owner-only RLS-invoker unclassified photo queue.
CREATE OR REPLACE FUNCTION public.blackcell_autopilot_photo_queue(p_limit integer DEFAULT 60)
 RETURNS TABLE(id uuid, filename text, kind text, mime_type text, bytes bigint, adult_restricted boolean, source_provider text, created_at timestamp with time zone, review_status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 v_uid uuid := (select auth.uid());
 v_status jsonb;
begin
 if v_uid is null or not exists (
  select 1 from public.corp_access_members m where m.user_id=v_uid
   and m.active=true and m.role='owner' and m.clearance_level=7
 ) then raise exception 'Level 7 owner required' using errcode='42501'; end if;
 v_status := public.corp_code_status();
 if coalesce((v_status->>'verified')::boolean,false) is not true
   or coalesce((v_status->>'ok')::boolean,false) is not true then
   raise exception 'Corporate access verification required' using errcode='42501';
 end if;
 return query
  select a.id,a.filename,a.kind,a.mime_type,a.bytes,a.adult_restricted,
    a.source_provider,a.created_at,a.review_status
  from public.corp_social_assets a
  where a.owner_id=v_uid and a.source_provider='world-bunny-v1'
    and a.purpose='library' and a.kind='photo'
    and a.review_status in ('pending','approved')
    and a.adult_restricted=false
    and not exists (
      select 1 from public.corp_social_ai_analysis x
      where x.owner_id=v_uid and x.asset_id=a.id
    )
  order by case when a.review_status='pending' then 0 else 1 end,
   a.created_at desc,a.id desc
  limit least(greatest(coalesce(p_limit,60),1),100);
end $function$;
revoke all on function public.blackcell_autopilot_photo_queue(integer) from public,anon;
grant execute on function public.blackcell_autopilot_photo_queue(integer) to authenticated;
