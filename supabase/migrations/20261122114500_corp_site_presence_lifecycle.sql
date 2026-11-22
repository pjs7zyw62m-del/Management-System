-- Site-wide session presence. Separate from REDLINE's room-only presence.
create table if not exists public.corp_site_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  device_id uuid not null,
  device_label text not null default 'Unknown device',
  visible boolean not null default true,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  primary key(user_id, session_id)
);
create index if not exists corp_site_presence_last_seen on public.corp_site_presence(last_seen desc);
alter table public.corp_site_presence enable row level security;
revoke all on public.corp_site_presence from public,anon,authenticated;

create table if not exists public.corp_site_presence_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (event_type in ('arrived','left','returned')),
  event_at timestamptz not null default now()
);
create index if not exists corp_site_presence_events_at on public.corp_site_presence_events(event_at desc);
alter table public.corp_site_presence_events enable row level security;
revoke all on public.corp_site_presence_events from public,anon,authenticated;

-- All identity is derived from verified Supabase authentication, never from client-provided user IDs.
create or replace function public.corp_site_presence_touch(
  p_session_id uuid, p_device_id uuid, p_visible boolean, p_device_label text default 'Unknown device'
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid := (select auth.uid());
 v_old public.corp_site_presence%rowtype;
 v_now timestamptz := now();
 v_device text;
begin
 if v_user is null or p_session_id is null or p_device_id is null or p_visible is null then
  return jsonb_build_object('ok',false,'reason','invalid_session');
 end if;
 if not exists (select 1 from public.corp_access_members m where m.user_id=v_user and m.active=true) then
  return jsonb_build_object('ok',false,'reason','not_an_active_member');
 end if;
 v_device := case when p_device_label in
 ('Android phone','Android tablet','iPhone','iPad','Windows desktop','Mac desktop','Linux desktop','Other device')
 then p_device_label else 'Other device' end;

 select * into v_old from public.corp_site_presence
 where user_id=v_user and session_id=p_session_id for update;
 if not found then
  insert into public.corp_site_presence(user_id,session_id,device_id,device_label,visible,first_seen,last_seen,changed_at)
  values(v_user,p_session_id,p_device_id,v_device,p_visible,v_now,v_now,v_now);
  insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
  values(v_user,p_session_id,case when p_visible then 'arrived' else 'left' end,v_now);
 else
  if p_visible and (not v_old.visible or v_old.last_seen < v_now-interval '105 seconds') then
   -- A suspended/closed browser often cannot send its final leave request.
   if v_old.visible and v_old.last_seen < v_now-interval '105 seconds' then
    insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
    values(v_user,p_session_id,'left',v_old.last_seen+interval '105 seconds');
   end if;
   insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
   values(v_user,p_session_id,'returned',v_now);
  elsif not p_visible and v_old.visible then
   insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
   values(v_user,p_session_id,'left',v_now);
  end if;
  update public.corp_site_presence
  set device_id=p_device_id,device_label=v_device,visible=p_visible,last_seen=v_now,
   changed_at=case when v_old.visible is distinct from p_visible
     or (p_visible and v_old.last_seen < v_now-interval '105 seconds') then v_now else v_old.changed_at end
  where user_id=v_user and session_id=p_session_id;
 end if;
 return jsonb_build_object('ok',true);
end;
$function$;
revoke all on function public.corp_site_presence_touch(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.corp_site_presence_touch(uuid,uuid,boolean,text) to authenticated;

-- Owner only; member accounts never receive other members' browsing history.
create or replace function public.corp_site_presence_overview() returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare v_members jsonb; v_events jsonb;
begin
 if (select auth.uid()) is null or not public.corp_owner_validated() then
  return jsonb_build_object('ok',false,'reason','owner_verification_required');
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',m.user_id,'name',coalesce(nullif(m.display_name,''),nullif(m.username,''),'Member'),
  'sessions',coalesce((
   select jsonb_agg(jsonb_build_object(
     'session_id',p.session_id,'device',p.device_label,'last_seen',p.last_seen,
     'status',case when not p.visible then 'left'
                   when p.last_seen>now()-interval '105 seconds' then 'online'
                   else 'offline' end
   ) order by p.last_seen desc)
   from public.corp_site_presence p
   where p.user_id=m.user_id and p.last_seen>now()-interval '30 days'
  ),'[]'::jsonb)
 ) order by m.display_name),'[]'::jsonb)
 into v_members from public.corp_access_members m where m.active=true;

 select coalesce(jsonb_agg(jsonb_build_object(
  'name',coalesce(nullif(m.display_name,''),nullif(m.username,''),'Member'),
  'user_id',e.user_id,'event',e.event_type,'at',e.event_at,
  'device',coalesce(p.device_label,'Other device'),'estimated',e.estimated
 ) order by e.event_at desc),'[]'::jsonb)
 into v_events from (
   select x.user_id,x.session_id,x.event_type,x.event_at,x.estimated from (
      select e.user_id,e.session_id,e.event_type,e.event_at,false as estimated
      from public.corp_site_presence_events e
      where e.event_at>now()-interval '30 days'
      union all
      select p.user_id,p.session_id,'left'::text,p.last_seen+interval '105 seconds',true
      from public.corp_site_presence p
      where p.visible=true and p.last_seen<now()-interval '105 seconds'
            and p.last_seen>now()-interval '30 days'
   ) x order by x.event_at desc limit 60
 ) e
 join public.corp_access_members m on m.user_id=e.user_id
 left join public.corp_site_presence p on p.user_id=e.user_id and p.session_id=e.session_id;
 return jsonb_build_object('ok',true,'members',v_members,'events',v_events,'checked_at',now());
end;
$function$;
revoke all on function public.corp_site_presence_overview() from public,anon;
grant execute on function public.corp_site_presence_overview() to authenticated;
