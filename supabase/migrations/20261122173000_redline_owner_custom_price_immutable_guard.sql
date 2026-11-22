-- REDLINE negotiation review protection fix: owner may accept sender offer or set
-- a custom final price without changing the original review decision or timestamps.
-- Updates are enabled ONLY inside the owner-authorised, verified room RPC.
ALTER TABLE corp_private.redline_price_negotiations
 ADD COLUMN IF NOT EXISTS final_cents bigint
 CHECK(final_cents BETWEEN 0 AND 9007199254740991);
ALTER TABLE corp_private.redline_price_negotiations
 ADD COLUMN IF NOT EXISTS finalized_by text
 CHECK(finalized_by IN ('owner_accept_counter','owner_custom','owner_original','sender_original','third_rejection'));

CREATE OR REPLACE FUNCTION corp_private.corp_photo_entry_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.id is distinct from old.id or new.room_id is distinct from old.room_id
  or new.uploaded_by is distinct from old.uploaded_by
  or new.image_path is distinct from old.image_path
  or new.file_name is distinct from old.file_name
  or new.caption is distinct from old.caption
  or new.created_at is distinct from old.created_at
 then
  raise exception 'Posted photo details cannot be rewritten' using errcode='23514';
 end if;

 if old.decision_status='pending' then
   if new.decision_status='accepted' then
      if new.amount_cents is null then
        raise exception 'Acceptance requires an amount, including zero' using errcode='23514';
      end if;
      new.priced_at=now();
      new.decided_at=new.priced_at;
      new.settled_at=null;
   elsif new.decision_status='rejected' then
      if new.amount_cents is not null then
        raise exception 'A rejected photo cannot have an amount' using errcode='23514';
      end if;
      new.priced_at=null;
      new.decided_at=now();
      new.settled_at=null;
   elsif new.decision_status='pending' then
      if new.amount_cents is distinct from old.amount_cents
       or new.priced_at is distinct from old.priced_at
       or new.decided_at is distinct from old.decided_at
       or new.settled_at is distinct from old.settled_at then
        raise exception 'A photo must be accepted or rejected before assigning an amount'
          using errcode='23514';
      end if;
   else
      raise exception 'Invalid photo review decision' using errcode='23514';
   end if;
 else
   -- Original review decision and timestamps never change after approval.
   if new.decision_status is distinct from old.decision_status
    or new.priced_at is distinct from old.priced_at
    or new.decided_at is distinct from old.decided_at then
      raise exception 'Reviewed photos and their decisions cannot be changed'
        using errcode='23514';
   end if;
   -- The ONLY reviewed-photo price exception is a verified owner settlement
   -- of a pending REDLINE negotiation via its room-scoped RPC. Never allow
   -- timer prices, settlement changes, arbitrary edits, or archive updates.
   if new.amount_cents is distinct from old.amount_cents then
     if not (
       old.decision_status='accepted'
       and old.auto_timer_session_id is null
       and old.settled_at is null and new.settled_at is null
       and new.amount_cents is not null
       and new.amount_cents between 0 and 9007199254740991
       and current_setting('corp_private.redline_negotiation_price_photo',true)=old.id::text
       and (select auth.uid()) is not null
       and exists(
         select 1 from public.corp_private_photo_rooms r
         join corp_private.redline_price_negotiations n
           on n.room_id=r.id and n.photo_id=old.id
         where r.id=old.room_id and r.active
           and r.owner_id=(select auth.uid())
           and n.status='awaiting_owner'
           and n.session_started_at is not distinct from r.current_session_started_at
       )
     ) then
       raise exception 'Reviewed photos and their decisions cannot be changed'
         using errcode='23514';
     end if;
   end if;
   if old.settled_at is not null and new.settled_at is distinct from old.settled_at then
      raise exception 'A paid entry cannot be reopened' using errcode='23514';
   end if;
   if old.settled_at is null and new.settled_at is not null then
      if old.decision_status<>'accepted' or old.amount_cents is null
       or old.amount_cents<=0 then
        raise exception 'Only accepted positive amounts can be marked as paid'
          using errcode='23514';
      end if;
      new.settled_at=now();
   end if;
 end if;
 return new;
end $function$
;

-- REDLINE sender earnings: allow HIGHER or LOWER counteroffers for a photo.
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
    (p_amount_cents<0 OR p_amount_cents=v_n.original_cents) OR p_amount_cents>9007199254740991 THEN
   RETURN jsonb_build_object('ok',false,'reason','counter_must_differ_from_original');END IF;
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
   status='agreed',final_cents=v_n.original_cents,finalized_by='sender_original',
   updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='accept_counter' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
   WHERE p.room_id=v_room.id AND p.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at) THEN
   RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');END IF;
  -- Explicit authorisation is scoped to this photo and only this RPC call.
  PERFORM pg_catalog.set_config('corp_private.redline_negotiation_price_photo',p_photo_id::text,true);
  UPDATE public.corp_private_photo_entries SET amount_cents=v_n.offer_cents
   WHERE id=p_photo_id AND room_id=v_room.id AND settled_at IS NULL;
  PERFORM pg_catalog.set_config('corp_private.redline_negotiation_price_photo','',true);
  UPDATE corp_private.redline_price_negotiations SET
   status='agreed',final_cents=v_n.offer_cents,finalized_by='owner_accept_counter',
   updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='set_owner_price' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  IF p_amount_cents IS NULL OR p_amount_cents<0 OR p_amount_cents>9007199254740991 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_owner_price');END IF;
  IF EXISTS(SELECT 1 FROM corp_private.redline_room_payments p
   WHERE p.room_id=v_room.id AND p.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at) THEN
   RETURN jsonb_build_object('ok',false,'reason','payment_already_recorded');END IF;
  -- Owner's custom amount is final only when explicitly submitted.
  PERFORM pg_catalog.set_config('corp_private.redline_negotiation_price_photo',p_photo_id::text,true);
  UPDATE public.corp_private_photo_entries SET amount_cents=p_amount_cents
   WHERE id=p_photo_id AND room_id=v_room.id AND settled_at IS NULL;
  PERFORM pg_catalog.set_config('corp_private.redline_negotiation_price_photo','',true);
  UPDATE corp_private.redline_price_negotiations SET
   status='agreed',final_cents=p_amount_cents,finalized_by='owner_custom',
   updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
  v_status:='agreed';
 ELSIF p_action='reject_counter' AND v_user=v_room.owner_id AND v_n.status='awaiting_owner' THEN
  v_status:=CASE WHEN v_n.offer_count>=3 THEN 'original_final' ELSE 'awaiting_sender' END;
  UPDATE corp_private.redline_price_negotiations SET
   status=v_status,final_cents=CASE WHEN v_status='original_final' THEN v_n.original_cents ELSE NULL END,
   finalized_by=CASE WHEN v_status='original_final' THEN 'third_rejection' ELSE NULL END,
   updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
 ELSIF p_action='finalize_original' AND v_user=v_room.owner_id THEN
  UPDATE corp_private.redline_price_negotiations SET
   status='original_final',final_cents=v_n.original_cents,finalized_by='owner_original',
   updated_at=clock_timestamp() WHERE photo_id=p_photo_id;
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

