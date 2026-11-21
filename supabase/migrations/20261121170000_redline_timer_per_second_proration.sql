-- REDLINE server: rate per minute prorated for every elapsed WHOLE second.
-- Round the cumulative total once to integer cents; preserve historical settled timers.
-- Uses clock_timestamp and existing timeout/owner verification rules.
create or replace function corp_private.redline_timer_prorated_cents(p_rate_cents bigint,p_elapsed_seconds bigint) returns bigint language sql immutable strict set search_path to '' as $prorated$ select round(greatest(0,p_elapsed_seconds)::numeric * p_rate_cents::numeric / 60)::bigint $prorated$;
revoke all on function corp_private.redline_timer_prorated_cents(bigint,bigint) from public,anon,authenticated;

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
 earned_cents=corp_private.redline_timer_prorated_cents(t.rate_cents,
   greatest(0,floor(extract(epoch from
    (least(v_time,t.heartbeat_at+interval '45 seconds')-t.started_at)))::bigint))
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
  earned_cents=corp_private.redline_timer_prorated_cents(v_timer.rate_cents,
    greatest(0,floor(extract(epoch from
     (least(v_now,v_timer.heartbeat_at+interval '45 seconds')-v_timer.started_at)))::bigint))
  where id=v_timer.id;
  return jsonb_build_object('ok',false,'reason','timer_expired_or_room_closed');
 end if;
 update public.corp_private_photo_timers set heartbeat_at=v_now where id=p_session_id;
 return jsonb_build_object('ok',true);
end;$function$;

CREATE OR REPLACE FUNCTION corp_private.redline_end_timers_on_room_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_now timestamptz:=clock_timestamp();
begin
 if (old.active is true and new.active is false)
 or old.current_session_started_at is distinct from new.current_session_started_at then
  update public.corp_private_photo_timers t
  set stopped_at=greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds')),
      earned_cents=corp_private.redline_timer_prorated_cents(t.rate_cents,
       greatest(0,floor(extract(epoch from (
        greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at
       )))::bigint))
  where t.room_id=new.id and t.stopped_at is null;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_stop(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_now timestamptz:=clock_timestamp();
 v_timer public.corp_private_photo_timers%rowtype;v_end timestamptz;v_mins bigint;v_seconds bigint;v_amount bigint;v_applied boolean:=false;
begin
 if v_user is null or p_session_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_owner_required');
 end if;
 select * into v_timer from public.corp_private_photo_timers where id=p_session_id for update;
 if not found or v_user<>v_timer.owner_id then
  return jsonb_build_object('ok',false,'reason','session_not_authorized');
 end if;
 -- Idempotent: an earlier STOP can be retried without earning more.
 if v_timer.stopped_at is null then
  v_end=greatest(v_timer.started_at,least(v_now,v_timer.heartbeat_at+interval '45 seconds'));
  v_seconds=greatest(0,floor(extract(epoch from(v_end-v_timer.started_at)))::bigint);
  v_mins=v_seconds/60;
  v_amount=corp_private.redline_timer_prorated_cents(v_timer.rate_cents,v_seconds);
  update public.corp_private_photo_timers
  set stopped_at=v_end,earned_cents=v_amount where id=p_session_id;
 else
  v_amount=v_timer.earned_cents;
  v_seconds=greatest(0,floor(extract(epoch from(v_timer.stopped_at-v_timer.started_at)))::bigint);
  v_mins=v_seconds/60;
 end if;
 -- STOP is the owner's final acceptance instruction. For a previously
 -- unreviewed photo with a positive prorated-second price, price + accept it ATOMICALLY.
 -- Existing approved bids remain immutable; timed earnings stay itemized.
 if v_amount>0 then
  update public.corp_private_photo_entries e
  set amount_cents=v_amount,decision_status='accepted',auto_timer_session_id=v_timer.id
  where e.id=v_timer.photo_id and e.room_id=v_timer.room_id
   and e.decision_status='pending' and e.amount_cents is null
  returning true into v_applied;
 end if;
 return jsonb_build_object('ok',true,'earned_cents',v_amount,
  'completed_minutes',v_mins,'elapsed_seconds',v_seconds,'photo_id',v_timer.photo_id,
  'photo_auto_submitted',coalesce(v_applied,false),
  'photo_has_timer_price',exists(
    select 1 from public.corp_private_photo_entries e
    where e.id=v_timer.photo_id and e.auto_timer_session_id=v_timer.id
  ));
end;$function$;

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_status(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_owner uuid;v_member uuid;
 v_since timestamptz;v_now timestamptz:=clock_timestamp();
 v_assigned numeric;v_paid numeric;v_owed numeric;
 v_running jsonb;v_recent jsonb;v_photo_totals jsonb;
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
    then corp_private.redline_timer_prorated_cents(t.rate_cents,
      greatest(0,floor(extract(epoch from
       (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at)))::bigint))
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
   (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at)))::bigint)/60,
  'elapsed_seconds',greatest(0,floor(extract(epoch from
   (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at)))::bigint),
  'earned_cents',corp_private.redline_timer_prorated_cents(t.rate_cents,
   greatest(0,floor(extract(epoch from
    (greatest(t.started_at,least(v_now,t.heartbeat_at+interval '45 seconds'))-t.started_at)))::bigint)))
 into v_running from public.corp_private_photo_timers t
 where t.room_id=p_room_id and t.stopped_at is null order by t.started_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'photo_id',s.photo_id,
 'rate_cents',s.rate_cents,'started_at',s.started_at,'stopped_at',s.stopped_at,
 'completed_minutes',greatest(0,floor(extract(epoch from(s.stopped_at-s.started_at)))::bigint)/60,
 'elapsed_seconds',greatest(0,floor(extract(epoch from(s.stopped_at-s.started_at)))::bigint),
 'earned_cents',s.earned_cents,'settled_at',s.settled_at)
 order by s.started_at desc),'[]'::jsonb) into v_recent
 from (select * from public.corp_private_photo_timers
 where room_id=p_room_id and stopped_at is not null
 and (v_since is null or started_at>=v_since)
 order by started_at desc limit 30) s;
 -- Final recorded timed price by photograph: this never changes its separately
 -- immutable, owner-approved one-time bid. Aggregate ALL completed sessions,
 -- not only the newest 30 displayed in the activity feed.
 select coalesce(jsonb_agg(jsonb_build_object(
  'photo_id',s.photo_id,
  'timed_cents',s.timed_cents,
  'credited_to_photo_cents',s.credited_to_photo_cents,
  'additional_timed_cents',s.timed_cents-s.credited_to_photo_cents,
  'timed_paid_cents',s.paid_cents,
  'timed_owed_cents',s.owed_cents,
  'completed_minutes',s.completed_minutes,
  'elapsed_seconds',s.elapsed_seconds,
  'last_stopped_at',s.last_stopped_at
 ) order by s.last_stopped_at desc),'[]'::jsonb)
 into v_photo_totals
 from (
  select t.photo_id,
    sum(t.earned_cents)::bigint as timed_cents,
    sum(case when e.auto_timer_session_id=t.id then t.earned_cents else 0 end)::bigint as credited_to_photo_cents,
    sum(case when t.settled_at is null then 0 else t.earned_cents end)::bigint as paid_cents,
    sum(case when t.settled_at is null then t.earned_cents else 0 end)::bigint as owed_cents,
    sum(greatest(0,floor(extract(epoch from(t.stopped_at-t.started_at)))::bigint)/60)::bigint as completed_minutes,
    sum(greatest(0,floor(extract(epoch from(t.stopped_at-t.started_at)))::bigint))::bigint as elapsed_seconds,
    max(t.stopped_at) as last_stopped_at
  from public.corp_private_photo_timers t
  join public.corp_private_photo_entries e on e.id=t.photo_id and e.room_id=t.room_id
  where t.room_id=p_room_id and t.stopped_at is not null
   and (v_since is null or t.started_at>=v_since)
  group by t.photo_id
 ) s;
 return jsonb_build_object('ok',true,'server_now',v_now,'active',v_running,
  'recent',v_recent,'photo_totals',v_photo_totals,
  'assigned_cents',v_assigned,'paid_cents',v_paid,'owed_cents',v_owed);
end;$function$;


revoke all on function public.corp_redline_photo_timer_start(uuid,uuid,bigint) from public,anon;
revoke all on function public.corp_redline_photo_timer_heartbeat(uuid) from public,anon;
revoke all on function public.corp_redline_photo_timer_stop(uuid) from public,anon;
revoke all on function public.corp_redline_photo_timer_status(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_start(uuid,uuid,bigint) to authenticated;
grant execute on function public.corp_redline_photo_timer_heartbeat(uuid) to authenticated;
grant execute on function public.corp_redline_photo_timer_stop(uuid) to authenticated;
grant execute on function public.corp_redline_photo_timer_status(uuid) to authenticated;
