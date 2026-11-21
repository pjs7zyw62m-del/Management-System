-- REDLINE viewing presence: the sender may see the exact photo displayed
-- in their private room by the verified owner. This is NOT a read receipt.
-- All image bytes remain in private storage with the existing signed URLs.
create table if not exists corp_private.redline_currently_viewing (
 room_id uuid primary key references public.corp_private_photo_rooms(id) on delete cascade,
 photo_id uuid references public.corp_private_photo_entries(id) on delete set null,
 updated_at timestamptz not null default clock_timestamp()
);
alter table corp_private.redline_currently_viewing enable row level security;
revoke all on corp_private.redline_currently_viewing from public,anon,authenticated;

create or replace function public.corp_redline_set_currently_viewing(
 p_room_id uuid,p_photo_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 v_user uuid:=(select auth.uid());
 v_room public.corp_private_photo_rooms%rowtype;
begin
 if v_user is null or p_room_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_owner_required');
 end if;
 select * into v_room from public.corp_private_photo_rooms
 where id=p_room_id and owner_id=v_user and active;
 if not found then return jsonb_build_object('ok',false,'reason','owner_room_required'); end if;
 if p_photo_id is not null and not exists (
  select 1 from public.corp_private_photo_entries e
  where e.id=p_photo_id and e.room_id=v_room.id
   and e.uploaded_by=v_room.member_id
   and (v_room.current_session_started_at is null
    or e.created_at>=v_room.current_session_started_at)
 ) then
  return jsonb_build_object('ok',false,'reason','photo_not_in_current_room');
 end if;
 insert into corp_private.redline_currently_viewing(room_id,photo_id,updated_at)
 values(v_room.id,p_photo_id,clock_timestamp())
 on conflict(room_id) do update set
 photo_id=excluded.photo_id,updated_at=excluded.updated_at;
 return jsonb_build_object('ok',true,'photo_id',p_photo_id);
end;$function$;

create or replace function public.corp_redline_currently_viewing_status(
 p_room_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 v_user uuid:=(select auth.uid());
 v_room public.corp_private_photo_rooms%rowtype;
 v_photo uuid;v_updated timestamptz;
begin
 if v_user is null or p_room_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_room_required');
 end if;
 select * into v_room from public.corp_private_photo_rooms
 where id=p_room_id and (owner_id=v_user or member_id=v_user);
 if not found then return jsonb_build_object('ok',false,'reason','room_not_authorized'); end if;
 if not v_room.active then
  return jsonb_build_object('ok',true,'photo_id',null,'active',false);
 end if;
 select photo_id,updated_at into v_photo,v_updated
 from corp_private.redline_currently_viewing where room_id=p_room_id;
 if v_updated is null or v_updated<clock_timestamp()-interval '45 seconds'
    or v_photo is null or not exists(
     select 1 from public.corp_private_photo_entries e
     where e.id=v_photo and e.room_id=v_room.id
      and e.uploaded_by=v_room.member_id
      and (v_room.current_session_started_at is null
       or e.created_at>=v_room.current_session_started_at)
    ) then
  return jsonb_build_object('ok',true,'photo_id',null,'active',false);
 end if;
 return jsonb_build_object('ok',true,'photo_id',v_photo,'active',true,
  'updated_at',v_updated);
end;$function$;

revoke all on function public.corp_redline_set_currently_viewing(uuid,uuid)
 from public,anon;
revoke all on function public.corp_redline_currently_viewing_status(uuid)
 from public,anon;
grant execute on function public.corp_redline_set_currently_viewing(uuid,uuid)
 to authenticated;
grant execute on function public.corp_redline_currently_viewing_status(uuid)
 to authenticated;
