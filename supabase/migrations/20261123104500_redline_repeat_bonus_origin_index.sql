-- Cover independent deletion/lookup by photo reference from the private bonus ledger.
CREATE INDEX IF NOT EXISTS redline_repeat_bonus_by_original_photo
 ON corp_private.redline_repeat_photo_bonuses(origin_photo_id);