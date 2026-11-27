-- Staged migration: private REDLINE export reservations, no room deletion.
create table corp_private.redline_session_photo_exports(
 room_id uuid not null,
 photo_id uuid not null,
 recipient_id uuid not null,
 object_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(room_id,photo_id,recipient_id)
);
alter table corp_private.redline_session_photo_exports enable row level security;
revoke all on corp_private.redline_session_photo_exports from public,anon,authenticated;
create or replace function public.corp_redline_reserve_session_photo_export(p_room uuid,p_photo uuid,p_recipient uuid,p_size bigint,p_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_room public.corp_private_photo_rooms%rowtype; v_photo public.corp_private_photo_entries%rowtype; v_existing uuid; v_id uuid; v_path text;
begin
 select * into v_room from public.corp_private_photo_rooms where id=p_room for update;
 if not found or v_room.active then raise exception 'Closed REDLINE room required'; end if;
 select * into v_photo from public.corp_private_photo_entries where id=p_photo and room_id=p_room;
 if not found or v_photo.uploaded_by<>v_room.member_id or p_recipient is null or
   not (p_recipient=v_room.member_id or (p_recipient=v_room.owner_id and v_photo.decision_status='accepted'))
   or exists(select 1 from corp_private.redline_photo_removals where photo_id=p_photo)
 then raise exception 'Photo export not authorized'; end if;
 if v_photo.image_path !~ ('^redline/v1/'||p_room::text||'/'||v_room.member_id::text||'/'||p_photo::text||'\.(jpg|png|webp|heic|heif)$') then raise exception 'Legacy or invalid source'; end if;
 select object_id into v_existing from corp_private.redline_session_photo_exports where room_id=p_room and photo_id=p_photo and recipient_id=p_recipient;
 if found then
   if not exists(select 1 from public.bc_os_private_objects where id=v_existing and user_id=p_recipient and size_bytes=p_size and state in ('uploading','ready')) then raise exception 'Export reservation changed; reconcile before retry'; end if;
   return v_existing;
 end if;
 v_path:='Photos/From Members/REDLINE/'||p_room::text||'/'||p_photo::text||'.'||split_part(v_photo.image_path,'.',2);
 v_id:=public.bc_os_private_reserve(p_recipient,v_path,p_size,p_key);
 insert into corp_private.redline_session_photo_exports(room_id,photo_id,recipient_id,object_id) values(p_room,p_photo,p_recipient,v_id);
 return v_id;
end;
$$;
revoke all on function public.corp_redline_reserve_session_photo_export(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.corp_redline_reserve_session_photo_export(uuid,uuid,uuid,bigint,text) to service_role;
-- The service-only RPC is the only required entry point; no private schema grants.

