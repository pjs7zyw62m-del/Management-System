-- BLACKCELL REDLINE: forward-only, verified bill credits for photo actions.
-- Manual REJECT PHOTO: -$0.35 once per photo.
-- Permanent media deletion (only after server has confirmed removal): -$1.00.
-- Deletion of a pending photo internally changes it to rejected: it MUST NOT
-- also create a manual rejection credit; a prior independent manual rejection
-- remains an independent credit if the same photo is subsequently deleted.
-- Historic rejections/deletions are NEVER backfilled or retroactively credited.

CREATE TABLE IF NOT EXISTS corp_private.redline_photo_bill_credits (
 photo_id uuid NOT NULL REFERENCES public.corp_private_photo_entries(id) ON DELETE RESTRICT,
 room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('manual_rejection','permanent_deletion')),
 amount_cents integer NOT NULL,
 session_started_at timestamptz,
 credited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(photo_id,kind),
 CONSTRAINT redline_photo_bill_credit_amount CHECK(
  (kind='manual_rejection' AND amount_cents=-35) OR
  (kind='permanent_deletion' AND amount_cents=-100)
 )
);
CREATE INDEX IF NOT EXISTS redline_photo_bill_credits_room_session
 ON corp_private.redline_photo_bill_credits(room_id,credited_at DESC);
ALTER TABLE corp_private.redline_photo_bill_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.redline_photo_bill_credits FROM PUBLIC,anon,authenticated;

-- Fires only on a NEW manual decision, not a prior record or a repeated call.
CREATE OR REPLACE FUNCTION corp_private.redline_credit_manual_rejection()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_session timestamptz;
BEGIN
 IF OLD.decision_status IS DISTINCT FROM 'pending' OR
    NEW.decision_status IS DISTINCT FROM 'rejected' OR
    OLD.room_id IS DISTINCT FROM NEW.room_id OR
    (SELECT auth.uid()) IS NULL OR
    NOT (SELECT corp_private.photo_ledger_verified()) THEN RETURN NEW; END IF;
 -- A permanent-delete request has already tombstoned the photo by the time
 -- the removal-finish RPC converts a pending entry to rejected.
 IF EXISTS(SELECT 1 FROM corp_private.redline_photo_removals rm
   WHERE rm.photo_id=NEW.id AND rm.room_id=NEW.room_id) THEN RETURN NEW; END IF;
 SELECT r.current_session_started_at INTO v_session
 FROM public.corp_private_photo_rooms r
 WHERE r.id=NEW.room_id AND r.owner_id=(SELECT auth.uid()) AND r.active;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO corp_private.redline_photo_bill_credits
  (photo_id,room_id,kind,amount_cents,session_started_at)
 VALUES(NEW.id,NEW.room_id,'manual_rejection',-35,v_session)
 ON CONFLICT(photo_id,kind) DO NOTHING;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_credit_manual_rejection()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_credit_manual_rejection ON public.corp_private_photo_entries;
CREATE TRIGGER redline_credit_manual_rejection
 AFTER UPDATE OF decision_status ON public.corp_private_photo_entries
 FOR EACH ROW WHEN (OLD.decision_status='pending' AND NEW.decision_status='rejected')
 EXECUTE FUNCTION corp_private.redline_credit_manual_rejection();

-- This AFTER UPDATE hook runs only when Bunny deletion was acknowledged
-- by the existing verified owner-only photo_remove_finish RPC.
CREATE OR REPLACE FUNCTION corp_private.redline_credit_permanent_deletion()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_session timestamptz;
BEGIN
 IF OLD.removed_at IS NOT NULL OR NEW.removed_at IS NULL OR
    (SELECT auth.uid()) IS NULL OR
    NOT (SELECT corp_private.photo_ledger_verified()) THEN RETURN NEW; END IF;
 SELECT r.current_session_started_at INTO v_session
 FROM public.corp_private_photo_rooms r
 WHERE r.id=NEW.room_id AND r.owner_id=(SELECT auth.uid());
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO corp_private.redline_photo_bill_credits
  (photo_id,room_id,kind,amount_cents,session_started_at)
 VALUES(NEW.photo_id,NEW.room_id,'permanent_deletion',-100,v_session)
 ON CONFLICT(photo_id,kind) DO NOTHING;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_credit_permanent_deletion()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_credit_permanent_deletion ON corp_private.redline_photo_removals;
CREATE TRIGGER redline_credit_permanent_deletion
 AFTER UPDATE OF removed_at ON corp_private.redline_photo_removals
 FOR EACH ROW WHEN (OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL)
 EXECUTE FUNCTION corp_private.redline_credit_permanent_deletion();

-- Keep prior photo/timer/bonus/trigger accounting as-is; apply adjustment
-- credits only AFTER those totals, so no double-use of payment credits.
-- Unused credit remains in the session to reduce future charges.
ALTER FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 RENAME TO corp_redline_room_payment_status_before_photo_credits;
REVOKE ALL ON FUNCTION
 public.corp_redline_room_payment_status_before_photo_credits(uuid,boolean)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_room_payment_status(
 p_room_id uuid,p_archive boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 v_base jsonb;
 v_room public.corp_private_photo_rooms%ROWTYPE;
 v_credit bigint:=0;
 v_unadjusted numeric:=0;
 v_history jsonb:='[]'::jsonb;
BEGIN
 v_base:=public.corp_redline_room_payment_status_before_photo_credits(p_room_id,p_archive);
 IF v_base->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_base; END IF;
 SELECT * INTO v_room FROM public.corp_private_photo_rooms WHERE id=p_room_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','room_not_found'); END IF;

 SELECT coalesce(sum(-c.amount_cents),0) INTO v_credit
 FROM corp_private.redline_photo_bill_credits c
 WHERE c.room_id=p_room_id AND (
  (NOT p_archive AND c.session_started_at IS NOT DISTINCT FROM
   v_room.current_session_started_at)
  OR
  (p_archive AND c.session_started_at IS DISTINCT FROM
   v_room.current_session_started_at)
 );
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.credited_at DESC),'[]'::jsonb)
 INTO v_history FROM (
  SELECT c.photo_id,c.kind,c.amount_cents,c.credited_at
  FROM corp_private.redline_photo_bill_credits c
  WHERE c.room_id=p_room_id AND (
   (NOT p_archive AND c.session_started_at IS NOT DISTINCT FROM
    v_room.current_session_started_at)
   OR
   (p_archive AND c.session_started_at IS DISTINCT FROM
    v_room.current_session_started_at)
  )
  ORDER BY c.credited_at DESC,c.photo_id DESC LIMIT 100
 ) x;
 v_unadjusted:=coalesce((v_base->>'remaining_cents')::numeric,0);
 RETURN v_base||jsonb_build_object(
  'remaining_cents',greatest(0,v_unadjusted-v_credit),
  'remaining_before_photo_credits_cents',v_unadjusted,
  'photo_action_bill_credit_cents',v_credit,
  'photo_action_bill_credit_applied_cents',least(v_credit,v_unadjusted),
  'photo_action_bill_credit_carry_cents',greatest(0,v_credit-v_unadjusted),
  'net_assigned_cents',greatest(0,coalesce((v_base->>'assigned_cents')::numeric,0)-v_credit),
  'photo_action_bill_credit_history',v_history
 );
END $fn$;
REVOKE ALL ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_room_payment_status(uuid,boolean)
 TO authenticated;
