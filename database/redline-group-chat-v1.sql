-- REDLINE group chat, deliberately independent of all two-party photo/payment tables.
begin;
create schema if not exists redline_group_private;
revoke all on schema redline_group_private from public, anon, authenticated;
create table redline_group_private.rooms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (char_length(btrim(title)) between 1 and 90),
 created_at timestamptz not null default now()
);
create table redline_group_private.members (
 room_id uuid not null references redline_group_private.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 primary key(room_id,user_id)
);
create index on redline_group_private.members(user_id,room_id);
create table redline_group_private.messages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references redline_group_private.rooms(id) on delete cascade,
 sender_id uuid not null references auth.users(id),
 body text not null check (char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index on redline_group_private.messages(room_id,created_at desc,id);
alter table redline_group_private.rooms enable row level security;
alter table redline_group_private.members enable row level security;
alter table redline_group_private.messages enable row level security;
revoke all on all tables in schema redline_group_private from public,anon,authenticated;
-- Narrow API: existing verified corporate session, explicit role + membership checks,
-- no dynamic SQL, no direct access to private tables.
create function public.corp_redline_group_v1(p_action text,p_room uuid default null,p_title text default null,p_members uuid[] default null,p_body text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid();
 is_owner boolean := false;
 is_employee boolean := false;
 rid uuid;
 out_data jsonb;
 chosen uuid[];
begin
 if uid is null then raise exception 'Access denied' using errcode='42501'; end if;
 select exists(select 1 from public.corp_access_members m where m.user_id=uid and m.active and m.role='owner' and m.clearance_level=7),
 exists(select 1 from public.corp_access_members m where m.user_id=uid and m.active and m.role='employee' and m.password_activated_at is not null)
 into is_owner,is_employee;
 if not ((is_owner and coalesce((public.corp_code_status()->>'verified')::boolean,false)) or (is_employee and coalesce((public.corp_employee_code_status()->>'verified')::boolean,false))) then
  raise exception 'Verified corporate session required' using errcode='42501';
 end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into out_data from (
   select r.id,r.title,r.created_at,
    (select count(*) from redline_group_private.members m where m.room_id=r.id)+1 as participant_count
   from redline_group_private.rooms r
   where (is_owner and r.owner_id=uid) or (is_employee and exists(select 1 from redline_group_private.members m where m.room_id=r.id and m.user_id=uid))
   order by r.created_at desc limit 100
  ) x;
  return out_data;
 elsif p_action='candidates' then
  if not is_owner then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(m.display_name,'Employee')) order by m.display_name),'[]'::jsonb) into out_data
  from public.corp_access_members m join auth.users u on u.id=m.user_id where m.active and m.role='employee' and m.password_activated_at is not null and u.email_confirmed_at is not null;
  return out_data;
 elsif p_action='create' then
  if not is_owner then raise exception 'Access denied' using errcode='42501'; end if;
  select array_agg(distinct x) into chosen from unnest(p_members) x where x is not null;
  if coalesce(cardinality(chosen),0)<2 or cardinality(chosen)>100 or coalesce(char_length(btrim(p_title)),0) not between 1 and 90 then raise exception 'Choose 2 to 100 distinct participants and a room title'; end if;
  if (select count(*) from public.corp_access_members m join auth.users u on u.id=m.user_id where m.user_id=any(chosen) and m.active and m.role='employee' and m.password_activated_at is not null and u.email_confirmed_at is not null)<>cardinality(chosen) then raise exception 'All participants must be activated employees'; end if;
  insert into redline_group_private.rooms(owner_id,title) values(uid,btrim(p_title)) returning id into rid;
  insert into redline_group_private.members(room_id,user_id) select rid,x from unnest(chosen) x;
  return jsonb_build_object('id',rid);
 end if;
 if not exists(select 1 from redline_group_private.rooms r where r.id=p_room and ((is_owner and r.owner_id=uid) or (is_employee and exists(select 1 from redline_group_private.members m where m.room_id=r.id and m.user_id=uid)))) then
  raise exception 'Room unavailable' using errcode='42501';
 end if;
 if p_action='read' then
  select jsonb_build_object('title',r.title,'messages',
   (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]'::jsonb) from (
    select g.id,g.body,g.created_at,g.sender_id=uid as mine,coalesce(m.display_name,'Participant') as sender_name
    from redline_group_private.messages g left join public.corp_access_members m on m.user_id=g.sender_id
    where g.room_id=r.id order by g.created_at desc,g.id desc limit 200
   ) x)) into out_data from redline_group_private.rooms r where r.id=p_room;
  return out_data;
 elsif p_action='send' then
  if coalesce(char_length(btrim(p_body)),0) not between 1 and 2000 then raise exception 'Invalid message'; end if;
  insert into redline_group_private.messages(room_id,sender_id,body) values(p_room,uid,btrim(p_body));
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unsupported action';
end;
$$;
revoke all on function public.corp_redline_group_v1(text,uuid,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.corp_redline_group_v1(text,uuid,text,uuid[],text) to authenticated;
commit;
