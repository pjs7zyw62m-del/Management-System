# BLACKCELL MAN WORLD — Onboarding Concept

BLACKCELL MAN WORLD is a standalone, opt-in, post-signup **SELECT YOUR WORLD** prototype. The rejected gallery-first BLACKCELL MEN design was not merged into production.

## Chosen worlds (10)
1. Leather
2. Rubber
3. Pup Play
4. BDSM
5. Findom
6. Underwear
7. Bondage
8. Gear
9. Sportswear
10. Uniform

## Visual design
- Reuses the **concept** of the existing BLACKCELL profile world's selection bubbles: evenly sized stationary circles in a responsive grid, with the icon inside and labels **below** the circle.
- Each circle has a muted outline by default; **selection is indicated exclusively by a crimson border, soft red glow, and a slightly brighter image. No checkmarks appear.**
- The page uses the pitch-black, minimal silver-and-crimson BLACKCELL OS aesthetic with restrained glass surfaces and near-black controls.
- **Photo-led hubs:** full-bleed photo inside every circle, dark bottom fade, category symbol and large text overlaid, with a short teaser below; never a rectangular card.
- Temporary preview photos load from third-party Unsplash/Pexels editorial/free-license sources; a missing image reveals the built-in category graphic. Before production replace all external images with reviewed BLACKCELL-hosted media, verify each applicable image license and consent, and eliminate third-party requests.
- The reference sites also show a private paid media archive called The Vault. Payment/creator-vault functionality is **not** implemented by this visual onboarding change.
- No floating, orbiting, bouncing, or layout-shifting motion.
- Desktop uses five columns, tablets three or four, phones two.
- The personalized second-screen choices use the same stationary circular language.

## BLACKCELL OS native-window redesign · 3.0
- The 10 approved **photographic bubbles are retained** as static, circular, darkened photo hubs, with their existing category copy and crimson ring/highlight when selected. No checkmarks.
- Replaced the web-landing-page approach with a **BLACKCELL OS desktop application** pattern based on the repository's actual OS UI:
  - A compact top system/menu bar, clock, and exit to BLACKCELL OS.
  - A self-contained app window with a slim titlebar, translucent Finder-like navigation sidebar (Discover, My Worlds) and concise native toolbar.
  - A clean black workspace showing the original photo-bubble directory directly, with no promotional hero card or layered marketing panels.
  - A dock-like bottom selection strip for counts and continue/not-now actions; a subtle status strip under it.
  - A corresponding "My Worlds" screen that uses the user's selected circular image hubs.
  - Mobile navigation tabs when the sidebar is hidden, internal scrolling with hidden scrollbars, and constrained responsive bubble sizing.
- The sidebar/toolbar and bottom dock follow existing `blackcell-os-desktop-refresh.css` desktop visual language (near-black charcoal, restrained glass, soft silver typography and limited crimson).
- The initial preview is an isolated standalone page. No production code, account data or real preferences have been changed.

## Prototype behavior
- Standalone `blackcell-man-world-prototype.html`, with searchable categories, multi-select, skip, continue, and edit choices.
- These names are interest-based discovery spaces, **not** assumptions about a user's identity or participation.
- No image catalog or explicit content is included, and no account or media is created.
- No personal selections are transmitted, saved, or linked to the existing profile. The production OS, App Store, auth, and database remain unchanged.

## Before a public release
- Confirm category naming, images, any opt-in adult-content areas, and how this will integrate with profile worlds.
- Build a voluntary, editable, private preference system with authorization safeguards.
- Add appropriate age/identity gating, user consent, rules, reporting, moderation and rights checks.
- Findom may involve money or financial power dynamics: discussions must be voluntary and clearly distinguished from payment handling; do not add payment features without specialized compliance review.

Preview branch: `man-world-preview`. It serves the same static HTML preview URL after updates, subject to preview cache timing.
