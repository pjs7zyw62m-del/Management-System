-- BLACKCELL REDLINE: receiver-only 1–5 star photo ratings.
-- Independent of immutable bid, payment, timed earnings and review decisions.
CREATE TABLE IF NOT EXISTS public.corp_redline_photo_ratings (
 photo_id uuid PRIMARY KEY REFERENCES public.corp_private_photo_entries(id) ON DELETE RESTRICT,
 stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
 rated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.corp_redline_photo_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.corp_redline_photo_ratings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.corp_redline_photo_ratings TO authenticated;

CREATE POLICY redline_photo_ratings_room_read
 ON public.corp_redline_photo_ratings FOR SELECT TO authenticated
 USING (
  corp_private.photo_ledger_verified()
  AND EXISTS (
   SELECT 1 FROM public.corp_private_photo_entries e
   JOIN public.corp_private_photo_rooms r ON r.id=e.room_id
   WHERE e.id=photo_id
     AND ((SELECT auth.uid())=r.owner_id OR (SELECT auth.uid())=r.member_id)
  )
 );

CREATE POLICY redline_photo_ratings_owner_add
 ON public.corp_redline_photo_ratings FOR INSERT TO authenticated
 WITH CHECK (
  corp_private.photo_ledger_verified()
  AND corp_private.is_owner((SELECT auth.uid()))
  AND EXISTS (
   SELECT 1 FROM public.corp_private_photo_entries e
   JOIN public.corp_private_photo_rooms r ON r.id=e.room_id
   WHERE e.id=photo_id AND r.owner_id=(SELECT auth.uid())
  )
 );

CREATE POLICY redline_photo_ratings_owner_change
 ON public.corp_redline_photo_ratings FOR UPDATE TO authenticated
 USING (
  corp_private.photo_ledger_verified()
  AND corp_private.is_owner((SELECT auth.uid()))
  AND EXISTS (
   SELECT 1 FROM public.corp_private_photo_entries e
   JOIN public.corp_private_photo_rooms r ON r.id=e.room_id
   WHERE e.id=photo_id AND r.owner_id=(SELECT auth.uid())
  )
 )
 WITH CHECK (
  corp_private.photo_ledger_verified()
  AND corp_private.is_owner((SELECT auth.uid()))
  AND EXISTS (
   SELECT 1 FROM public.corp_private_photo_entries e
   JOIN public.corp_private_photo_rooms r ON r.id=e.room_id
   WHERE e.id=photo_id AND r.owner_id=(SELECT auth.uid())
  )
 );

-- Only the server can choose when a rating was placed; timestamps cannot
-- be backdated by a client to make old photos look newly rated.
CREATE OR REPLACE FUNCTION corp_private.redline_photo_rating_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
BEGIN
 NEW.rated_at=clock_timestamp();
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION corp_private.redline_photo_rating_timestamp()
 FROM PUBLIC, anon, authenticated;
CREATE TRIGGER redline_photo_rating_clock
 BEFORE INSERT OR UPDATE ON public.corp_redline_photo_ratings
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_photo_rating_timestamp();
