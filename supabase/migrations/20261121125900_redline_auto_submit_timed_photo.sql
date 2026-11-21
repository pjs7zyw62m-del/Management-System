-- REDLINE receiver STOP TIMER: commit completed-minute price to photo once.
-- Existing approved one-time bids stay immutable. A photo may have an accepted
-- price originating in a timer; photo_totals excludes that portion when
-- computing supplementary timed price to avoid double-counting.
alter table public.corp_private_photo_entries
 add column if not exists auto_timer_session_id uuid;
-- A photo can be automatically accepted by a stopped timer exactly once.
alter table public.corp_private_photo_entries
 add constraint redline_auto_timer_session_fk
 foreign key(auto_timer_session_id)
 references public.corp_private_photo_timers(id) on delete restrict;

create or replace function corp_private.redline_timer_photo_link_guard()
returns trigger language plpgsql security definer set search_path=''
as $guard$
begin
 if new.auto_timer_session_id is distinct from old.auto_timer_session_id then
  if old.auto_timer_session_id is not null or old.decision_status<>'pending'
   or new.decision_status<>'accepted' or new.auto_timer_session_id is null
   or not exists(
    select 1 from public.corp_private_photo_timers t
    where t.id=new.auto_timer_session_id and t.photo_id=new.id
     and t.room_id=new.room_id and t.stopped_at is not null
     and t.earned_cents>0 and t.earned_cents=new.amount_cents
   )
  then raise exception 'Invalid or modified automatic timer price'
    using errcode='23514';
  end if;
 end if;
 return new;
end;$guard$;
revoke all on function corp_private.redline_timer_photo_link_guard() from public,anon,authenticated;
drop trigger if exists redline_timer_photo_link_guard on public.corp_private_photo_entries;
create trigger redline_timer_photo_link_guard
 before update on public.corp_private_photo_entries for each row
 execute function corp_private.redline_timer_photo_link_guard();

CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_stop(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid());v_now timestamptz:=clock_timestamp();
 v_timer public.corp_private_photo_timers%rowtype;v_end timestamptz;v_mins bigint; v_amount bigint;v_applied boolean:=false;
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
  v_mins=greatest(0,floor(extract(epoch from(v_end-v_timer.started_at))/60)::bigint);
  v_amount=v_mins*v_timer.rate_cents;
  update public.corp_private_photo_timers
  set stopped_at=v_end,earned_cents=v_amount where id=p_session_id;
 else
  v_amount=v_timer.earned_cents;
  v_mins=v_amount/nullif(v_timer.rate_cents,0);
 end if;
 -- STOP is the owner's final acceptance instruction. For a previously
 -- unreviewed photo with >=1 full minute, price + accept it ATOMICALLY.
 -- Existing approved bids remain immutable; timed earnings stay itemized.
 if v_amount>0 then
  update public.corp_private_photo_entries e
  set amount_cents=v_amount,decision_status='accepted',auto_timer_session_id=v_timer.id
  where e.id=v_timer.photo_id and e.room_id=v_timer.room_id
   and e.decision_status='pending' and e.amount_cents is null
  returning true into v_applied;
 end if;
 return jsonb_build_object('ok',true,'earned_cents',v_amount,
  'completed_minutes',v_mins,'photo_id',v_timer.photo_id,
  'photo_auto_submitted',coalesce(v_applied,false),
  'photo_has_timer_price',exists(
    select 1 from public.corp_private_photo_entries e
    where e.id=v_timer.photo_id and e.auto_timer_session_id=v_timer.id
  ));
end;$function$;


revoke all on function public.corp_redline_photo_timer_stop(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_stop(uuid) to authenticated;

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
  'credited_to_photo_cents',s.credited_to_photo_cents,
  'additional_timed_cents',s.timed_cents-s.credited_to_photo_cents,
  'timed_paid_cents',s.paid_cents,
  'timed_owed_cents',s.owed_cents,
  'completed_minutes',s.completed_minutes,
  'last_stopped_at',s.last_stopped_at
 ) order by s.last_stopped_at desc),'[]'::jsonb)
 into v_photo_totals
 from (
  select t.photo_id,
    sum(t.earned_cents)::bigint as timed_cents,
    sum(case when e.auto_timer_session_id=t.id then t.earned_cents else 0 end)::bigint as credited_to_photo_cents,
    sum(case when t.settled_at is null then 0 else t.earned_cents end)::bigint as paid_cents,
    sum(case when t.settled_at is null then t.earned_cents else 0 end)::bigint as owed_cents,
    sum(t.earned_cents/nullif(t.rate_cents,0))::bigint as completed_minutes,
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



revoke all on function public.corp_redline_photo_timer_status(uuid) from public,anon;
grant execute on function public.corp_redline_photo_timer_status(uuid) to authenticated;

-- Reconcile a previously stopped, still-unreviewed photo only if exactly
-- one positive, completed timer exists for it. Do not modify manual reviews.
with prior as (
 select e.id as entry_id, max(t.id::text)::uuid as timer_id,
        max(t.earned_cents) as amount_cents
 from public.corp_private_photo_entries e
 join public.corp_private_photo_timers t on t.photo_id=e.id and t.room_id=e.room_id
 where e.decision_status='pending' and e.amount_cents is null
   and t.stopped_at is not null and t.earned_cents>0
 group by e.id
 having count(*)=1
)
update public.corp_private_photo_entries e
 set amount_cents=p.amount_cents,decision_status='accepted',
     auto_timer_session_id=p.timer_id
 from prior p where e.id=p.entry_id and e.decision_status='pending';
