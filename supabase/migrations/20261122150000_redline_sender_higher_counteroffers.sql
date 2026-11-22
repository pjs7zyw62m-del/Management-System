-- REDLINE sender earnings: the sender requests HIGHER payment for their photo.
-- Preserve room membership, verified access, owner final price and the three-offer limit.
-- Changes RPC validation only; never rewrites existing negotiations or payment records.
CREATE OR REPLACE FUNCTION public.corp_redline_price_negotiation_act(
 p_photo_id uuid,p_action text,p_amount_cents bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid());v_room public.corp_private_photo_rooms%ROWTYPE;
 v_n corp_private.redline_price_negotiations%ROWTYPE;v_e public.corp_private_photo_entries%ROWTYPE;
 v_enabled boolean:=true;v_status text;
BEGIN
 IF v_user IS NULL OR NOT (SELECT corp_private.photo_ledger_verified()) THEN
  RETURN jsonb_build_object('ok',false,'reason','verified_room_required');END IF;
 SELECT r.* INTO v_room FROM public.corp_private_photo_rooms r
  JOIN corp_private.redline_price_negotiations n ON n.room_id=r.id
  WHERE n.photo_id=p_photo_id FOR UPDATE OF r;
 IF NOT FOUND OR NOT v_room.active OR
   (v_room.owner_id<>v_user AND v_room.member_id<>v_user) THEN
  RETURN jsonb_build_object('ok',false,'reason','active_room_member_required');END IF;
 SELECT * INTO v_n FROM corp_private.redline_price_negotiations
   WHERE photo_id=p_photo_id AND room_id=v_room.id FOR UPDATE;
 SELECT * INTO v_e FROM public.corp_private_photo_entries
   WHERE id=p_photo_id AND room_id=v_room.id FOR UPDATE;
 SELECT negotiation_enabled INTO v_enabled FROM corp_private.redline_room_features WHERE room_id=v_room.id;
 IF NOT FOUND THEN v_enabled:=true;END IF;
 IF NOT coalesce(v_enabled,true) OR v_n.status NOT IN ('awaiting_sender','awaiting_owner')
  OR v_n.session_started_at IS DISTINCT FROM v_room.current_session_started_at
  OR v_e.settled_at IS NOT NULL OR v_e.decision_status<>'accepted' THEN
  RETURN jsonb_build_object('ok',false,'reason','negotiation_not_active');END IF;
 IF p_action='counter' AND v_user=v_room.member_id AND v_n.status='awaiting_sender' THEN
  IF v_n.offer_count>=3 OR p_amount_cents IS NULL OR
    p_amount_cents<=v_n.original_cents OR p_amount_cents>9007199254740991 THEN
   RETURN jsonb_build_object('ok',false,'reason','counter_must_be_higher_than_original');END IF;
  -- Do not negotiate a balance after any room partial or full installment.
  IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
   WHERE p.room_id=v_room.id AND p.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at) THEN
   RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');END IF;
  UPDATE corp_private.redline_price_negotiations SET
   offer_cents=p_amount_cents,offer_count=offer_count+1,
   status='awaiting_owner',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='awaiting_owner';
 ELSIF p_action='accept_original' AND v_user=v_room.member_id AND v_n.status='awaiting_sender' THEN
  UPDATE corp_private.redline_price_negotiations SET
   status='agreed',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='accept_counter' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
   WHERE p.room_id=v_room.id AND p.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at) THEN
   RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');END IF;
  UPDATE public.corp_private_photo_entries SET amount_cents=v_n.offer_cents,
    priced_at=clock_timestamp()
   WHERE id=p_photo_id AND room_id=v_room.id AND settled_at IS NULL;
  UPDATE corp_private.redline_price_negotiations SET
   status='agreed',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='reject_counter' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  v_status:=CASE WHEN v_n.offer_count>=3 THEN 'original_final' ELSE 'awaiting_sender' END;
  UPDATE corp_private.redline_price_negotiations SET
   status=v_status,updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
 ELSIF p_action='finalize_original' AND v_user=v_room.owner_id THEN
  UPDATE corp_private.redline_price_negotiations SET
   status='original_final',updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='original_final';
 ELSE RETURN jsonb_build_object('ok',false,'reason','action_not_permitted');END IF;
 RETURN jsonb_build_object('ok',true,'photo_id',p_photo_id,'status',v_status,
  'original_cents',v_n.original_cents,'offer_count',v_n.offer_count+
    CASE WHEN p_action='counter' THEN 1 ELSE 0 END);
END;$$;
REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_act(uuid,text,bigint)
 FROM public,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_price_negotiation_act(uuid,text,bigint)
 TO authenticated;
