-- BLACKCELL media intake approval: fix missing column UPDATE grants.
-- The table deliberately has NO blanket UPDATE privilege for authenticated users.
-- Existing RLS and the owner-verifying corp_private.corp_media_intake_guard
-- continue to enforce Level 7 permission for approval/adult/rights changes.
--
-- New approval UI updates these additional media columns. Prior column
-- grants already cover military_country_code, military_branch,
-- military_category, military_tags and caption.
grant update (
  military_era,
  military_unit,
  review_status,
  adult_restricted,
  rights_confirmed,
  ages_confirmed
) on table public.corp_social_assets to authenticated;

-- Do not grant UPDATE on id, owner_id, post_id, purpose, kind, storage_path,
-- filename, bytes, source_provider, reviewed_at or reviewed_by.
-- Do not grant broad table-level UPDATE to authenticated or anon.
