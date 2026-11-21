-- REDLINE: resends require BOTH an approved original priced $0.01 or above
-- AND a genuine 5-star receiver rating. Other photos remain visible in history.
-- Pending, rejected or archived photos are never eligible to resend.
CREATE OR REPLACE FUNCTION corp_private.redline_validate_five_star_resubmission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_source public.corp_private_photo_entries%ROWTYPE;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_rating smallint;
BEGIN
 IF NEW.resubmission_origin_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.resubmission_origin_id=NEW.id THEN
  RAISE EXCEPTION 'A photograph cannot resubmit itself' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_source FROM public.corp_private_photo_entries
 WHERE id=NEW.resubmission_origin_id AND room_id=NEW.room_id;
 IF NOT FOUND OR v_source.resubmission_origin_id IS NOT NULL
    OR v_source.uploaded_by IS DISTINCT FROM (SELECT auth.uid())
    OR v_source.decision_status <> 'accepted'
    OR coalesce(v_source.amount_cents,0)<1 THEN
  RAISE EXCEPTION 'Resend requires an original photo approved for at least $0.01'
    USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=NEW.room_id AND member_id=(SELECT auth.uid())
   AND active AND NOT photo_sending_paused;
 IF NOT FOUND OR (v_room.current_session_started_at IS NOT NULL
   AND v_source.created_at < v_room.current_session_started_at) THEN
  RAISE EXCEPTION 'Resubmissions are unavailable in this room or session'
    USING ERRCODE='23514';
 END IF;
 SELECT stars INTO v_rating FROM public.corp_redline_photo_ratings
 WHERE photo_id=v_source.id;
 IF v_rating IS DISTINCT FROM 5 THEN
  RAISE EXCEPTION 'Resend requires an approved photo rated exactly 5 stars' USING ERRCODE='23514';
 END IF;
 -- Serialize simultaneous duplicate submissions of this same source photo.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_source.id::text,0));
 IF EXISTS(
  SELECT 1 FROM public.corp_private_photo_entries prior
  WHERE prior.room_id=NEW.room_id
   AND prior.resubmission_origin_id=v_source.id
   AND prior.decision_status IN ('pending','rejected')
 ) THEN
  RAISE EXCEPTION 'Photo is waiting for review or was rejected; no further resubmissions'
    USING ERRCODE='23514';
 END IF;
 -- Source bytes must be copied into a fresh private storage key by the
 -- verified sender. Do not permit changing ownership or archive scope.
 IF NEW.uploaded_by IS DISTINCT FROM (SELECT auth.uid())
    OR NEW.decision_status<>'pending'
    OR NEW.amount_cents IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid pending private photo resend'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;

-- Room-scoped chat signals contain no message bodies and no contact data.
-- They live in a PRIVATE schema with RLS, unreachable by direct API queries.
create table if not exists corp_private.redline_chat_signals(
 room_id uuid not null references public.corp_private_photo_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 last_read_at timestamptz,
 typing_until timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(room_id,user_id)
);
alter table corp_private.redline_chat_signals enable row level security;
revoke all on corp_private.redline_chat_signals from public,anon,authenticated;

-- Read must be tied to a message actually returned in this participant's
-- current-session chat, never simply to entering the room or opening a preview.
create or replace function public.corp_redline_chat_signal(
 p_room_id uuid,p_action text,p_message_id uuid default null
) returns jsonb language plpgsql security definer set search_path to '' as $func$
declare
 v_user uuid:=(select auth.uid());
 v_room public.corp_private_photo_rooms%rowtype;
 v_now timestamptz:=clock_timestamp();
 v_seen_at timestamptz;
begin
 if v_user is null or p_room_id is null or p_action not in ('typing','stopped','read')
 or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_room_required');
 end if;
 select * into v_room from public.corp_private_photo_rooms
 where id=p_room_id and (owner_id=v_user or member_id=v_user);
 if not found then return jsonb_build_object('ok',false,'reason','room_not_authorized'); end if;
 if p_action='read' then
  if p_message_id is null then return jsonb_build_object('ok',false,'reason','message_required'); end if;
  select created_at into v_seen_at from public.corp_private_photo_messages
  where id=p_message_id and room_id=p_room_id and sender_id<>v_user
    and (v_room.current_session_started_at is null or created_at>=v_room.current_session_started_at);
  if not found then return jsonb_build_object('ok',false,'reason','message_not_readable'); end if;
 end if;
 if p_action='typing' and not v_room.active then
  return jsonb_build_object('ok',false,'reason','room_closed');
 end if;
 insert into corp_private.redline_chat_signals(room_id,user_id,last_read_at,typing_until,updated_at)
 values(p_room_id,v_user,
  case when p_action='read' then v_seen_at else null end,
  case when p_action='typing' then v_now+interval '6 seconds' else null end,v_now)
 on conflict (room_id,user_id) do update set
  last_read_at=case when p_action='read' then greatest(
   coalesce(corp_private.redline_chat_signals.last_read_at,'-infinity'::timestamptz),v_seen_at)
   else corp_private.redline_chat_signals.last_read_at end,
  typing_until=case when p_action='typing' then v_now+interval '6 seconds'
   when p_action='stopped' then null
   else corp_private.redline_chat_signals.typing_until end,
  updated_at=v_now;
 return jsonb_build_object('ok',true);
end;$func$;

create or replace function public.corp_redline_chat_status(p_room_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $func$
declare
 v_user uuid:=(select auth.uid());
 v_room public.corp_private_photo_rooms%rowtype;
 v_peer uuid;
 v_read_at timestamptz;
 v_typing_until timestamptz;
begin
 if v_user is null or p_room_id is null or not (select corp_private.photo_ledger_verified()) then
  return jsonb_build_object('ok',false,'reason','verified_room_required');
 end if;
 select * into v_room from public.corp_private_photo_rooms
 where id=p_room_id and (owner_id=v_user or member_id=v_user);
 if not found then return jsonb_build_object('ok',false,'reason','room_not_authorized'); end if;
 v_peer=case when v_user=v_room.owner_id then v_room.member_id else v_room.owner_id end;
 select last_read_at,typing_until into v_read_at,v_typing_until
 from corp_private.redline_chat_signals
 where room_id=p_room_id and user_id=v_peer;
 return jsonb_build_object('ok',true,'peer_read_at',v_read_at,
  'peer_typing',coalesce(v_room.active and v_typing_until>clock_timestamp(),false),
  'peer_typing_until',v_typing_until);
end;$func$;
revoke all on function public.corp_redline_chat_signal(uuid,text,uuid) from public,anon;
revoke all on function public.corp_redline_chat_status(uuid) from public,anon;
grant execute on function public.corp_redline_chat_signal(uuid,text,uuid) to authenticated;
grant execute on function public.corp_redline_chat_status(uuid) to authenticated;
