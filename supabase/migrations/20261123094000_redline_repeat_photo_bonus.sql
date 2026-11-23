-- BLACKCELL REDLINE · one-time repeat-photo performance bonus.
-- 3 distinct positively-priced, receiver-rated 5-star reviews of one original
-- (resubmissions are linked to their original) + 3 independently completed,
-- positive-earnings timer sessions. Bonus = rounded average of all SIX amounts.
-- Timer-created auto-prices are excluded from the priced-review group so the
-- same timer earning is never treated as both a price and a timer.
-- Ledger only. Settled means the owner recorded a payment made elsewhere.

CREATE TABLE IF NOT EXISTS corp_private.redline_repeat_photo_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.corp_private_photo_rooms(id) ON DELETE CASCADE,
  origin_photo_id uuid NOT NULL REFERENCES public.corp_private_photo_entries(id) ON DELETE RESTRICT,
  priced_photo_ids uuid[] NOT NULL,
  timer_session_ids uuid[] NOT NULL,
  priced_sum_cents bigint NOT NULL CHECK (priced_sum_cents >= 3),
  timed_sum_cents bigint NOT NULL CHECK (timed_sum_cents >= 3),
  bonus_cents bigint NOT NULL CHECK (bonus_cents >= 1),
  earned_at timestamptz NOT NULL,
  settled_at timestamptz,
  CONSTRAINT redline_repeat_photo_bonus_once UNIQUE(room_id,origin_photo_id),
  CONSTRAINT redline_repeat_photo_bonus_six_sources CHECK (
    cardinality(priced_photo_ids)=3 AND cardinality(timer_session_ids)=3
  )
);
CREATE INDEX IF NOT EXISTS redline_repeat_bonus_by_room
 ON corp_private.redline_repeat_photo_bonuses(room_id,earned_at DESC);
ALTER TABLE corp_private.redline_repeat_photo_bonuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE corp_private.redline_repeat_photo_bonuses FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_repeat_bonus_status(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_room public.corp_private_photo_rooms%ROWTYPE;
  v_rows jsonb;
  v_progress jsonb;
  v_assigned bigint;
  v_owed bigint;
  v_paid bigint;
BEGIN
  IF v_user IS NULL OR p_room_id IS NULL OR
     NOT (SELECT corp_private.photo_ledger_verified()) THEN
    RETURN jsonb_build_object('ok',false,'reason','verified_room_required');
  END IF;
  SELECT * INTO v_room FROM public.corp_private_photo_rooms
   WHERE id=p_room_id AND (owner_id=v_user OR member_id=v_user);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason','room_not_authorized');
  END IF;

  -- The room participant's status read accrues an eligible award atomically.
  -- Unique(room,original) prevents duplicate awards across devices/polls.
  IF v_room.active THEN
    WITH rated_rows AS (
      SELECT COALESCE(e.resubmission_origin_id,e.id) AS root_id,
             e.id,e.amount_cents,
             COALESCE(e.priced_at,e.created_at) AS priced_at,
             row_number() over (
               PARTITION BY COALESCE(e.resubmission_origin_id,e.id)
               ORDER BY COALESCE(e.priced_at,e.created_at),e.id
             ) AS pos
      FROM public.corp_private_photo_entries e
      JOIN public.corp_redline_photo_ratings r ON r.photo_id=e.id AND r.stars=5
      WHERE e.room_id=p_room_id AND e.uploaded_by=v_room.member_id
        AND e.decision_status='accepted' AND e.amount_cents>0
        AND e.auto_timer_session_id IS NULL
        AND (v_room.current_session_started_at IS NULL
             OR e.created_at>=v_room.current_session_started_at)
    ), priced AS (
      SELECT root_id,
             array_agg(id ORDER BY pos) AS photo_ids,
             sum(amount_cents)::bigint AS total_cents,
             max(priced_at) AS third_at
      FROM rated_rows WHERE pos<=3 GROUP BY root_id HAVING count(*)=3
    ), timer_rows AS (
      SELECT COALESCE(e.resubmission_origin_id,e.id) AS root_id,
             t.id,t.earned_cents,t.stopped_at,
             row_number() over (
               PARTITION BY COALESCE(e.resubmission_origin_id,e.id)
               ORDER BY t.stopped_at,t.id
             ) AS pos
      FROM public.corp_private_photo_timers t
      JOIN public.corp_private_photo_entries e
        ON e.id=t.photo_id AND e.room_id=t.room_id
      WHERE t.room_id=p_room_id AND t.stopped_at IS NOT NULL
        AND t.earned_cents>0 AND e.uploaded_by=v_room.member_id
        AND (v_room.current_session_started_at IS NULL
             OR t.started_at>=v_room.current_session_started_at)
        AND (v_room.current_session_started_at IS NULL
             OR e.created_at>=v_room.current_session_started_at)
    ), timed AS (
      SELECT root_id,
             array_agg(id ORDER BY pos) AS session_ids,
             sum(earned_cents)::bigint AS total_cents,
             max(stopped_at) AS third_at
      FROM timer_rows WHERE pos<=3 GROUP BY root_id HAVING count(*)=3
    )
    INSERT INTO corp_private.redline_repeat_photo_bonuses
      (room_id,origin_photo_id,priced_photo_ids,timer_session_ids,
       priced_sum_cents,timed_sum_cents,bonus_cents,earned_at)
    SELECT p_room_id,p.root_id,p.photo_ids,t.session_ids,
           p.total_cents,t.total_cents,
           round((p.total_cents::numeric+t.total_cents::numeric)/6)::bigint,
           greatest(p.third_at,t.third_at)
    FROM priced p JOIN timed t USING(root_id)
    JOIN public.corp_private_photo_entries original ON original.id=p.root_id
      AND original.room_id=p_room_id AND original.resubmission_origin_id IS NULL
      AND original.uploaded_by=v_room.member_id
    ON CONFLICT (room_id,origin_photo_id) DO NOTHING;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',b.id,'photo_id',b.origin_photo_id,
     'priced_sum_cents',b.priced_sum_cents,
     'timer_sum_cents',b.timed_sum_cents,
     'priced_count',3,'timer_count',3,'bonus_cents',b.bonus_cents,
     'earned_at',b.earned_at,'settled_at',b.settled_at
   ) ORDER BY b.earned_at DESC),'[]'::jsonb),
   coalesce(sum(b.bonus_cents),0)::bigint,
   coalesce(sum(b.bonus_cents) FILTER(WHERE b.settled_at IS NULL),0)::bigint,
   coalesce(sum(b.bonus_cents) FILTER(WHERE b.settled_at IS NOT NULL),0)::bigint
  INTO v_rows,v_assigned,v_owed,v_paid
  FROM corp_private.redline_repeat_photo_bonuses b
  WHERE b.room_id=p_room_id AND
    (v_room.current_session_started_at IS NULL OR
     b.earned_at>=v_room.current_session_started_at);

  WITH priced AS (
    SELECT COALESCE(e.resubmission_origin_id,e.id) root_id,count(*)::integer count_ratings
    FROM public.corp_private_photo_entries e
    JOIN public.corp_redline_photo_ratings r ON r.photo_id=e.id AND r.stars=5
    WHERE e.room_id=p_room_id AND e.uploaded_by=v_room.member_id
      AND e.decision_status='accepted' AND e.amount_cents>0
      AND e.auto_timer_session_id IS NULL
      AND (v_room.current_session_started_at IS NULL
           OR e.created_at>=v_room.current_session_started_at)
    GROUP BY COALESCE(e.resubmission_origin_id,e.id)
  ), timed AS (
    SELECT COALESCE(e.resubmission_origin_id,e.id) root_id,count(*)::integer count_timers
    FROM public.corp_private_photo_timers t
    JOIN public.corp_private_photo_entries e ON e.id=t.photo_id AND e.room_id=t.room_id
    WHERE t.room_id=p_room_id AND t.stopped_at IS NOT NULL AND t.earned_cents>0
      AND e.uploaded_by=v_room.member_id
      AND (v_room.current_session_started_at IS NULL
           OR t.started_at>=v_room.current_session_started_at)
      AND (v_room.current_session_started_at IS NULL
           OR e.created_at>=v_room.current_session_started_at)
    GROUP BY COALESCE(e.resubmission_origin_id,e.id)
  ), roots AS (
    SELECT root_id FROM priced UNION SELECT root_id FROM timed
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
       'photo_id',roots.root_id,
       'five_star_prices',least(3,coalesce(priced.count_ratings,0)),
       'completed_timers',least(3,coalesce(timed.count_timers,0))
     ) ORDER BY (coalesce(priced.count_ratings,0)+coalesce(timed.count_timers,0)) DESC
     ),'[]'::jsonb)
  INTO v_progress
  FROM roots LEFT JOIN priced USING(root_id) LEFT JOIN timed USING(root_id);

  RETURN jsonb_build_object('ok',true,'room_id',p_room_id,
    'bonuses',v_rows,'progress',v_progress,
    'bonus_assigned_cents',v_assigned,
    'bonus_owed_cents',v_owed,'bonus_paid_cents',v_paid,
    'basis','three_distinct_five_star_prices_plus_three_completed_timers',
    'amount_count',6);
END
$fn$;
REVOKE ALL ON FUNCTION public.corp_redline_repeat_bonus_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_repeat_bonus_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.corp_redline_repeat_bonus_mark_paid(p_bonus_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_bonus corp_private.redline_repeat_photo_bonuses%ROWTYPE;
  v_owner uuid;
BEGIN
  IF v_user IS NULL OR p_bonus_id IS NULL OR
     NOT (SELECT corp_private.photo_ledger_verified()) THEN
    RETURN jsonb_build_object('ok',false,'reason','verified_owner_required');
  END IF;
  SELECT * INTO v_bonus FROM corp_private.redline_repeat_photo_bonuses
   WHERE id=p_bonus_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','bonus_not_found'); END IF;
  SELECT owner_id INTO v_owner FROM public.corp_private_photo_rooms WHERE id=v_bonus.room_id;
  IF v_owner IS DISTINCT FROM v_user OR NOT (SELECT corp_private.is_owner(v_user)) THEN
    RETURN jsonb_build_object('ok',false,'reason','owner_required');
  END IF;
  IF v_bonus.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already_recorded',true,
      'bonus_cents',v_bonus.bonus_cents,'settled_at',v_bonus.settled_at);
  END IF;
  UPDATE corp_private.redline_repeat_photo_bonuses
   SET settled_at=clock_timestamp() WHERE id=p_bonus_id RETURNING * INTO v_bonus;
  RETURN jsonb_build_object('ok',true,'bonus_cents',v_bonus.bonus_cents,
    'settled_at',v_bonus.settled_at);
END
$fn$;
REVOKE ALL ON FUNCTION public.corp_redline_repeat_bonus_mark_paid(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corp_redline_repeat_bonus_mark_paid(uuid) TO authenticated;
