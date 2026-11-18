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

## Cinematic editorial experience · 4.0
The user rejected the simulated desktop-app styling because the page needed to be *visually attractive to men*, not simply resemble an operating system. The new preview is a full-width cinematic BLACKCELL MAN WORLD landing/onboarding experience:

- Bold editorial hero: **FIND YOUR WORLD.**, strong contrast, prominent BLACKCELL-branded male portrait collage using locally available Man's Armed Forces artwork.
- High-impact black + crimson styling and clean, Apple-inspired typography and control polish, without a fake macOS menu or sidebar.
- The 10 approved photo **world bubbles remain circles**, with red outline/glow for multi-selection, stronger photo visibility, and no checkmarks or floating motion.
- The world selection screen is the primary attraction; a premium glass control bar shows the selection count, selected names and *Enter My World* action.
- A clean second screen summarizes selected communities and allows editing.
- Responsive and mobile friendly. User preferences remain in memory only, not saved or transmitted.
- Editorial example photo URLs for individual hubs are temporary third-party sources. Before production, replace them with verified rights-cleared, consensual, BLACKCELL-hosted photography. The three hero portraits use existing repository assets.

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
