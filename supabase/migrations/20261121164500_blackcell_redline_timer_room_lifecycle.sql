-- Stop timed accrual automatically when owner closes a room or resets its current session.
create or replace function corp_private.redline_end_timers_on_room_change()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_now timestamptz:=clock_timestamp();
begin
 if (old.active is true and new.active is false)
 or old.current_session_started_at is distinct from new.current_session_started_at then
  update public.corp_private_photo_timers t
  set stopped_at=greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds')),
      earned_cents=greatest(0,floor(extract(epoch from (
        greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at
      ))/60)::bigint)*t.rate_cents
  where t.room_id=new.id and t.stopped_at is null;
 end if;
 return new;
end;
$fn$;
drop trigger if exists corp_redline_close_timers_on_room_change on public.corp_private_photo_rooms;
create trigger corp_redline_close_timers_on_room_change
after update of active,current_session_started_at on public.corp_private_photo_rooms
for each row execute function corp_private.redline_end_timers_on_room_change();
revoke all on function corp_private.redline_end_timers_on_room_change() from public,anon,authenticated;