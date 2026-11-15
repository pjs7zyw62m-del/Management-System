# BLACKCELL Visual Finder 2.0

## What was implemented

- Existing Military Library integration and responsive modal retained.
- Tap/drag a detail to select a real cropped image. Optional **AI Refine Selection** uses Meta SAM 3.1 point segmentation when the server has `META_MODEL_API_KEY`, or an approximate OpenAI object box otherwise.
- **AI Find Similar Detail** uses an already-approved, paid OpenAI image index for candidate retrieval (text feature vectors) and performs a *second actual image-to-image verification* of the selected crop against up to 6 same-item candidates. It returns no guesses if the verification service fails.
- Liked or voted photos are omitted from subsequent gallery recommendations; LIKE starts another search with that photo as the source, with paid search confirmation.
- **Find New Photos Online** is optional and uses Google Cloud Vision **Web Detection**, not Google's consumer Lens API. The user must approve sending only the selected JPEG crop. External results open in a new browser tab, are not saved to BLACKCELL, and are labelled external.
- Existing SHA256 and difference-hash duplicate scanner remains opt-in and never deletes images.
- Backend uses existing JWT authentication, member RLS and bounded daily request quotas (index 15, search 40, refine 20, web 10). Paid actions require consent in the frontend.

## Server configuration

Supabase project: `eeddazzwqokqlzvzjlxz`; Edge Function `blackcell-visual-ai`.

- `OPENAI_API_KEY` (already required for the original feature): enables object cataloging, semantic candidate retrieval, visual verification and approximate point refine.
- `META_MODEL_API_KEY` (optional): enables point-driven Meta SAM 3.1 segmentation. The client sends normalized point and resized JPEG dimensions; the server maps the returned pixel box to normalized coordinates.
- `GOOGLE_VISION_KEY` (optional): enables Google Cloud Vision Web Detection. The corresponding Google Cloud Vision API must also be enabled and billing configured in the Google Cloud project.
- Never include these private keys in GitHub Pages, static JavaScript, or repository source. Add them using Supabase Dashboard → Edge Functions → Secrets.
- The status-check button displays which optional integrations are configured; internet discovery remains disabled when no Google key exists.
- Meta API/model availability and access vary by account; test with a known non-sensitive sample before offering production SAM.

## Known limits / follow-up work

- This update **does not** deploy a GPU-hosted DINOv3 or FashionSigLIP model or a Google Lens API. Those need hosting/access and separate benchmarks.
- Exact mask pixels from SAM are not painted yet; the UI draws its bounding box.
- The optional Google search results are visual leads, not guaranteed exact matches or rights-cleared assets; inspect the source and licensing.
- Web Discovery depends on Google Cloud Vision Web Detection's result coverage.
- Photo indexing and duplicate preflight are not run silently. Admin should first scan existing fingerprints for free, then explicitly index batches of owned photos.
- End-to-end authorized browsing and paid AI results must be tested with the website member session; static validation alone is not proof of runtime results.
