-- Optional, user-initiated counteroffer for a previously accepted photo
-- that has never had a negotiation record. Existing agreed/final outcomes
-- MUST remain final. This does not move money or change the approved price.
CREATE OR REPLACE FUNCTION public.corp_redline_price_negotiation_open(
 p_photo_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 v_uid uuid:=(SELECT auth.uid());
 v_entry public.corp_private_photo_entries%ROWTYPE;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_enabled boolean:=true;
 v_status text;
 v_count integer;
BEGIN
 IF v_uid IS NULL OR p_photo_id IS NULL OR
  NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_sender_required');
 END IF;
 SELECT * INTO v_entry FROM public.corp_private_photo_entries
  WHERE id=p_photo_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','photo_not_found');END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=v_entry.room_id;
 IF NOT FOUND OR NOT v_room.active OR v_room.member_id<>v_uid OR
  v_entry.uploaded_by<>v_uid OR v_entry.decision_status<>'accepted' OR
  v_entry.settled_at IS NOT NULL OR v_entry.auto_timer_session_id IS NOT NULL OR
  (v_room.current_session_started_at IS NOT NULL AND
   v_entry.created_at<v_room.current_session_started_at) OR
  EXISTS(SELECT 1 FROM corp_private.redline_photo_removals x
   WHERE x.photo_id=p_photo_id AND x.room_id=v_entry.room_id) THEN
  RETURN jsonb_build_object('ok',false,'reason','photo_not_eligible_for_counteroffer');
 END IF;
 SELECT negotiation_enabled INTO v_enabled FROM corp_private.redline_room_features
 WHERE room_id=v_entry.room_id;
 IF NOT coalesce(v_enabled,true) THEN
  RETURN jsonb_build_object('ok',false,'reason','receiver_disabled_counteroffers');
 END IF;
 IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
  WHERE p.room_id=v_room.id AND p.session_started_at
    IS NOT DISTINCT FROM v_room.current_session_started_at) THEN
  RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');
 END IF;
 SELECT status,offer_count INTO v_status,v_count
  FROM corp_private.redline_price_negotiations WHERE photo_id=p_photo_id;
 IF FOUND THEN
  IF v_status IN ('awaiting_sender','awaiting_sender_owner') AND v_count<3 THEN
   RETURN jsonb_build_object('ok',true,'status',v_status,'photo_id',p_photo_id,
    'offer_count',v_count);
  END IF;
  RETURN jsonb_build_object('ok',false,'reason','price_already_final_or_awaiting_receiver');
 END IF;
 INSERT INTO corp_private.redline_price_negotiations
  (photo_id,room_id,original_cents,session_started_at)
 VALUES(p_photo_id,v_room.id,v_entry.amount_cents,v_room.current_session_started_at)
 ON CONFLICT(photo_id) DO NOTHING;
 SELECT status,offer_count INTO v_status,v_count
 FROM corp_private.redline_price_negotiations WHERE photo_id=p_photo_id;
 IF v_status IN ('awaiting_sender','awaiting_sender_owner') AND v_count<3 THEN
  RETURN jsonb_build_object('ok',true,'status',v_status,'photo_id',p_photo_id,
   'offer_count',v_count);
 END IF;
 RETURN jsonb_build_object('ok',false,'reason','counteroffer_no_longer_available');
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_open(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_price_negotiation_open(uuid) TO authenticated;
