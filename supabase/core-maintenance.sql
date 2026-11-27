create or replace function public.corp_owner_core_maintenance_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null or public.corp_owner_validated() is not true then return jsonb_build_object('ok',false,'reason','owner_verification_required'); end if;
 select jsonb_build_object('ok',true,'checked_at',now(),
 'active_rooms',(select count(*) from public.corp_private_photo_rooms where owner_id=uid and active),
 'closed_rooms',(select count(*) from public.corp_private_photo_rooms where owner_id=uid and not active),
 'photo_records',(select count(*) from public.corp_private_photo_entries e join public.corp_private_photo_rooms r on r.id=e.room_id where r.owner_id=uid),
 'chat_records',(select count(*) from public.corp_private_photo_messages m join public.corp_private_photo_rooms r on r.id=m.room_id where r.owner_id=uid),
 'running_timers',(select count(*) from public.corp_private_photo_timers t join public.corp_private_photo_rooms r on r.id=t.room_id where r.owner_id=uid and t.stopped_at is null),
 'pending_exports',(select count(*) from corp_private.redline_session_photo_exports x join public.corp_private_photo_rooms r on r.id=x.room_id left join public.bc_os_private_objects o on o.id=x.object_id where r.owner_id=uid and o.state is distinct from 'ready'),
 'queued_source_files',(select count(*) from corp_private.redline_session_source_cleanup where owner_id=uid),
 'closed_room_presence',(select count(*) from public.corp_private_photo_presence p join public.corp_private_photo_rooms r on r.id=p.room_id where r.owner_id=uid and not r.active),
 'closed_room_signals',(select count(*) from corp_private.redline_chat_signals s join public.corp_private_photo_rooms r on r.id=s.room_id where r.owner_id=uid and not r.active),
 'closed_room_viewing',(select count(*) from corp_private.redline_currently_viewing v join public.corp_private_photo_rooms r on r.id=v.room_id where r.owner_id=uid and not r.active)
 ) into result;
 return result;
end;
$$;
revoke all on function public.corp_owner_core_maintenance_status() from public,anon;
grant execute on function public.corp_owner_core_maintenance_status() to authenticated;
create or replace function public.corp_owner_core_clear_closed_ephemera()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a integer; b integer; c integer;
begin
 if uid is null or public.corp_owner_validated() is not true then return jsonb_build_object('ok',false,'reason','owner_verification_required'); end if;
 perform 1 from public.corp_private_photo_rooms where owner_id=uid and not active for update;
 delete from public.corp_private_photo_presence p using public.corp_private_photo_rooms r where r.id=p.room_id and r.owner_id=uid and not r.active;
 get diagnostics a=row_count;
 delete from corp_private.redline_chat_signals s using public.corp_private_photo_rooms r where r.id=s.room_id and r.owner_id=uid and not r.active;
 get diagnostics b=row_count;
 delete from corp_private.redline_currently_viewing v using public.corp_private_photo_rooms r where r.id=v.room_id and r.owner_id=uid and not r.active;
 get diagnostics c=row_count;
 return jsonb_build_object('ok',true,'removed',a+b+c);
end;
$$;
revoke all on function public.corp_owner_core_clear_closed_ephemera() from public,anon;
grant execute on function public.corp_owner_core_clear_closed_ephemera() to authenticated;
