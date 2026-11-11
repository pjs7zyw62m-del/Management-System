# BLACKCELL Media Storage — Operational check

## Confirmed on 2026-11-11
- Supabase project: `eeddazzwqokqlzvzjlxz`, private bucket: `corp-social-media`.
- 33 objects, approximately 71.1 MiB stored.
- 33 matching asset records. No missing bucket objects or unregistered objects in the live database checks.
- Current per-file bucket limit: 47,185,920 bytes (45 MiB).
- Storage RLS: authenticated, verified network members can upload to their own UID folder; authorized network members can read contributed assets. Ownership/admin restrictions remain in place for deletion.
- **Not** 1 TB of provisioned capacity. Account billing tier and global storage quota were not available through connector; do not imply they were increased.
- Service health advisor returned no current findings.

## Added website tools
- Military Library → Media Storage panel with accessible file count, usage based on file metadata, and current 45 MiB per-file upload limit.
- **CHECK STORAGE** checks authenticated media-table access and generates a short-lived signed URL for an authorized existing file. It does not download media automatically.
- **TEST UPLOAD & RETRIEVAL** asks for confirmation, creates a 2×2 PNG temporary cover asset, uploads it, downloads it from a private signed link, verifies byte count, and removes file and temporary database record. The test must run in the member's own authorized browser session; it was not executed during development.
- iOS Safari file picker uses `showPicker()` with `click()` fallback.

## Capacity planning
For a target 1 TB archive, review the billable storage plan. Supabase Free is only 1 GB; Supabase Pro includes 100 GB and charges overage; Cloudflare R2 is an optional separate provider which would require provisioning and secure server-side integration. **No external paid resources or provider accounts were created in this change**. Use Supabase Dashboard billing to confirm the organization's subscription, budget alerts and maximum permitted usage before a large upload.
