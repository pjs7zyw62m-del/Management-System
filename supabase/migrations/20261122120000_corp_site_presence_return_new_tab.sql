-- Recognize signed-in users returning with a new tab after leaving.
create or replace function public.corp_site_presence_touch(
  p_session_id uuid, p_device_id uuid, p_visible boolean, p_device_label text default 'Unknown device'
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid := (select auth.uid());
 v_old public.corp_site_presence%rowtype;
 v_previous public.corp_site_presence%rowtype;
 v_now timestamptz := now();
 v_device text;
begin
 if v_user is null or p_session_id is null or p_device_id is null or p_visible is null then
  return jsonb_build_object('ok',false,'reason','invalid_session');
 end if;
 if not exists (select 1 from public.corp_access_members m where m.user_id=v_user and m.active=true) then
  return jsonb_build_object('ok',false,'reason','not_an_active_member');
 end if;
 v_device := case when p_device_label in
 ('Android phone','Android tablet','iPhone','iPad','Windows desktop','Mac desktop','Linux desktop','Other device')
 then p_device_label else 'Other device' end;

 select * into v_old from public.corp_site_presence
 where user_id=v_user and session_id=p_session_id for update;
 if not found then
  -- Reopening the website can create a new tab ID. Recognize a returning device.
  select * into v_previous from public.corp_site_presence
  where user_id=v_user and device_id=p_device_id and session_id<>p_session_id
  order by last_seen desc limit 1;
  if found and p_visible and v_previous.visible
     and v_previous.last_seen < v_now-interval '105 seconds' then
    insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
    values(v_user,v_previous.session_id,'left',v_previous.last_seen+interval '105 seconds');
  end if;
  insert into public.corp_site_presence(user_id,session_id,device_id,device_label,visible,first_seen,last_seen,changed_at)
  values(v_user,p_session_id,p_device_id,v_device,p_visible,v_now,v_now,v_now);
  insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
  values(v_user,p_session_id,
    case when p_visible and v_previous.session_id is not null
       and (not v_previous.visible or v_previous.last_seen < v_now-interval '105 seconds')
    then 'returned' when p_visible then 'arrived' else 'left' end,v_now);
 else
  if p_visible and (not v_old.visible or v_old.last_seen < v_now-interval '105 seconds') then
   -- A suspended/closed browser often cannot send its final leave request.
   if v_old.visible and v_old.last_seen < v_now-interval '105 seconds' then
    insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
    values(v_user,p_session_id,'left',v_old.last_seen+interval '105 seconds');
   end if;
   insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
   values(v_user,p_session_id,'returned',v_now);
  elsif not p_visible and v_old.visible then
   insert into public.corp_site_presence_events(user_id,session_id,event_type,event_at)
   values(v_user,p_session_id,'left',v_now);
  end if;
  update public.corp_site_presence
  set device_id=p_device_id,device_label=v_device,visible=p_visible,last_seen=v_now,
   changed_at=case when v_old.visible is distinct from p_visible
     or (p_visible and v_old.last_seen < v_now-interval '105 seconds') then v_now else v_old.changed_at end
  where user_id=v_user and session_id=p_session_id;
 end if;
 return jsonb_build_object('ok',true);
end;
$function$;
