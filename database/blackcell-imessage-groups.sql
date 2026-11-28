-- BLACKCELL group messaging pilot. Private storage, RPC-only access.
create schema if not exists bc_group_private;
revoke all on schema bc_group_private from public,anon,authenticated;
grant usage on schema bc_group_private to authenticated;
create table bc_group_private.rooms(id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 1 and 80), creator uuid not null, created_at timestamptz not null default now());
create table bc_group_private.members(room_id uuid not null references bc_group_private.rooms(id) on delete cascade,user_id uuid not null,joined_at timestamptz not null default clock_timestamp(), primary key(room_id,user_id));
create index on bc_group_private.members(user_id,room_id);
create table bc_group_private.messages(id bigint generated always as identity primary key,room_id uuid not null references bc_group_private.rooms(id) on delete cascade,sender_id uuid not null,body text not null check(char_length(body) between 1 and 2000),created_at timestamptz not null default clock_timestamp(),client_id uuid not null,unique(room_id,sender_id,client_id));
create index on bc_group_private.messages(room_id,id desc);
create table bc_group_private.receipts(room_id uuid not null,user_id uuid not null,message_id bigint not null references bc_group_private.messages(id) on delete cascade,read_at timestamptz not null default clock_timestamp(),primary key(user_id,message_id),foreign key(room_id,user_id) references bc_group_private.members(room_id,user_id) on delete cascade);
create index on bc_group_private.receipts(message_id);
create table bc_group_private.typing(room_id uuid not null,user_id uuid not null,expires_at timestamptz not null,primary key(room_id,user_id),foreign key(room_id,user_id) references bc_group_private.members(room_id,user_id) on delete cascade);
alter table bc_group_private.rooms enable row level security;
alter table bc_group_private.members enable row level security;
alter table bc_group_private.messages enable row level security;
alter table bc_group_private.receipts enable row level security;
alter table bc_group_private.typing enable row level security;
revoke all on all tables in schema bc_group_private from public,anon,authenticated;
revoke all on all sequences in schema bc_group_private from public,anon,authenticated;
-- Keep the existing owner-centered chat boundary: an eligible owner must be a participant.
create function bc_group_private.allowed_room(g uuid,u uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from bc_group_private.members m where m.room_id=g and m.user_id=u)
 and exists(select 1 from bc_group_private.members m where m.room_id=g and corp_private.is_owner(m.user_id) and bc_connect_private.eligible(m.user_id))
 and not exists(select 1 from bc_group_private.members m where m.room_id=g and m.user_id<>u and not corp_private.chat_pair_unblocked(m.user_id));
$$;
revoke all on function bc_group_private.allowed_room(uuid,uuid) from public,anon,authenticated;
create function bc_group_private.action(p_action text,p_room uuid,p_name text,p_users uuid[],p_body text,p_client uuid,p_seen bigint[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; g uuid:=p_room; ids uuid[]; who uuid; joined timestamptz; boss uuid; result jsonb; msg bigint; owner_present boolean;
begin
 if u is null or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'reason','verification_required'); end if;
 if not exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=u) or not coalesce(corp_private.chat_verified(),false) or not coalesce(bc_connect_private.eligible(u),false) then return jsonb_build_object('ok',false,'reason','verification_required'); end if;
 if p_action='contacts' then
  -- Group-specific contact picker, names only, not a change to direct-message permissions.
  select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.display_name,'owner',m.role='owner') order by m.display_name),'[]'::jsonb) into result
  from public.corp_access_members m where m.user_id<>u and bc_connect_private.eligible(m.user_id) and corp_private.chat_pair_unblocked(m.user_id);
  return jsonb_build_object('ok',true,'contacts',result);
 end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'count',(select count(*) from bc_group_private.members a where a.room_id=r.id),'unread',(select count(*) from (select x.id from bc_group_private.messages x where x.room_id=r.id and x.created_at>=m.joined_at and x.sender_id<>u and not exists(select 1 from bc_group_private.receipts z where z.message_id=x.id and z.user_id=u) limit 100) s)) order by r.created_at desc),'[]'::jsonb) into result
  from bc_group_private.members m join bc_group_private.rooms r on r.id=m.room_id where m.user_id=u and bc_group_private.allowed_room(r.id,u);
  return jsonb_build_object('ok',true,'groups',result);
 end if;
 if p_action='create' then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 or coalesce(cardinality(p_users),0) not between 2 and 19 then return jsonb_build_object('ok',false,'reason','invalid_group');end if;
  select array_agg(distinct x) into ids from unnest(array_append(p_users,u)) x;
  if cardinality(ids) not between 3 and 20 or array_position(ids,null::uuid) is not null or exists(select 1 from unnest(ids) x where not coalesce(bc_connect_private.eligible(x),false)) or not exists(select 1 from unnest(ids) x where corp_private.is_owner(x)) or exists(select 1 from public.corp_chat_blocks b where b.blocker_id=any(ids) and b.blocked_id=any(ids)) then return jsonb_build_object('ok',false,'reason','membership_not_allowed');end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,91));
  if (select count(*) from bc_group_private.rooms where creator=u and created_at>now()-interval '1 day')>=20 then return jsonb_build_object('ok',false,'reason','group_limit');end if;
  insert into bc_group_private.rooms(name,creator) values(btrim(p_name),u) returning id into g;
  insert into bc_group_private.members(room_id,user_id) select g,x from unnest(ids) x;
  return jsonb_build_object('ok',true,'id',g);
 end if;
 -- Serialize membership changes and sends, then recheck after acquiring the lock.
 select r.creator into boss from bc_group_private.rooms r where r.id=g for update;
 select m.joined_at into joined from bc_group_private.members m where m.room_id=g and m.user_id=u;
 if joined is null then return jsonb_build_object('ok',false,'reason','group_unavailable');end if;
 -- Leaving is always possible even when a block or owner suspension makes the room inaccessible.
 if p_action='leave' then delete from bc_group_private.members where room_id=g and user_id=u;return jsonb_build_object('ok',true);end if;
 if not bc_group_private.allowed_room(g,u) then return jsonb_build_object('ok',false,'reason','group_unavailable');end if;
 if p_action='thread' then
  select jsonb_build_object('ok',true,'name',r.name,'admin',boss=u,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(a.display_name,'Member'),'admin',m.user_id=boss) order by a.display_name),'[]'::jsonb) from bc_group_private.members m left join public.corp_access_members a on a.user_id=m.user_id where m.room_id=g),'typing',(select coalesce(jsonb_agg(a.display_name),'[]'::jsonb) from bc_group_private.typing t join public.corp_access_members a on a.user_id=t.user_id where t.room_id=g and t.user_id<>u and t.expires_at>now() and bc_connect_private.eligible(t.user_id)),'messages',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from (select m.id::text as id,m.sender_id,m.body,m.created_at,coalesce(a.display_name,'Member') as sender_name, (select coalesce(jsonb_agg(coalesce(b.display_name,'Member')),'[]'::jsonb) from bc_group_private.receipts z join public.corp_access_members b on b.user_id=z.user_id where z.message_id=m.id and z.user_id<>m.sender_id) as readers from bc_group_private.messages m left join public.corp_access_members a on a.user_id=m.sender_id where m.room_id=g and m.created_at>=joined order by m.id desc limit 100) x)) into result from bc_group_private.rooms r where r.id=g;
  return result;
 elsif p_action='send' then
  if coalesce(char_length(btrim(p_body)),0) not between 1 and 2000 or p_client is null then return jsonb_build_object('ok',false,'reason','invalid_message');end if;
  if (select count(*) from bc_group_private.messages where room_id=g and sender_id=u and created_at>now()-interval '1 minute')>=60 then return jsonb_build_object('ok',false,'reason','rate_limit');end if;
  insert into bc_group_private.messages(room_id,sender_id,body,client_id) values(g,u,btrim(p_body),p_client) on conflict(room_id,sender_id,client_id) do nothing;
  delete from bc_group_private.typing where room_id=g and user_id=u;
 elsif p_action='read' then
  if coalesce(cardinality(p_seen),0)>100 then return jsonb_build_object('ok',false,'reason','invalid_receipts');end if;
  insert into bc_group_private.receipts(room_id,user_id,message_id) select g,u,m.id from bc_group_private.messages m where m.room_id=g and m.created_at>=joined and m.sender_id<>u and m.id=any(p_seen) on conflict do nothing;
 elsif p_action='typing' then
  insert into bc_group_private.typing(room_id,user_id,expires_at) values(g,u,clock_timestamp()+interval '5 seconds') on conflict(room_id,user_id) do update set expires_at=excluded.expires_at;
 elsif p_action='stop_typing' then delete from bc_group_private.typing where room_id=g and user_id=u;
 elsif p_action='rename' and boss=u then
  if coalesce(char_length(btrim(p_name)),0) not between 1 and 80 then return jsonb_build_object('ok',false,'reason','invalid_name');end if;
  update bc_group_private.rooms set name=btrim(p_name) where id=g;
 elsif p_action in ('add','remove') and boss=u then
  if coalesce(cardinality(p_users),0)<>1 then return jsonb_build_object('ok',false,'reason','invalid_member');end if;
  who:=p_users[1];
  if who is null or who=u then return jsonb_build_object('ok',false,'reason','invalid_member');end if;
  if p_action='add' then
   if not coalesce(bc_connect_private.eligible(who),false) or (select count(*) from bc_group_private.members where room_id=g)>=20 or exists(select 1 from public.corp_chat_blocks b join bc_group_private.members m on m.room_id=g and ((b.blocker_id=who and b.blocked_id=m.user_id) or (b.blocked_id=who and b.blocker_id=m.user_id))) then return jsonb_build_object('ok',false,'reason','membership_not_allowed');end if;
   insert into bc_group_private.members(room_id,user_id) values(g,who) on conflict do nothing;
  else
   if corp_private.is_owner(who) then return jsonb_build_object('ok',false,'reason','owner_required');end if;
   delete from bc_group_private.members where room_id=g and user_id=who;
  end if;
 else return jsonb_build_object('ok',false,'reason','action_not_allowed');
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function bc_group_private.action(text,uuid,text,uuid[],text,uuid,bigint[]) from public,anon,authenticated;
grant execute on function bc_group_private.action(text,uuid,text,uuid[],text,uuid,bigint[]) to authenticated;
create function public.corp_chat_group(p_action text,p_room uuid default null,p_name text default null,p_users uuid[] default null,p_body text default null,p_client uuid default null,p_seen bigint[] default null) returns jsonb language sql security invoker set search_path='' as $$
 select bc_group_private.action(p_action,p_room,p_name,p_users,p_body,p_client,p_seen);
$$;
revoke all on function public.corp_chat_group(text,uuid,text,uuid[],text,uuid,bigint[]) from public,anon,authenticated;
grant execute on function public.corp_chat_group(text,uuid,text,uuid[],text,uuid,bigint[]) to authenticated;
