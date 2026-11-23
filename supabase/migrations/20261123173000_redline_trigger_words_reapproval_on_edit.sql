-- Every sender change to a trigger word or its price automatically pauses
-- receiver charging. The receiver must explicitly review the new list and
-- re-enable the feature; changing a word cannot silently amend prior consent.
CREATE OR REPLACE FUNCTION corp_private.redline_trigger_require_reapproval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_room uuid;
BEGIN
 v_room:=CASE WHEN TG_OP='DELETE' THEN OLD.room_id ELSE NEW.room_id END;
 UPDATE corp_private.redline_room_features
 SET trigger_words_enabled=false,updated_at=clock_timestamp()
 WHERE room_id=v_room AND trigger_words_enabled=true;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION corp_private.redline_trigger_require_reapproval()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS redline_trigger_changes_need_owner_approval
 ON corp_private.redline_trigger_words;
CREATE TRIGGER redline_trigger_changes_need_owner_approval
 AFTER INSERT OR UPDATE OR DELETE ON corp_private.redline_trigger_words
 FOR EACH ROW EXECUTE FUNCTION corp_private.redline_trigger_require_reapproval();
