-- Explicit owner-confirmed group deletion. Private photo ledgers are not children of groups.
create function redline_group_private.delete_room(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id';
begin
 if u is null or sid is null or sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Verified owner required' using errcode='42501';end if;
 if not exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=u) or not exists(select 1 from public.corp_access_members a where a.user_id=u and a.active and a.role='owner' and a.clearance_level=7) or not coalesce((public.corp_code_status()->>'verified')::boolean,false) then raise exception 'Verified owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_room::text,672));
 if not exists(select 1 from redline_group_private.rooms r where r.id=p_room and r.owner_id=u) then raise exception 'Group unavailable' using errcode='42501';end if;
 if exists(select 1 from redline_group_private.streams s where s.room_id=p_room and s.publisher_seen>now()-interval '55 seconds' and s.started_at>now()-interval '4 hours') then raise exception 'Stop all group webcams before deleting this room';end if;
 delete from redline_group_private.rooms where id=p_room and owner_id=u;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function redline_group_private.delete_room(uuid) from public,anon,authenticated;
grant execute on function redline_group_private.delete_room(uuid) to authenticated;
create function public.corp_redline_group_delete(p_room uuid) returns jsonb language sql security invoker set search_path='' as $$ select redline_group_private.delete_room(p_room); $$;
revoke all on function public.corp_redline_group_delete(uuid) from public,anon,authenticated;
grant execute on function public.corp_redline_group_delete(uuid) to authenticated;
