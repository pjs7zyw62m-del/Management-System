-- Rate-limited TURN issuance for the same verified private call pairs.
create table if not exists bc_connect_private.turn_issuance (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null, issued integer not null check (issued between 1 and 8)
);
alter table bc_connect_private.turn_issuance enable row level security;
revoke all on bc_connect_private.turn_issuance from public,anon,authenticated;
create or replace function bc_connect_private.authorize_turn(p_peer uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; permitted integer;
begin
 if u is null or p_peer is null or p_peer=u or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 if not exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=u)
 or not coalesce(corp_private.chat_verified(),false)
 or not coalesce(bc_connect_private.eligible(u),false)
 or not coalesce(bc_connect_private.eligible(p_peer),false)
 or not coalesce(corp_private.chat_pair_unblocked(p_peer),false)
 or not (coalesce(corp_private.is_owner(u),false) or coalesce(corp_private.is_owner(p_peer),false)) then return false; end if;
 insert into bc_connect_private.turn_issuance as t(user_id,window_start,issued) values(u,now(),1)
 on conflict(user_id) do update set window_start=case when t.window_start<=now()-interval '15 minutes' then now() else t.window_start end,
 issued=case when t.window_start<=now()-interval '15 minutes' then 1 else t.issued+1 end
 where t.window_start<=now()-interval '15 minutes' or t.issued<8 returning issued into permitted;
 return permitted is not null;
end $$;
revoke all on function bc_connect_private.authorize_turn(uuid) from public,anon,authenticated;
grant execute on function bc_connect_private.authorize_turn(uuid) to authenticated;
create or replace function public.corp_connect_turn_authorize(p_peer uuid)
returns boolean language sql security invoker set search_path='' as $$
 select bc_connect_private.authorize_turn(p_peer)
$$;
revoke all on function public.corp_connect_turn_authorize(uuid) from public,anon,authenticated;
grant execute on function public.corp_connect_turn_authorize(uuid) to authenticated;
