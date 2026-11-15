# BLACKCELL Architecture 2.0

Baseline: `88e5556a4f06dad1094cbf2dfbbb5c09e5413f35`.

213 root files moved to categorized source folders. Original contents preserved except README. The manifest restores public URL layout in `dist`. No database or hosting changes.

- core: OS, sign-in and updates
- apps: installable apps and private file tools
- administration: corporate operations
- armed-forces: uniform collections
- network: social network and messaging
- shared: common tools
- assets, docs, development: artwork, reference and previews
- Supabase, integrations, templates, vendor and includes remain in their original locations.

## Release gates

1. Build plain output; validate original routes and authenticated workflows.
2. Build optional CSS bundles; compare desktop, tablet and phone visuals. Check uploads, installation, transfer, login and audio recording.
3. Confirm hosting publish-directory configuration, version generation and rollback. Do not deploy the source tree directly.

Bundling merges adjacent simple links only; retains all source stylesheets and skips boundary-sensitive CSS. Actual speed changes need measurement.
