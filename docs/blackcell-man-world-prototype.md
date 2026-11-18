# BLACKCELL MAN WORLD — Seven Worlds Visual Prototype

## Design approval and scope

Updated from the latest BLACKCELL-approved visual concept: a photorealistic dark corporate military-facility banner with two fully clothed adult men, the BLACKCELL Corporation hexagonal emblem, metallic silver-and-crimson MAN WORLD branding, and seven circular world categories.

**Preview only.** This is a self-contained responsive HTML experience in `blackcell-man-world-prototype.html` on branch `man-world-preview`. It does not change production BLACKCELL OS.

## Seven photo worlds

1. Military World
2. Law Enforcement World
3. Firefighter World
4. Paramedic World
5. Corrections World
6. Airline Pilot World
7. Uniform World

All bubbles display photographic art cropped from the user-approved concept image, with labels, "0 MEDIA" preview metadata, and a crimson selected-state halo. No checkmarks, no floating motion. Desktop shows seven in a row; tablet and phone adapt to fewer columns.

## Visual system

- Black and brushed steel, bright crimson, subtle reflections and tactical-industrial architectural motifs
- Official user-provided BLACKCELL Corporation transparent hexagon logo
- Low-key black-glass navigation and Level 04 corporate footer
- Responsive, accessible selection buttons with `aria-pressed`, keyboard focus treatment, and reduced-motion support
- Hero image and world photographs embedded in the standalone HTML as compressed WebP, so the preview does not rely on external image hosting
- Edited crop assets come from the user-approved AI-generated visual mockup; they are concept imagery, **not photographs of real BLACKCELL personnel**

## Functionality

- Click one or more circles to highlight and select a world; click again to remove
- Search the seven worlds
- Enter My World previews the selected worlds in a modal without creating accounts
- Clear removes local selections
- Other navigation entries explicitly identify themselves as design placeholders
- No authentication, media uploads, persistent preferences, payments, or real-world memberships

This is a proof of concept and should not be merged into production until separately approved. All content and access controls for a real public community still need implementation.

## Stable preview

`https://raw.githack.com/pjs7zyw62m-del/Management-System/man-world-preview/blackcell-man-world-prototype.html`

The branch URL is stable across preview updates; the third-party static preview service may occasionally cache changes. Refresh with Ctrl + Shift + R where supported.
