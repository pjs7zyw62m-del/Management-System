-- Null action values are invalid just like unrecognized action names.
-- Replace the function body in-place without changing its API or permissions.
CREATE OR REPLACE FUNCTION public.corp_redline_history_photo_signal(
 p_photo_id uuid,p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 v_user uuid := (SELECT auth.uid());
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_photo public.corp_private_photo_entries%ROWTYPE;
 v_message_id uuid;
 v_body text;
 v_recent uuid;
 v_now timestamptz := clock_timestamp();
BEGIN
 IF v_user IS NULL OR p_photo_id IS NULL
  OR p_action IS NULL OR p_action NOT IN ('looking','like')
  OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_owner_and_action_required');
 END IF;
 SELECT * INTO v_photo FROM public.corp_private_photo_entries WHERE id=p_photo_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','photo_not_found'); END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms
 WHERE id=v_photo.room_id AND owner_id=v_user AND active;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('ok',false,'reason','active_owner_room_required');
 END IF;
 IF v_photo.uploaded_by IS DISTINCT FROM v_room.member_id
    OR v_photo.photo_removal_status IS NOT NULL
    OR (v_room.current_session_started_at IS NOT NULL
        AND v_photo.created_at<v_room.current_session_started_at) THEN
  RETURN jsonb_build_object('ok',false,'reason','current_sender_photo_required');
 END IF;
 v_body:='REDLINE_PHOTO_SIGNAL:v1:'||p_action||':'||p_photo_id::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  v_room.id::text||':'||p_photo_id::text||':'||p_action,0));
 SELECT id INTO v_recent FROM public.corp_private_photo_messages
 WHERE room_id=v_room.id AND sender_id=v_user AND body=v_body
   AND created_at>v_now-interval '12 seconds'
 ORDER BY created_at DESC LIMIT 1;
 IF v_recent IS NOT NULL THEN
  RETURN jsonb_build_object('ok',true,'message_id',v_recent,
   'photo_id',p_photo_id,'action',p_action,'already_sent',true);
 END IF;
 INSERT INTO public.corp_private_photo_messages(room_id,sender_id,body)
 VALUES(v_room.id,v_user,v_body) RETURNING id INTO v_message_id;
 RETURN jsonb_build_object('ok',true,'message_id',v_message_id,
  'photo_id',p_photo_id,'action',p_action,'already_sent',false);
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_history_photo_signal(uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_history_photo_signal(uuid,text) TO authenticated;
