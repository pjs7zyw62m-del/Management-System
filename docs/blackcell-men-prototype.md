# BLACKCELL MEN — separate OS website prototype

BLACKCELL MEN is an **original** adult-media community design for BLACKCELL OS, inspired by general discovery, catalog and creator patterns. It is **not** a copy of SmokinMen.com and does not use its code, branding or media.

## Scope completed
- Responsive private-concept landing page at blackcell-men-prototype.html.
- Non-explicit sample gallery with category navigation, search, and trending/saved views.
- Media detail dialogs with clear no-real-streaming notices.
- Local-only image/video picker; no upload is performed.
- Session-based 18+ confirmation for prototype presentation only, not legal age verification.
- Content safety explanation and demo report action.
- App metadata in blackcell-os.js under the blackcellmen ID. The existing server-authorized catalog still decides installation and visibility.

## Preview and release
This branch deliberately does not publish or merge anything to production and does not modify the database or permissions. Review the standalone page in a safe preview deployment or locally with the repository assets.

To make it appear in the production BLACKCELL OS App Store, separately register blackcellmen in the authorized corp_app_store backend and enable/install it for approved accounts. Do not bypass authorizedApp or installedApp checks. As-is, the new entry stays dormant if the server does not return an authorized catalog row.

## Not implemented / required before opening to real users
- Production age and identity checks appropriate to each jurisdiction, content-consent and recordkeeping processes.
- Rights verification, reporting, moderation, copyright takedown and appeals.
- Authenticated profiles, creator pages, real media catalog, streaming/transcoding and signed upload APIs.
- Database, object-storage and CDN agreements expressly approving the content and use case.
- Payment/subscription integration and payout compliance if later desired.
- Actual integration with the OS's authorized photo/video library (no cross-app data flows yet).

Current BLACKCELL OS apps, files and user data are unchanged by this prototype branch.
