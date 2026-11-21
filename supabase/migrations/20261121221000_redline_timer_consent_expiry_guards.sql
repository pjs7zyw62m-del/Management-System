-- Prevent reopening an old approval or reviving charges after a later request.
CREATE OR REPLACE FUNCTION corp_private.redline_cancel_old_timer_approvals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 UPDATE corp_private.redline_timer_requests
 SET status='cancelled',responded_at=clock_timestamp()
 WHERE room_id=NEW.room_id AND status='accepted';
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION corp_private.redline_cancel_old_timer_approvals()
 FROM public,anon,authenticated;
DROP TRIGGER IF EXISTS redline_cancel_prior_timer_approval
 ON corp_private.redline_timer_requests;
CREATE TRIGGER redline_cancel_prior_timer_approval
 BEFORE INSERT ON corp_private.redline_timer_requests
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_cancel_old_timer_approvals();
CREATE OR REPLACE FUNCTION corp_private.redline_resolve_timer_request(p_room_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 UPDATE corp_private.redline_timer_requests q
 SET status=CASE WHEN coalesce(f.sender_auto_accept,false) AND
    coalesce(f.timer_requests_enabled,true) AND r.active
    AND q.session_started_at IS NOT DISTINCT FROM r.current_session_started_at
     THEN 'accepted' ELSE 'expired' END,
     consent_mode=CASE WHEN coalesce(f.sender_auto_accept,false) AND
    coalesce(f.timer_requests_enabled,true) AND r.active
    AND q.session_started_at IS NOT DISTINCT FROM r.current_session_started_at
     THEN 'preauthorized_timeout' ELSE NULL END,
     responded_at=q.expires_at
 FROM public.corp_private_photo_rooms r
 LEFT JOIN corp_private.redline_room_features f ON f.room_id=r.id
 WHERE q.room_id=p_room_id AND q.room_id=r.id AND q.status='pending'
  AND q.expires_at<=clock_timestamp();
 UPDATE corp_private.redline_timer_requests q SET status='cancelled',
  responded_at=clock_timestamp()
 FROM public.corp_private_photo_rooms r
 LEFT JOIN corp_private.redline_room_features f ON f.room_id=r.id
 WHERE q.room_id=p_room_id AND q.room_id=r.id AND q.status IN ('pending','accepted')
 AND (NOT r.active OR NOT coalesce(f.timer_requests_enabled,true) OR
      q.session_started_at IS DISTINCT FROM r.current_session_started_at);
 -- Even explicit approval applies only to a fresh request, never indefinitely.
 UPDATE corp_private.redline_timer_requests SET status='cancelled',
  responded_at=clock_timestamp()
 WHERE room_id=p_room_id AND status='accepted'
   AND (responded_at IS NULL OR responded_at<clock_timestamp()-interval '2 minutes');
END;$;

REVOKE ALL ON FUNCTION corp_private.redline_resolve_timer_request(uuid)
 FROM public,anon,authenticated;
