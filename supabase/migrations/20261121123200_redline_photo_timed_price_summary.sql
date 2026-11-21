-- REDLINE: automatically surface completed-minute timed price on the
-- associated photograph. Preserve separate immutable one-time bid records.
-- No photo decision, posted amount or paid status is changed.
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
 -- Final recorded timed price by photograph: this never changes its separately
 -- immutable, owner-approved one-time bid. Aggregate ALL completed sessions,
 -- not only the newest 30 displayed in the activity feed.
 select coalesce(jsonb_agg(jsonb_build_object(
  'photo_id',s.photo_id,
  'timed_cents',s.timed_cents,
  'timed_paid_cents',s.paid_cents,
  'timed_owed_cents',s.owed_cents,
  'completed_minutes',s.completed_minutes,
  'last_stopped_at',s.last_stopped_at
 ) order by s.last_stopped_at desc),'[]'::jsonb)
 into v_photo_totals
 from (
  select t.photo_id,
    sum(t.earned_cents)::bigint as timed_cents,
    sum(case when t.settled_at is null then 0 else t.earned_cents end)::bigint as paid_cents,
    sum(case when t.settled_at is null then t.earned_cents else 0 end)::bigint as owed_cents,
    sum(t.earned_cents/nullif(t.rate_cents,0))::bigint as completed_minutes,
    max(t.stopped_at) as last_stopped_at
  from public.corp_private_photo_timers t
  where t.room_id=p_room_id and t.stopped_at is not null
   and (v_since is null or t.started_at>=v_since)
  group by t.photo_id
 ) s;
 return jsonb_build_object('ok',true,'server_now',v_now,'active',v_running,
  'recent',v_recent,'photo_totals',v_photo_totals,
  'assigned_cents',v_assigned,'paid_cents',v_paid,'owed_cents',v_owed);
end;$function$;


revoke all on function public.corp_redline_photo_timer_status(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_status(uuid) to authenticated;
