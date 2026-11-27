-- Staged finalizer: run only after deploying and verifying session export.
-- No source-media deletion or external transfer is performed here.
create or replace function public.corp_owner_redline_finalize_exported_room(
 p_room_id uuid,p_confirmation text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_room public.corp_private_photo_rooms%rowtype;
 v_missing integer;
 v_current jsonb;
 v_archive jsonb;
 v_deleted integer;
begin
 if auth.uid() is null or not public.corp_owner_validated() then
  return jsonb_build_object('ok',false,'reason','owner_verification_required');
 end if;
 if p_confirmation is distinct from 'END SESSION' then
  return jsonb_build_object('ok',false,'reason','confirmation_required');
 end if;
 select * into v_room from public.corp_private_photo_rooms
 where id=p_room_id and owner_id=auth.uid() for update;
 if not found or v_room.active then
  return jsonb_build_object('ok',false,'reason','closed_owned_room_required');
 end if;
 if exists(select 1 from public.corp_private_photo_timers where room_id=p_room_id and stopped_at is null) then
  return jsonb_build_object('ok',false,'reason','running_timer');
 end if;
 -- Lock all room records, preventing concurrent reviews from changing recipients.
 perform 1 from public.corp_private_photo_entries where room_id=p_room_id for update;
 -- Refuse if any non-removed photo lacks a completed independent library object.
 -- All sent photos are kept by sender, accepted photos also by receiver.
 select count(*) into v_missing
 from public.corp_private_photo_entries e
 cross join lateral (
  select v_room.member_id as recipient
  union all select v_room.owner_id where e.decision_status='accepted'
 ) r
 where e.room_id=p_room_id
 and not exists(select 1 from corp_private.redline_photo_removals x where x.photo_id=e.id)
 and not exists(
  select 1 from corp_private.redline_session_photo_exports x
  join public.bc_os_private_objects o on o.id=x.object_id
  where x.room_id=p_room_id and x.photo_id=e.id and x.recipient_id=r.recipient
   and o.user_id=r.recipient and o.state='ready' and o.source_object_id is null
 );
 if v_missing>0 then
  return jsonb_build_object('ok',false,'reason','library_exports_incomplete','missing_copies',v_missing);
 end if;
 -- Use existing authoritative settlement checks; never zero a balance to bypass them.
 v_current:=public.corp_redline_room_payment_status(p_room_id,false);
 v_archive:=public.corp_redline_room_payment_status(p_room_id,true);
 if v_current->>'ok' is distinct from 'true' or v_archive->>'ok' is distinct from 'true'
 or coalesce((v_current->>'remaining_cents')::numeric,-1)<>0
 or coalesce((v_archive->>'remaining_cents')::numeric,-1)<>0 then
  return jsonb_build_object('ok',false,'reason','settlement_not_verified');
 end if;
 -- Scope every delete to this exact closed room. FK cascades clear chat,
 -- presence, negotiations, payments, requests and trigger fees.
 delete from corp_private.redline_photo_bill_credits where room_id=p_room_id;
 delete from corp_private.redline_photo_removals where room_id=p_room_id;
 delete from corp_private.redline_repeat_photo_bonuses where room_id=p_room_id;
 delete from public.corp_redline_photo_ratings where photo_id in
  (select id from public.corp_private_photo_entries where room_id=p_room_id);
 with removed_timers as (
  delete from public.corp_private_photo_timers where room_id=p_room_id returning id
 ), removed_entries as (
  delete from public.corp_private_photo_entries where room_id=p_room_id returning id
 )
 select count(*) into v_deleted from removed_entries;
 delete from corp_private.redline_session_photo_exports where room_id=p_room_id;
 delete from public.corp_private_photo_rooms where id=p_room_id and not active;
 if not found then raise exception 'Room deletion not confirmed'; end if;
 return jsonb_build_object('ok',true,'deleted_room',p_room_id,'photo_records_deleted',v_deleted,'source_files_retained',true);
end;
$$;
revoke all on function public.corp_owner_redline_finalize_exported_room(uuid,text) from public,anon;
grant execute on function public.corp_owner_redline_finalize_exported_room(uuid,text) to authenticated;
