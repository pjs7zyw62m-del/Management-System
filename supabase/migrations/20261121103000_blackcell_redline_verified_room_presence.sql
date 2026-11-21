-- BLACKCELL REDLINE: room-scoped presence and online indicator.
-- The two verified participants alone can check one another's presence.
-- Presence is tab-specific, not a BLACKCELL OS-wide activity tracker.
create table if not exists public.corp_private_photo_presence (
 room_id uuid not null references public.corp_private_photo_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 active boolean not null default true,
 seen_at timestamptz not null default now(),
 primary key(room_id,user_id,session_id)
);
create index if not exists corp_redline_presence_room_time
 on public.corp_private_photo_presence(room_id,user_id,seen_at desc);
alter table public.corp_private_photo_presence enable row level security;
revoke all on public.corp_private_photo_presence from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_presence_status(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid:=(select auth.uid());
 v_other uuid;
 v_online boolean;
 v_last timestamptz;
begin
 if v_user is null or p_room_id is null
 or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_session_required');
 end if;
 select case when r.owner_id=v_user then r.member_id
             when r.member_id=v_user then r.owner_id
             else null end into v_other
 from public.corp_private_photo_rooms r where r.id=p_room_id;
 if v_other is null then
  return jsonb_build_object('ok',false,'reason','private_room_not_authorized');
 end if;
 select coalesce(bool_or(p.active and p.seen_at>now()-interval '105 seconds'),false),
        max(p.seen_at)
 into v_online,v_last
 from public.corp_private_photo_presence p
 where p.room_id=p_room_id and p.user_id=v_other;
 return jsonb_build_object('ok',true,'online',coalesce(v_online,false),
                          'last_active_at',v_last);
end;
$function$;

revoke all on function public.corp_redline_presence_status(uuid) from public,anon;
grant execute on function public.corp_redline_presence_status(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_presence_touch(p_room_id uuid, p_session_id uuid, p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid:=(select auth.uid());
 v_owner uuid;
 v_member uuid;
 v_room_active boolean;
begin
 if v_user is null or p_room_id is null or p_session_id is null or p_active is null
  or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_session_required');
 end if;
 select r.owner_id,r.member_id,r.active into v_owner,v_member,v_room_active
 from public.corp_private_photo_rooms r where r.id=p_room_id;
 if not found or (v_user<>v_owner and v_user<>v_member) then
  return jsonb_build_object('ok',false,'reason','private_room_not_authorized');
 end if;
 if p_active and not v_room_active then
  return jsonb_build_object('ok',false,'reason','room_closed');
 end if;
 insert into public.corp_private_photo_presence(room_id,user_id,session_id,active,seen_at)
 values(p_room_id,v_user,p_session_id,p_active,now())
 on conflict(room_id,user_id,session_id)
 do update set active=excluded.active,seen_at=excluded.seen_at;
 delete from public.corp_private_photo_presence p
 where p.room_id=p_room_id and p.user_id=v_user
 and p.seen_at < now()-interval '1 day';
 return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.corp_redline_presence_touch(uuid,uuid,boolean) from public,anon;
grant execute on function public.corp_redline_presence_touch(uuid,uuid,boolean) to authenticated;

