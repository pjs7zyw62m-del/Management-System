-- Voluntary gratuity records only. No charge, payment claim or payout.
create table redline_group_private.tip_records(
 id uuid primary key,
 room_id uuid not null,
 owner_id uuid not null references auth.users(id),
 recipient_id uuid not null references auth.users(id),
 amount_cents integer not null check(amount_cents between 1 and 100000),
 visibility text not null check(visibility in ('group','private')),
 created_at timestamptz not null default clock_timestamp(),
 check(owner_id<>recipient_id)
);
create index on redline_group_private.tip_records(room_id,created_at desc,id);
create index on redline_group_private.tip_records(owner_id,recipient_id,created_at desc);
alter table redline_group_private.tip_records enable row level security;
revoke all on redline_group_private.tip_records from public,anon,authenticated;
create function redline_group_private.tip_rpc(p_action text,p_room uuid,p_recipient uuid,p_cents integer,p_visibility text,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); st text:=auth.jwt()->>'session_id'; boss uuid; owner boolean; records jsonb; totals jsonb; old redline_group_private.tip_records%rowtype;
begin
 if u is null or st is null or st !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Verified session required' using errcode='42501';end if;
 if not exists(select 1 from auth.sessions s where s.id=st::uuid and s.user_id=u) or not coalesce(corp_private.photo_ledger_verified(),false) then raise exception 'Verified session required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_room::text,672));
 select r.owner_id into boss from redline_group_private.rooms r where r.id=p_room;
 if boss is null or not corp_private.is_owner(boss) then raise exception 'Room unavailable' using errcode='42501';end if;
 owner:=boss=u;
 if owner then
  if not coalesce((public.corp_code_status()->>'verified')::boolean,false) then raise exception 'Verified owner required' using errcode='42501';end if;
 elsif not exists(select 1 from redline_group_private.members m where m.room_id=p_room and m.user_id=u) or not coalesce((public.corp_employee_code_status()->>'verified')::boolean,false) then raise exception 'Room unavailable' using errcode='42501';end if;
 if p_action='record' then
  if not owner then raise exception 'Owner only' using errcode='42501';end if;
  if p_request is null or p_recipient is null or p_cents is null or p_cents not between 1 and 100000 or p_visibility is null or p_visibility not in ('group','private') then raise exception 'Invalid tip';end if;
  if not exists(select 1 from redline_group_private.members m join public.corp_access_members a on a.user_id=m.user_id join auth.users z on z.id=a.user_id where m.room_id=p_room and m.user_id=p_recipient and a.active and a.role='employee' and a.password_activated_at is not null and z.email_confirmed_at is not null) then raise exception 'Recipient unavailable' using errcode='42501';end if;
  select * into old from redline_group_private.tip_records where id=p_request;
  if found then
   if old.room_id<>p_room or old.owner_id<>u or old.recipient_id<>p_recipient or old.amount_cents<>p_cents or old.visibility<>p_visibility then raise exception 'Request already used';end if;
  else
   if (select count(*) from redline_group_private.tip_records where owner_id=u and created_at>now()-interval '1 minute')>=20 then raise exception 'Tip rate limit reached';end if;
   insert into redline_group_private.tip_records(id,room_id,owner_id,recipient_id,amount_cents,visibility) values(p_request,p_room,u,p_recipient,p_cents,p_visibility);
  end if;
  return jsonb_build_object('ok',true,'id',p_request,'status','recorded_unpaid');
 elsif p_action<>'list' or p_action is null then raise exception 'Unsupported action';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'::jsonb) into records from(
 select t.id,t.recipient_id as member,coalesce(a.display_name,'Participant') as name,t.amount_cents as cents,t.visibility,t.created_at
 from redline_group_private.tip_records t left join public.corp_access_members a on a.user_id=t.recipient_id
 where t.room_id=p_room and t.owner_id=boss and (owner or t.recipient_id=u or t.visibility='group') order by t.created_at desc,t.id limit 100
 ) x;
 select coalesce(jsonb_object_agg(x.recipient_id::text,x.total),'{}'::jsonb) into totals from(
 select t.recipient_id,sum(t.amount_cents) as total from redline_group_private.tip_records t where t.room_id=p_room and t.owner_id=boss and (owner or t.recipient_id=u) group by t.recipient_id
 ) x;
 return jsonb_build_object('ok',true,'records',records,'totals',totals,'status','recorded_unpaid');
end $$;
revoke all on function redline_group_private.tip_rpc(text,uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function redline_group_private.tip_rpc(text,uuid,uuid,integer,text,uuid) to authenticated;
create function public.corp_redline_group_tips(p_action text,p_room uuid,p_recipient uuid default null,p_cents integer default null,p_visibility text default null,p_request uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select redline_group_private.tip_rpc(p_action,p_room,p_recipient,p_cents,p_visibility,p_request); $$;
revoke all on function public.corp_redline_group_tips(text,uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.corp_redline_group_tips(text,uuid,uuid,integer,text,uuid) to authenticated;
