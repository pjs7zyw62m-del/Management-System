-- Current timer status auto-finalizes 10s deadlines with server timestamps.
-- Owner heartbeats likewise close pending stops past the deadline.
-- Owner room preference separately enables/disables the sender veto right.
CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_status(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_owner uuid;v_member uuid;
 v_since timestamptz;v_now timestamptz:=clock_timestamp();
 v_assigned numeric;v_paid numeric;v_owed numeric;
 v_running jsonb;v_recent jsonb;v_photo_totals jsonb;v_stop_prompt jsonb;
begin
 if v_user is null or p_room_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_room_required');
 end if;
 select owner_id,member_id,current_session_started_at into v_owner,v_member,v_since
 from public.corp_private_photo_rooms where id=p_room_id;
 if not found or (v_user<>v_owner and v_user<>v_member) then
  return jsonb_build_object('ok',false,'reason','room_not_authorized');
 end if;
 PERFORM corp_private.redline_resolve_expired_timer_stops(p_room_id);
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
 IF v_running IS NOT NULL THEN
  SELECT jsonb_build_object('attempts',v.stop_attempts,'status',v.status,
   'pending_until',v.pending_until)
  INTO v_stop_prompt FROM corp_private.redline_timer_stop_veto v
  WHERE v.timer_id=(v_running->>'id')::uuid AND v.room_id=p_room_id;
 END IF;
 return jsonb_build_object('ok',true,'server_now',clock_timestamp(),
  'stop_prompt',v_stop_prompt,'active',v_running,
  'recent',v_recent,'photo_totals',v_photo_totals,
  'assigned_cents',v_assigned,'paid_cents',v_paid,'owed_cents',v_owed);
end;$function$
;
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
 PERFORM corp_private.redline_resolve_expired_timer_stops(v_timer.room_id);
 SELECT * INTO v_timer FROM public.corp_private_photo_timers WHERE id=p_session_id;
 IF v_timer.stopped_at IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','timer_stop_confirmed');
 END IF;
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
end;$function$
;
CREATE OR REPLACE FUNCTION public.corp_redline_room_feature_status(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
v_features corp_private.redline_room_features%ROWTYPE;
BEGIN
 IF v_user IS NULL OR NOT (SELECT corp_private.photo_ledger_verified())
 THEN RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms r
  WHERE r.id=p_room_id AND (r.owner_id=v_user OR r.member_id=v_user);
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_authorized');END IF;
 SELECT * INTO v_features FROM corp_private.redline_room_features WHERE room_id=p_room_id;
 RETURN jsonb_build_object('ok',true,'room_id',p_room_id,
 'timer_requests_enabled',coalesce(v_features.timer_requests_enabled,true),
 'negotiation_enabled',coalesce(v_features.negotiation_enabled,true),
 'sender_auto_accept',coalesce(v_features.sender_auto_accept,false),
 'sender_can_stop_timer',coalesce(v_features.sender_can_stop_timer,false),
 'sender_can_veto_stop_timer',coalesce(v_features.sender_can_veto_stop_timer,true));
END;$function$
;
CREATE OR REPLACE FUNCTION public.corp_redline_set_room_feature(p_room_id uuid, p_key text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
BEGIN
 IF v_user IS NULL OR p_enabled IS NULL OR
  NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
  WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT v_room.active OR
  NOT (v_room.owner_id=v_user OR v_room.member_id=v_user) THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_required');END IF;
 IF p_key NOT IN ('timer_requests_enabled','negotiation_enabled','sender_auto_accept','sender_can_stop_timer','sender_can_veto_stop_timer')
  OR (p_key='sender_auto_accept' AND v_room.member_id<>v_user)
  OR (p_key<>'sender_auto_accept' AND v_room.owner_id<>v_user)
 THEN RETURN jsonb_build_object('ok',false,'reason','feature_permission_denied');END IF;
 INSERT INTO corp_private.redline_room_features(room_id) VALUES(p_room_id)
  ON CONFLICT(room_id) DO NOTHING;
 IF p_key='timer_requests_enabled' THEN
  UPDATE corp_private.redline_room_features SET timer_requests_enabled=p_enabled,
   updated_at=clock_timestamp() WHERE room_id=p_room_id;
  IF NOT p_enabled THEN
   UPDATE corp_private.redline_timer_requests
    SET status='cancelled',responded_at=clock_timestamp()
    WHERE room_id=p_room_id AND status IN ('pending','accepted');
  END IF;
 ELSIF p_key='sender_can_veto_stop_timer' THEN
  UPDATE corp_private.redline_room_features SET sender_can_veto_stop_timer=p_enabled,
    updated_at=clock_timestamp() WHERE room_id=p_room_id;
 ELSIF p_key='sender_can_stop_timer' THEN
  UPDATE corp_private.redline_room_features SET sender_can_stop_timer=p_enabled,
    updated_at=clock_timestamp() WHERE room_id=p_room_id;
 ELSIF p_key='negotiation_enabled' THEN
  UPDATE corp_private.redline_room_features SET negotiation_enabled=p_enabled,
   updated_at=clock_timestamp() WHERE room_id=p_room_id;
  IF NOT p_enabled THEN
   UPDATE corp_private.redline_price_negotiations
    SET status='original_final',updated_at=clock_timestamp()
    WHERE room_id=p_room_id AND status IN ('awaiting_sender','awaiting_owner');
  END IF;
 ELSE
  UPDATE corp_private.redline_room_features SET sender_auto_accept=p_enabled,
   updated_at=clock_timestamp() WHERE room_id=p_room_id;
  IF NOT p_enabled THEN
   UPDATE corp_private.redline_timer_requests
    SET status='cancelled',responded_at=clock_timestamp()
    WHERE room_id=p_room_id AND status='accepted'
     AND consent_mode='preauthorized_timeout';
  END IF;
 END IF;
 RETURN public.corp_redline_room_feature_status(p_room_id);
END;$function$
;
