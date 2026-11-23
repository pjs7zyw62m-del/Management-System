-- REDLINE: render server-recorded Trigger Word FEE/EARNED on both chat views.
-- Read-only, no new charges. Returns only hits for explicitly supplied private
-- room message IDs after verifying sender/receiver and current session.
CREATE OR REPLACE FUNCTION public.corp_redline_trigger_chat_events(
 p_room_id uuid,
 p_message_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 v_user uuid:=(SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_events jsonb:='[]'::jsonb;
BEGIN
 IF v_user IS NULL OR p_room_id IS NULL
  OR p_message_ids IS NULL
  OR coalesce(array_length(p_message_ids,1),0)>150
  OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_and_messages_required');
 END IF;

 SELECT * INTO v_room
 FROM public.corp_private_photo_rooms
 WHERE id=p_room_id AND (owner_id=v_user OR member_id=v_user);
 IF NOT FOUND THEN
  RETURN jsonb_build_object('ok',false,'reason','room_not_authorized');
 END IF;

 -- The supplied message IDs must be linked to this exact verified room.
 -- A trigger hit is unique per chat message, and only actual hits render.
 SELECT coalesce(jsonb_agg(
  jsonb_build_object(
   'message_id',h.message_id,
   'word',h.word,
   'price_cents',h.price_cents,
   'recorded_at',h.recorded_at
  ) ORDER BY m.created_at,m.id
 ),'[]'::jsonb)
 INTO v_events
 FROM corp_private.redline_trigger_hits h
 JOIN public.corp_private_photo_messages m
  ON m.id=h.message_id AND m.room_id=p_room_id
 WHERE h.room_id=p_room_id
  AND h.message_id=ANY(p_message_ids)
  AND (
   v_room.current_session_started_at IS NULL
   OR m.created_at>=v_room.current_session_started_at
  );

 RETURN jsonb_build_object('ok',true,'room_id',p_room_id,'events',v_events);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_trigger_chat_events(uuid,uuid[])
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_trigger_chat_events(uuid,uuid[])
 TO authenticated;
