create or replace function redline_group_private.live_rpc(p_action text,p_room uuid,p_device uuid,p_peer uuid,p_watch uuid,p_sdp text,p_members uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sid_text text:=auth.jwt()->>'session_id';sid uuid;boss uuid;owner boolean;rows jsonb;r redline_group_private.streams%rowtype;ids uuid[];req integer;
begin
 if u is null or sid_text is null or sid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Verified session required' using errcode='42501';end if;
 sid:=sid_text::uuid;
 if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=u) or not coalesce(corp_private.photo_ledger_verified(),false) then raise exception 'Verified session required' using errcode='42501';end if;
 select owner_id into boss from redline_group_private.rooms where id=p_room;
 if boss is null then raise exception 'Room unavailable' using errcode='42501';end if;
 owner:=boss=u;
 if not exists(select 1 from public.corp_access_members m where m.user_id=boss and m.active and m.role='owner' and m.clearance_level=7) then raise exception 'Room unavailable' using errcode='42501';end if;
 if owner then
  if not coalesce((public.corp_code_status()->>'verified')::boolean,false) then raise exception 'Verified owner required' using errcode='42501';end if;
 else
  if not exists(select 1 from redline_group_private.members m where m.room_id=p_room and m.user_id=u) or not coalesce((public.corp_employee_code_status()->>'verified')::boolean,false) then raise exception 'Room unavailable' using errcode='42501';end if;
 end if;
 -- Serialize edits to a room and its stream slots. Never return another publisher's SDP to a member.
 perform pg_advisory_xact_lock(hashtextextended(p_room::text,672));
 delete from redline_group_private.streams s where s.room_id=p_room and (s.publisher_seen<now()-interval '55 seconds' or s.started_at<now()-interval '4 hours' or not exists(select 1 from redline_group_private.members m join public.corp_access_members a on a.user_id=m.user_id where m.room_id=s.room_id and m.user_id=s.publisher and a.active and a.role='employee' and a.password_activated_at is not null) or not exists(select 1 from auth.sessions a where a.id=s.publisher_session and a.user_id=s.publisher));
 update redline_group_private.streams s set viewer_session=null,viewer_device=null,watch_id=null,offer=null,answer=null,viewer_seen=null where s.room_id=p_room and s.viewer_session is not null and (s.viewer_seen<now()-interval '55 seconds' or not exists(select 1 from auth.sessions a where a.id=s.viewer_session and a.user_id=boss));
 if p_action='roster' then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(a.display_name,'Participant'),'mine',m.user_id=u,'room_id',case when owner or m.user_id=u then pr.id end,'room_active',case when owner or m.user_id=u then pr.active end,'pending',case when (owner or m.user_id=u) and pr.id is not null then (select count(*) from public.corp_private_photo_entries e where e.room_id=pr.id and e.decision_status='pending' and (pr.current_session_started_at is null or e.created_at>=pr.current_session_started_at) and not exists(select 1 from corp_private.redline_photo_removals rm where rm.room_id=pr.id and rm.photo_id=e.id)) end) order by a.display_name),'[]'::jsonb) into rows
  from redline_group_private.members m join public.corp_access_members a on a.user_id=m.user_id and a.active and a.role='employee' and a.password_activated_at is not null
  left join lateral(select p.id,p.active,p.current_session_started_at from public.corp_private_photo_rooms p where p.owner_id=boss and p.member_id=m.user_id order by p.active desc,p.created_at desc limit 1) pr on true
  where m.room_id=p_room;
  return jsonb_build_object('ok',true,'owner',owner,'members',rows);
 elsif p_action='invite' then
  if not owner then raise exception 'Owner only' using errcode='42501';end if;
  select array_agg(distinct x) into ids from unnest(p_members) x where x is not null;
  if coalesce(cardinality(ids),0) not between 1 and 20 or (select count(*) from redline_group_private.members where room_id=p_room)+cardinality(ids)>100 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.corp_access_members a join auth.users z on z.id=a.user_id where a.user_id=x and a.active and a.role='employee' and a.password_activated_at is not null and z.email_confirmed_at is not null)) then raise exception 'Invalid participants';end if;
  insert into redline_group_private.members(room_id,user_id) select p_room,x from unnest(ids) x on conflict do nothing;return jsonb_build_object('ok',true);
 elsif p_action='turn' then
  insert into redline_group_private.turn_requests(user_id,window_start,requests) values(u,now(),1)
  on conflict(user_id) do update set requests=case when redline_group_private.turn_requests.window_start<now()-interval '15 minutes' then 1 else redline_group_private.turn_requests.requests+1 end,window_start=case when redline_group_private.turn_requests.window_start<now()-interval '15 minutes' then now() else redline_group_private.turn_requests.window_start end returning requests into req;
  return jsonb_build_object('ok',req<=8);
 end if;
 if p_device is null then raise exception 'Device required';end if;
 if p_action='start' then
  if owner then raise exception 'Only invited streamers broadcast in this pilot';end if;
  if exists(select 1 from redline_group_private.streams where room_id=p_room and publisher=u and (publisher_session<>sid or publisher_device<>p_device)) then raise exception 'Another device is broadcasting';end if;
  if not exists(select 1 from redline_group_private.streams where room_id=p_room and publisher=u) and (select count(*) from redline_group_private.streams where room_id=p_room)>=4 then raise exception 'Four webcam slots are occupied';end if;
  insert into redline_group_private.streams(room_id,publisher,publisher_session,publisher_device) values(p_room,u,sid,p_device)
  on conflict(room_id,publisher) do update set publisher_seen=clock_timestamp();
 elsif p_action='stop' then
  delete from redline_group_private.streams where room_id=p_room and publisher=u and publisher_session=sid and publisher_device=p_device;
 elsif p_action='offer' then
  if not owner or p_watch is null or p_peer is null or p_sdp is null or length(p_sdp)>64000 or left(p_sdp,3)<>'v=0' then raise exception 'Invalid watch request';end if;
  update redline_group_private.streams s set viewer_session=sid,viewer_device=p_device,watch_id=p_watch,offer=p_sdp,answer=null,viewer_seen=clock_timestamp()
  where s.room_id=p_room and s.publisher=p_peer and (s.viewer_session is null or (s.viewer_session=sid and s.viewer_device=p_device));
  if not found then raise exception 'Stream unavailable or already being watched on another device';end if;
 elsif p_action='answer' then
  if owner or p_watch is null or p_sdp is null or length(p_sdp)>64000 or left(p_sdp,3)<>'v=0' then raise exception 'Invalid stream response';end if;
  update redline_group_private.streams s set answer=p_sdp,publisher_seen=clock_timestamp() where s.room_id=p_room and s.publisher=u and s.publisher_session=sid and s.publisher_device=p_device and s.watch_id=p_watch and s.offer is not null;
  if not found then raise exception 'Watch request expired';end if;
 elsif p_action='unwatch' then
  if not owner then raise exception 'Owner only';end if;
  update redline_group_private.streams s set viewer_session=null,viewer_device=null,watch_id=null,offer=null,answer=null,viewer_seen=null where s.room_id=p_room and s.publisher=p_peer and s.viewer_session=sid and s.viewer_device=p_device and s.watch_id=p_watch;
 elsif p_action='poll' then
  if owner then update redline_group_private.streams s set viewer_seen=clock_timestamp() where s.room_id=p_room and s.viewer_session=sid and s.viewer_device=p_device;
  else update redline_group_private.streams s set publisher_seen=clock_timestamp() where s.room_id=p_room and s.publisher=u and s.publisher_session=sid and s.publisher_device=p_device;end if;
 else raise exception 'Unsupported action';end if;
 select coalesce(jsonb_agg(jsonb_build_object('publisher',s.publisher,'stream',s.stream_id,'started_at',s.started_at,
 'watch',case when (owner and s.viewer_session=sid and s.viewer_device=p_device) or (not owner and s.publisher_session=sid and s.publisher_device=p_device) then s.watch_id end,
 'offer',case when not owner and s.publisher_session=sid and s.publisher_device=p_device then s.offer end,
 'answer',case when owner and s.viewer_session=sid and s.viewer_device=p_device then s.answer end,
 'owned',not owner and s.publisher_session=sid and s.publisher_device=p_device,
 'watching',s.viewer_session is not null) order by s.started_at),'[]'::jsonb) into rows
 from redline_group_private.streams s where s.room_id=p_room and (owner or s.publisher=u);
 return jsonb_build_object('ok',true,'streams',rows);
end $$;
