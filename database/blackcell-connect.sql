-- BLACKCELL Connect: private, one-to-one signaling. No audio/video storage.
create schema if not exists bc_connect_private;
revoke all on schema bc_connect_private from public,anon;
grant usage on schema bc_connect_private to authenticated;
create table bc_connect_private.calls(
 id uuid primary key default gen_random_uuid(),
 caller uuid not null references auth.users(id) on delete cascade,
 callee uuid not null references auth.users(id) on delete cascade,
 caller_device uuid not null,callee_device uuid,
 mode text not null check(mode in ('voice','video')),
 state text not null default 'ringing' check(state in ('ringing','accepted','ended','declined','missed')),
 offer text,answer text,
 created_at timestamptz not null default now(),
 caller_seen timestamptz not null default now(),callee_seen timestamptz,
 answered_at timestamptz,ended_at timestamptz,
 check(caller<>callee)
);
alter table bc_connect_private.calls enable row level security;
revoke all on bc_connect_private.calls from public,anon,authenticated;
create index on bc_connect_private.calls(caller,state);
create index on bc_connect_private.calls(callee,state);
create function bc_connect_private.eligible(u uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select corp_private.chat_allowed(u)
 and exists(select 1 from public.corp_access_members m where m.user_id=u and m.active and m.clearance_level between 1 and 7 and m.access_scope is distinct from 'ledger_only')
 and not exists(select 1 from bc_store_private.core_removed r where r.user_id=u and r.app_id='chat')
 and not exists(select 1 from bc_store_private.network_app_state s where s.app_id='chat' and s.mode<>'active')
$$;
revoke all on function bc_connect_private.eligible(uuid) from public,anon,authenticated;
create function bc_connect_private.rpc(p_action text,p_device uuid,p_call uuid default null,p_peer uuid default null,p_mode text default null,p_sdp text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; r bc_connect_private.calls%rowtype; other_id uuid; other_name text;
begin
 if u is null or p_device is null or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','Access denied'); end if;
 if not exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=u) or not corp_private.chat_verified() or not bc_connect_private.eligible(u) then return jsonb_build_object('ok',false,'error','Access denied');end if;
 if p_action not in ('poll','start','answer','decline','end') or p_action is null then return jsonb_build_object('ok',false,'error','Unknown action');end if;
 -- Serialize admission to avoid simultaneous outgoing/incoming calls.
 if p_action='start' then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('blackcell-connect-admission',0));end if;
 update bc_connect_private.calls c set state=case when c.state='ringing' then 'missed' else 'ended' end,offer=null,answer=null,ended_at=now()
 where c.state in ('ringing','accepted') and (c.caller=u or c.callee=u or (p_action='start' and (c.caller=p_peer or c.callee=p_peer)))
 and (c.created_at<now()-interval '3 hours' or c.caller_seen<now()-interval '45 seconds' or (c.state='ringing' and c.created_at<now()-interval '90 seconds') or (c.state='accepted' and c.callee_seen<now()-interval '45 seconds'));
 delete from bc_connect_private.calls c where (c.caller=u or c.callee=u) and c.ended_at<now()-interval '7 days';
 if p_action='start' then
  if p_peer is null or p_peer=u or p_mode is null or p_mode not in ('voice','video') or p_sdp is null or length(p_sdp)>64000 or left(p_sdp,3)<>'v=0' then return jsonb_build_object('ok',false,'error','Invalid call');end if;
  if not bc_connect_private.eligible(p_peer) or not corp_private.chat_pair_unblocked(p_peer) or not (corp_private.is_owner(u) or corp_private.is_owner(p_peer)) then return jsonb_build_object('ok',false,'error','Contact unavailable');end if;
  if exists(select 1 from bc_connect_private.calls c where c.state in ('ringing','accepted') and (c.caller in (u,p_peer) or c.callee in (u,p_peer))) then return jsonb_build_object('ok',false,'error','A call is already in progress');end if;
  if exists(select 1 from bc_connect_private.calls c where c.caller=u and c.created_at>now()-interval '5 seconds') then return jsonb_build_object('ok',false,'error','Please wait before calling again');end if;
  insert into bc_connect_private.calls(caller,callee,caller_device,mode,offer) values(u,p_peer,p_device,p_mode,p_sdp) returning * into r;
 else
  select * into r from bc_connect_private.calls c
   where (p_call is null or c.id=p_call) and c.state in ('ringing','accepted') and
   ((c.caller=u and c.caller_device=p_device) or (c.callee=u and (c.state='ringing' or c.callee_device=p_device)))
   order by c.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok',true,'call',null);end if;
  other_id:=case when r.caller=u then r.callee else r.caller end;
  if not bc_connect_private.eligible(other_id) or not corp_private.chat_pair_unblocked(other_id) or not (corp_private.is_owner(u) or corp_private.is_owner(other_id)) then
   update bc_connect_private.calls set state='ended',offer=null,answer=null,ended_at=now() where id=r.id;
   return jsonb_build_object('ok',true,'call',null);
  end if;
  if p_action='answer' then
   if r.callee<>u or r.state<>'ringing' or p_call is null or p_sdp is null or length(p_sdp)>64000 or left(p_sdp,3)<>'v=0' then return jsonb_build_object('ok',false,'error','Call unavailable');end if;
   update bc_connect_private.calls set state='accepted',callee_device=p_device,answer=p_sdp,callee_seen=now(),answered_at=now() where id=r.id returning * into r;
  elsif p_action in ('decline','end') then
   if p_call is null or (p_action='decline' and (r.callee<>u or r.state<>'ringing')) then return jsonb_build_object('ok',false,'error','Call unavailable');end if;
   update bc_connect_private.calls set state=case when p_action='decline' then 'declined' else 'ended' end,offer=null,answer=null,ended_at=now() where id=r.id;
   return jsonb_build_object('ok',true,'call',null);
  elsif p_action='poll' then
   if r.caller=u then update bc_connect_private.calls set caller_seen=now() where id=r.id;
   elsif r.state='accepted' then update bc_connect_private.calls set callee_seen=now() where id=r.id;end if;
  end if;
 end if;
 other_id:=case when r.caller=u then r.callee else r.caller end;
 select coalesce(nullif(m.display_name,''),'BLACKCELL Member') into other_name from public.corp_access_members m where m.user_id=other_id;
 return jsonb_build_object('ok',true,'call',jsonb_build_object('id',r.id,'peer',other_id,'name',coalesce(other_name,'BLACKCELL Member'),'direction',case when r.caller=u then 'outgoing' else 'incoming' end,'mode',r.mode,'state',r.state,'offer',case when r.callee=u then r.offer end,'answer',case when r.caller=u then r.answer end));
end $$;
revoke all on function bc_connect_private.rpc(text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function bc_connect_private.rpc(text,uuid,uuid,uuid,text,text) to authenticated;
create function public.corp_connect(p_action text,p_device uuid,p_call uuid default null,p_peer uuid default null,p_mode text default null,p_sdp text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select bc_connect_private.rpc(p_action,p_device,p_call,p_peer,p_mode,p_sdp)
$$;
revoke all on function public.corp_connect(text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.corp_connect(text,uuid,uuid,uuid,text,text) to authenticated;
