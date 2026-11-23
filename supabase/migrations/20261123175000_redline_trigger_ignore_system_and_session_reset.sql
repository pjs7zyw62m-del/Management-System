-- Suppress synthetic REDLINE system notices: they are not receiver-authored
-- conversational words and must NEVER create keyword earnings.
DROP TRIGGER IF EXISTS redline_trigger_chat_words
 ON public.corp_private_photo_messages;
CREATE TRIGGER redline_trigger_chat_words
 AFTER INSERT ON public.corp_private_photo_messages
 FOR EACH ROW WHEN (left(NEW.body,8)<>'REDLINE_')
 EXECUTE FUNCTION corp_private.redline_trigger_on_chat();

-- REDLINE sessions may be reset while a room remains active. Reauthorization
-- is required when the scope changes; retain archived earnings but reset OFF.
CREATE OR REPLACE FUNCTION corp_private.redline_trigger_reset_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF NEW.current_session_started_at IS DISTINCT FROM OLD.current_session_started_at THEN
  UPDATE corp_private.redline_room_features SET trigger_words_enabled=false,
    updated_at=clock_timestamp()
  WHERE room_id=NEW.id AND trigger_words_enabled=true;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_trigger_reset_session()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_trigger_room_reset_requires_reapproval
 ON public.corp_private_photo_rooms;
CREATE TRIGGER redline_trigger_room_reset_requires_reapproval
 AFTER UPDATE OF current_session_started_at ON public.corp_private_photo_rooms
 FOR EACH ROW WHEN (NEW.current_session_started_at IS DISTINCT FROM OLD.current_session_started_at)
 EXECUTE FUNCTION corp_private.redline_trigger_reset_session();
