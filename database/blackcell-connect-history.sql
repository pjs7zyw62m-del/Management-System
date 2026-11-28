-- BLACKCELL Connect Recents: metadata only, independent from transient SDP.
create table bc_connect_private.history(
 id uuid primary key, caller uuid not null references auth.users(id) on delete cascade, callee uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('voice','video')), state text not null check(state in ('ringing','accepted','ended','declined','missed')),
 created_at timestamptz not null, answered_at timestamptz, ended_at timestamptz,
 caller_connected_at timestamptz,callee_connected_at timestamptz,
 caller_hidden boolean not null default false,callee_hidden boolean not null default false,callee_history_seen boolean not null default false
);
alter table bc_connect_private.history enable row level security;
revoke all on bc_connect_private.history from public,anon,authenticated;
create index on bc_connect_private.history(caller,created_at desc);
create index on bc_connect_private.history(callee,created_at desc);
create index on bc_connect_private.history(ended_at);
create function bc_connect_private.archive_call() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into bc_connect_private.history(id,caller,callee,mode,state,created_at,answered_at,ended_at)
 values(new.id,new.caller,new.callee,new.mode,new.state,new.created_at,new.answered_at,new.ended_at)
 on conflict(id) do update set state=excluded.state,answered_at=excluded.answered_at,ended_at=excluded.ended_at;
 return new;
end $$;
revoke all on function bc_connect_private.archive_call() from public,anon,authenticated;
create trigger bc_connect_history_insert after insert on bc_connect_private.calls for each row execute function bc_connect_private.archive_call();
create trigger bc_connect_history_state after update of state,answered_at,ended_at on bc_connect_private.calls for each row
 when (old.state is distinct from new.state or old.answered_at is distinct from new.answered_at or old.ended_at is distinct from new.ended_at) execute function bc_connect_private.archive_call();
insert into bc_connect_private.history(id,caller,callee,mode,state,created_at,answered_at,ended_at)
 select id,caller,callee,mode,state,created_at,answered_at,ended_at from bc_connect_private.calls on conflict(id) do nothing;
create function bc_connect_private.history_rpc(p_action text,p_call uuid,p_device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; result jsonb; missed_count bigint;
begin
 if u is null or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','Access denied');end if;
 if not exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=u) or not coalesce(corp_private.chat_verified(),false) or not coalesce(bc_connect_private.eligible(u),false) then return jsonb_build_object('ok',false,'error','Access denied');end if;
 if p_action='connected' then
  -- Both participants report WebRTC connection; answer timestamps alone are not call duration.
  update bc_connect_private.history h set caller_connected_at=case when h.caller=u then coalesce(h.caller_connected_at,clock_timestamp()) else h.caller_connected_at end,
   callee_connected_at=case when h.callee=u then coalesce(h.callee_connected_at,clock_timestamp()) else h.callee_connected_at end
   from bc_connect_private.calls c where c.id=h.id and c.id=p_call and c.state='accepted' and h.state='accepted'
   and ((c.caller=u and c.caller_device=p_device) or (c.callee=u and c.callee_device=p_device));
  return jsonb_build_object('ok',found);
 elsif p_action='hide' then
  update bc_connect_private.history h set caller_hidden=case when caller=u then true else caller_hidden end,callee_hidden=case when callee=u then true else callee_hidden end
   where h.id=p_call and h.ended_at is not null and (h.caller=u or h.callee=u);
  return jsonb_build_object('ok',found);
 elsif p_action='seen' then
  update bc_connect_private.history h set callee_history_seen=true where h.id=p_call and h.callee=u and h.ended_at is not null;
  return jsonb_build_object('ok',found);
 elsif p_action in ('list','count') then
  select count(*) into missed_count from bc_connect_private.history h where h.callee=u and not h.callee_hidden and not h.callee_history_seen and h.answered_at is null and h.state in ('ended','missed') and h.ended_at>now()-interval '30 days';
  if p_action='count' then return jsonb_build_object('ok',true,'missed',missed_count);end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into result from (
   select h.id,h.mode,h.state,h.created_at,h.answered_at,h.ended_at,case when h.caller=u then 'outgoing' else 'incoming' end as direction,
   case when h.caller=u then h.callee else h.caller end as peer,
   coalesce(nullif(m.display_name,''),'BLACKCELL Member') as name,
   case when h.state='declined' then 'declined' when h.answered_at is null and h.callee=u then 'missed' when h.answered_at is null then 'unanswered'
     when h.caller_connected_at is null or h.callee_connected_at is null then 'answered_unconfirmed' else 'connected' end as outcome,
   case when h.caller_connected_at is not null and h.callee_connected_at is not null then greatest(0,floor(extract(epoch from (h.ended_at-greatest(h.caller_connected_at,h.callee_connected_at)))))::integer end as seconds,
   h.callee=u and not h.callee_history_seen and h.answered_at is null and h.state in ('ended','missed') as unseen
   from bc_connect_private.history h left join public.corp_access_members m on m.user_id=case when h.caller=u then h.callee else h.caller end
   where h.ended_at>now()-interval '30 days' and ((h.caller=u and not h.caller_hidden) or (h.callee=u and not h.callee_hidden))
   order by h.created_at desc limit 200
  ) x;
  return jsonb_build_object('ok',true,'missed',missed_count,'calls',result);
 end if;
 return jsonb_build_object('ok',false,'error','Unknown action');
end $$;
revoke all on function bc_connect_private.history_rpc(text,uuid,uuid) from public,anon,authenticated;
grant execute on function bc_connect_private.history_rpc(text,uuid,uuid) to authenticated;
create function public.corp_connect_history(p_action text,p_call uuid default null,p_device uuid default null) returns jsonb language sql security invoker set search_path='' as $$
 select bc_connect_private.history_rpc(p_action,p_call,p_device);
$$;
revoke all on function public.corp_connect_history(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.corp_connect_history(text,uuid,uuid) to authenticated;
-- Retain only 30 days of ended-call metadata. No changes to the existing signaling expiry job.
select cron.schedule('blackcell-connect-history-expiry','13 4 * * *',$job$delete from bc_connect_private.history where ended_at<now()-interval '30 days'$job$);
