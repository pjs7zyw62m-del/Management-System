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

## Visual Hierarchy 6.0 · Photographic impact with BLACKCELL restraint

The user's comparison to the reference page highlighted a specific gap: BLACKCELL's page had too much empty black space and its two hero men were too hidden to establish the intended male-focused attraction. This version uses the reference only for general hierarchy, **not copied art or markup**.

- Full-bleed, multi-portrait male hero with five existing BLACKCELL-owned/repository uniform-world portrait assets, subtle crimson dividers and a black editorial gradient for readable copy. The portrait panels are full-height with no rotation, no standalone cards and no giant outlined lettering.
- Polished, Apple-influenced interface treatment with understated smoked glass and a strong but concise CTA that scrolls to the worlds.
- More legible, brighter approved circular photo bubbles; unselected bubbles stay subtle, a selected bubble only gets a red ring and image lift, no checkmark.
- Tighter content spacing to bring the world directory higher into view with bold but professional typography.
- All 10 original categories, multi-select, search, skip, subsequent home preview and editing remain intact.
- The actual production BLACKCELL OS is not touched, and no member interests are saved in this prototype. Reference page images are **not copied**.
- Existing third-party images inside individual category circles remain temporary preview assets, subject to image licensing, consent, and BLACKCELL-owned media review before live use.

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
