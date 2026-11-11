# Visual Finder — Full Gallery Recall Fix (2026-11-11)

## Original problem
- Only 4 of 33 eligible photographs had records in the AI feature index.
- "AI Find Similar Detail" only searched those indexed photos and excluded previously liked/voted photos at the client layer.
- Free color matching required hard-coded similarity cutoffs (including 0.94), hiding plausible results.
- User knows three similar gallery photos were not returned.

## Implemented
1. Tap or drag an area to automatically display free, clearly labeled **approximate** appearance leads from the current accessible gallery. No AI credits.
2. Clicking **AI Find Similar Detail** asks approval for **all** accessible photos to be compared directly by a vision model, in batches of up to five real resized photographs per paid request; a separate AI catalog index is no longer a prerequisite.
3. Direct searching includes previously liked/voted photos, unlike automatic rediscovery. No votes, favorites, deletions or uploads are modified.
4. AI produces a match assessment for each photo. The main result set displays likely matches; **Review Other Photos** exposes all nonmatches and unassessed items for manual inspection.
5. Refresh one expired signed storage URL before declaring a photo unreadable; show any unreadable photo in review.
6. Keep authentication, RLS checks and existing daily AI request budget; **search** quota records one per batch, limit 40/day. No service-role secrets used.
7. Hide the optional legacy indexing button to avoid unnecessary paid indexing.

## Notes / limitations
- This is direct OpenAI vision comparison, not installed DINOv3 or guaranteed exact Google Lens search.
- Model-based judgments may miss details. This is why nonmatches remain available for manual inspection.
- Each full gallery scan performs up to `ceil((accessible photos - 1)/5)` paid requests; for 33 photos, up to 7 calls. The user must approve this in the browser.
- Confirmed test coverage: code parse, DOM integration, static authorization guard checks. Signed-in paid AI search not executed by the developer tools because an authenticated member browsing session is not available.
- A future improvement is persisted region-specific human feedback and dedicated visual embeddings for faster larger-scale search.
