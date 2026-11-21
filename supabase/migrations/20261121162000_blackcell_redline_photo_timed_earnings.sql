-- BLACKCELL REDLINE — private per-photo completed-minute accrual ledger
-- Applied to connected Supabase project. Recorded here for repository parity.
-- Timer earnings are financial records, not external payments.
create table if not exists public.corp_private_photo_timers(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.corp_private_photo_rooms(id) on delete cascade,
 photo_id uuid not null references public.corp_private_photo_entries(id) on delete restrict,
 owner_id uuid not null references auth.users(id),
 recipient_id uuid not null references auth.users(id),
 rate_cents bigint not null check (rate_cents between 1 and 100000),
 started_at timestamptz not null default now(),
 heartbeat_at timestamptz not null default now(),
 stopped_at timestamptz,
 earned_cents bigint not null default 0 check (earned_cents >= 0),
 settled_at timestamptz,
 constraint redline_timer_stop_time check(stopped_at is null or stopped_at>=started_at)
);
create unique index if not exists corp_redline_timer_one_running_per_room
 on public.corp_private_photo_timers(room_id) where stopped_at is null;
create index if not exists corp_redline_timer_room_newest
 on public.corp_private_photo_timers(room_id,started_at desc);
alter table public.corp_private_photo_timers enable row level security;
revoke all on public.corp_private_photo_timers from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_heartbeat(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_now timestamptz:=clock_timestamp();
 v_timer public.corp_private_photo_timers%rowtype;v_active boolean;
begin
 if v_user is null or p_session_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_owner_required');
 end if;
 select * into v_timer from public.corp_private_photo_timers
 where id=p_session_id for update;
 if not found or v_user<>v_timer.owner_id or v_timer.stopped_at is not null then
  return jsonb_build_object('ok',false,'reason','session_not_running');
 end if;
 select active into v_active from public.corp_private_photo_rooms where id=v_timer.room_id;
 if not coalesce(v_active,false) or v_timer.heartbeat_at<v_now-interval '75 seconds' then
  update public.corp_private_photo_timers
  set stopped_at=least(v_now,v_timer.heartbeat_at+interval '45 seconds'),
  earned_cents=greatest(0,floor(extract(epoch from
   (least(v_now,v_timer.heartbeat_at+interval '45 seconds')-v_timer.started_at))/60)::bigint)*v_timer.rate_cents
  where id=v_timer.id;
  return jsonb_build_object('ok',false,'reason','timer_expired_or_room_closed');
 end if;
 update public.corp_private_photo_timers set heartbeat_at=v_now where id=p_session_id;
 return jsonb_build_object('ok',true);
end;$function$;

revoke all on function public.corp_redline_photo_timer_heartbeat(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_heartbeat(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_mark_paid(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_timer public.corp_private_photo_timers%rowtype;
begin
 if v_user is null or p_session_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_owner_required');
 end if;
 select * into v_timer from public.corp_private_photo_timers where id=p_session_id for update;
 if not found or v_user<>v_timer.owner_id or v_timer.stopped_at is null
 or v_timer.earned_cents<=0 then
  return jsonb_build_object('ok',false,'reason','completed_unpaid_timer_required');
 end if;
 if v_timer.settled_at is not null then return jsonb_build_object('ok',true,'already_recorded',true);end if;
 update public.corp_private_photo_timers set settled_at=clock_timestamp() where id=p_session_id;
 return jsonb_build_object('ok',true);
end;$function$;

revoke all on function public.corp_redline_photo_timer_mark_paid(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_mark_paid(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_start(p_room_id uuid, p_photo_id uuid, p_rate_cents bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid:=(select auth.uid());v_owner uuid;v_member uuid;v_active boolean;
 v_id uuid;v_time timestamptz:=clock_timestamp();
begin
 if v_user is null or p_room_id is null or p_photo_id is null
  or p_rate_cents is null or p_rate_cents not between 1 and 100000
  or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_owner_and_valid_rate_required');
 end if;
 select r.owner_id,r.member_id,r.active into v_owner,v_member,v_active
 from public.corp_private_photo_rooms r where r.id=p_room_id for update;
 if not found or v_user<>v_owner or not v_active then
  return jsonb_build_object('ok',false,'reason','active_owner_room_required');
 end if;
 if not exists (
  select 1 from public.corp_private_photo_entries e
  where e.id=p_photo_id and e.room_id=p_room_id and e.uploaded_by=v_member
  and e.decision_status<>'rejected'
 ) then return jsonb_build_object('ok',false,'reason','photo_not_available_for_timing');
 end if;
 -- An abandoned tab cannot bill forever. Finalize only up to the short lease.
 update public.corp_private_photo_timers t
 set stopped_at=least(v_time,t.heartbeat_at+interval '45 seconds'),
 earned_cents=greatest(0,floor(extract(epoch from
  (least(v_time,t.heartbeat_at+interval '45 seconds')-t.started_at))/60)::bigint)*t.rate_cents
 where t.room_id=p_room_id and t.stopped_at is null
  and t.heartbeat_at<v_time-interval '75 seconds';
 if exists (select 1 from public.corp_private_photo_timers t
            where t.room_id=p_room_id and t.stopped_at is null) then
  return jsonb_build_object('ok',false,'reason','stop_current_timer_first');
 end if;
 insert into public.corp_private_photo_timers(room_id,photo_id,owner_id,recipient_id,rate_cents,started_at,heartbeat_at)
 values(p_room_id,p_photo_id,v_owner,v_member,p_rate_cents,v_time,v_time) returning id into v_id;
 return jsonb_build_object('ok',true,'session_id',v_id);
end;$function$;

revoke all on function public.corp_redline_photo_timer_start(uuid,uuid,bigint) from public,anon;
grant execute on function public.corp_redline_photo_timer_start(uuid,uuid,bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_status(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_owner uuid;v_member uuid;
 v_since timestamptz;v_now timestamptz:=clock_timestamp();
 v_assigned numeric;v_paid numeric;v_owed numeric;
 v_running jsonb;v_recent jsonb;
begin
 if v_user is null or p_room_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_room_required');
 end if;
 select owner_id,member_id,current_session_started_at into v_owner,v_member,v_since
 from public.corp_private_photo_rooms where id=p_room_id;
 if not found or (v_user<>v_owner and v_user<>v_member) then
  return jsonb_build_object('ok',false,'reason','room_not_authorized');
 end if;
 -- Session snapshots; active earnings are computed from the server time
 -- but never continue beyond 45 seconds after the latest heartbeat.
 with valued as (
  select t.*,
   case when t.stopped_at is null
    then greatest(0,floor(extract(epoch from
      (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at))/60)::bigint)*t.rate_cents
    else t.earned_cents end as due_cents
  from public.corp_private_photo_timers t
  where t.room_id=p_room_id and (v_since is null or t.started_at>=v_since)
 )
 select coalesce(sum(due_cents),0),coalesce(sum(case when settled_at is not null then due_cents else 0 end),0),
 coalesce(sum(case when settled_at is null then due_cents else 0 end),0)
 into v_assigned,v_paid,v_owed from valued;
 select jsonb_build_object('id',t.id,'photo_id',t.photo_id,
  'rate_cents',t.rate_cents,'started_at',t.started_at,'heartbeat_at',t.heartbeat_at,
  'running',t.heartbeat_at>=v_now-interval '75 seconds',
  'completed_minutes',greatest(0,floor(extract(epoch from
   (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at))/60)::bigint),
  'earned_cents',greatest(0,floor(extract(epoch from
   (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at))/60)::bigint)*t.rate_cents)
 into v_running from public.corp_private_photo_timers t
 where t.room_id=p_room_id and t.stopped_at is null order by t.started_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'photo_id',s.photo_id,
 'rate_cents',s.rate_cents,'started_at',s.started_at,'stopped_at',s.stopped_at,
 'completed_minutes',s.earned_cents/nullif(s.rate_cents,0),
 'earned_cents',s.earned_cents,'settled_at',s.settled_at)
 order by s.started_at desc),'[]'::jsonb) into v_recent
 from (select * from public.corp_private_photo_timers
 where room_id=p_room_id and stopped_at is not null
 and (v_since is null or started_at>=v_since)
 order by started_at desc limit 30) s;
 return jsonb_build_object('ok',true,'server_now',v_now,'active',v_running,
  'recent',v_recent,'assigned_cents',v_assigned,'paid_cents',v_paid,'owed_cents',v_owed);
end;$function$;

revoke all on function public.corp_redline_photo_timer_status(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_status(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_stop(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_now timestamptz:=clock_timestamp();
 v_timer public.corp_private_photo_timers%rowtype;v_end timestamptz;v_mins bigint;
begin
 if v_user is null or p_session_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_owner_required');
 end if;
 select * into v_timer from public.corp_private_photo_timers where id=p_session_id for update;
 if not found or v_user<>v_timer.owner_id then
  return jsonb_build_object('ok',false,'reason','session_not_authorized');
 end if;
 if v_timer.stopped_at is not null then
  return jsonb_build_object('ok',true,'earned_cents',v_timer.earned_cents,'completed_minutes',
    v_timer.earned_cents/nullif(v_timer.rate_cents,0));
 end if;
 v_end=greatest(v_timer.started_at,least(v_now,v_timer.heartbeat_at+interval '45 seconds'));
 v_mins=greatest(0,floor(extract(epoch from(v_end-v_timer.started_at))/60)::bigint);
 update public.corp_private_photo_timers
 set stopped_at=v_end,earned_cents=v_mins*v_timer.rate_cents where id=p_session_id;
 return jsonb_build_object('ok',true,'earned_cents',v_mins*v_timer.rate_cents,'completed_minutes',v_mins);
end;$function$;

revoke all on function public.corp_redline_photo_timer_stop(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_stop(uuid) to authenticated;

