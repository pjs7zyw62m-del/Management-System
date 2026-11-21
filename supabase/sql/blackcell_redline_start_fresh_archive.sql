-- BLACKCELL REDLINE: non-destructive session reset / archive boundary.
-- Applied to the existing Supabase project before publication.
-- No uploaded media, messages, settlements, or historical entries are deleted.
alter table public.corp_private_photo_rooms
 add column if not exists current_session_started_at timestamptz;

create or replace function public.corp_owner_redline_start_fresh(
  p_confirmation text,
  p_room_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_owner uuid:=(select auth.uid());
  v_at timestamptz:=clock_timestamp();
  v_updated integer:=0;
begin
 if not public.corp_owner_validated() or v_owner is null then
   return jsonb_build_object('ok',false,'reason','owner_verification_required');
 end if;
 if p_room_id is null and p_confirmation <> 'RESET REDLINE' then
   return jsonb_build_object('ok',false,'reason','confirmation_required');
 end if;
 if p_room_id is not null and p_confirmation <> 'START FRESH' then
   return jsonb_build_object('ok',false,'reason','confirmation_required');
 end if;
 update public.corp_private_photo_rooms
 set current_session_started_at=v_at,updated_at=v_at
 where owner_id=v_owner and (p_room_id is null or id=p_room_id);
 get diagnostics v_updated = row_count;
 if p_room_id is not null and v_updated<>1 then
   return jsonb_build_object('ok',false,'reason','room_not_found');
 end if;
 return jsonb_build_object('ok',true,'rooms_reset',v_updated,
   'started_at',v_at,'archived_only',true);
end
$function$;
revoke all on function public.corp_owner_redline_start_fresh(text,uuid) from public;
revoke all on function public.corp_owner_redline_start_fresh(text,uuid) from anon;
grant execute on function public.corp_owner_redline_start_fresh(text,uuid) to authenticated;
