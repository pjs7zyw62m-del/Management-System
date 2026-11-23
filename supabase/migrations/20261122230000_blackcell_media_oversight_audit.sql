-- BLACKCELL Level 7 Media Oversight audit. Private by default.
CREATE TABLE IF NOT EXISTS corp_private.blackcell_media_oversight_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_user_id uuid,
  object_id uuid,
  file_path text,
  action text NOT NULL CHECK (action IN ('members','files','preview','read','delete_requested','deleted','delete_failed')),
  reason text,
  outcome text NOT NULL CHECK(outcome IN ('ok','failed')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE corp_private.blackcell_media_oversight_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON corp_private.blackcell_media_oversight_audit FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS blackcell_media_oversight_audit_actor_at
  ON corp_private.blackcell_media_oversight_audit(actor_user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS blackcell_media_oversight_audit_object_at
  ON corp_private.blackcell_media_oversight_audit(object_id,occurred_at DESC);
COMMENT ON TABLE corp_private.blackcell_media_oversight_audit
  IS 'Private Level 7 moderation access and deletion audit. Not a REDLINE message or photo authorization.';
