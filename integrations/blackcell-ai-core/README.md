# BLACKCELL AI Core — Phase 1 (safe self-hosted foundation)

**Status: staging code only. NOT connected to the production website, not a trained model, and not currently serving video.** No paid server or GPU is provisioned by this project. Existing production Uniform Intelligence and Gunner are unchanged until an explicit, verified migration.

## Purpose

BLACKCELL OS gets a private, CPU-light inference gateway on its OS Core server. Expensive **GPU model inference is separate**, on a dedicated private GPU host connected by WireGuard or an equivalent private tunnel. Bunny remains the storage and delivery layer. Supabase remains the identity and metadata layer.

- **Uniform Intelligence:** use Qwen/Qwen3-VL-8B-Instruct (Apache 2.0) on a private GPU through an OpenAI-compatible vLLM API. The pilot returns **unverified suggestions only**. It does not alter assets, classifications, publication state or permissions.
- **Gunner Thompson:** preserve the existing Gunner Dolphin 3.0 personality, original memories and separate service. This gateway offers a *generic* private chat endpoint for future controlled migration. The associated staged Gunner bridge update adds only aggregate vector/fingerprint coverage, never media pixels or write permissions.
- **Video Studio:** Wan2.2 TI2V-5B is a candidate, but needs its own GPU job worker, generation safety checks and Bunny output authorization. `/v1/video` intentionally returns 503 until implemented and evaluated. No Seedance 2.5 weights are included.
- **Developer assistant:** future separate role-based tool worker; an LLM endpoint alone cannot make live changes. GitHub/server write actions require scoped service tokens, audit logs and human approval for destructive/publishing operations.

## Security gates

1. The gateway listens on **localhost only** via Docker port binding. It has no browser CORS endpoint and authenticates server-to-server callers using a long random secret. Never expose GPU inference ports publicly.
2. Callers must be a trusted, verified BLACKCELL authorization broker, which checks authenticated owner, media source, rights, adult restriction, rate limits and clearance at the database; **never** accept those checks solely from a browser boolean. The gateway repeats basic field checks as defense-in-depth.
3. The initial pilot refuses any `adult_restricted=true`, `rights_confirmed=false` or `server_authorized=false` request. **No adult media** goes to an unapproved GPU provider. Obtain written confirmation from the OS/GPU/cloud providers for the intended business and content before changing restrictions.
4. One private photo preview at a time (up to 3 MB encoded), transiently forwarded to the private GPU; *no* original is stored on the OS Core. Even pass-through processing handles media bytes and can carry personal data temporarily. Never log them.
5. Unauthorized calls, missing configuration, and provider errors **fail closed**. No silent OpenAI fallback, no automatic publication, no media transfers or album modification.
6. The Docker image and dependencies must be locked/scanned and the base-image digest pinned before production. Add request-size limits and reverse-proxy authentication at deployment. Use a real secret manager and rotate all tokens.
7. Before production test: signed-out users; expired and revoked access; cross-user assets; adult/restricted assets; provider failures; GPU disconnected; retries; image MIME mismatch; >3 MB previews; concurrent requests; egress and cost monitoring.

## Local development (CPU gateway only)

Requires Python 3.12. Create a virtual environment, install `requirements.txt`, then run `uvicorn app:app --host 127.0.0.1 --port 8188 --no-access-log`. For offline tests install pytest and run `pytest -q test_app.py`. No GPU or AI API calls are needed for those unit tests.

For container staging only: `cp .env.example .env`, **replace** all placeholder tokens/model URLs, then `docker compose up --build`. Compose binds to `127.0.0.1:8188`. The `.env` file must remain uncommitted and be replaced with injected secrets in production.

Model hosts:
- Vision: `Qwen/Qwen3-VL-8B-Instruct` via a compatible vLLM (check upstream compatibility and pinned release before deployment).
- Text: separately approved self-hosted text model; do not replace original Gunner without a behavioral/memory regression test.
- Video: separately isolated Wan2.2-compatible worker; *not* included in this gateway.

Reference documentation:
- https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct
- https://docs.vllm.ai/projects/recipes/en/stable/Qwen/Qwen3-VL.html
- https://github.com/Wan-Video/Wan2.2

## Measurable rollout

**Gate A:** Worldstream and the GPU provider confirm the acceptable-use scope in writing; BLACKCELL has an approved server and an appropriate GPU plan.

**Gate B:** Connect an isolated private GPU and validate the service using synthetic, non-restricted images and prompts. Measure CPU/VRAM use, API errors, rate limits and per-image cost. Test failure isolation and secure transport.

**Gate C:** Run a blinded, consented sample of 50–100 existing non-restricted uniform photos through the self-hosted model and current model. Measure world, country, branch and camouflage precision/coverage *separately* using owner-verified ground truth. Do not treat model similarity percentages as probability.

**Gate D:** Enable owner-only opt-in with rapid rollback; handle the full persistent queue via OS Core with idempotent jobs, monitorable retry policy and no browser dependency. Keep rights and publication approvals separate from classification confidence.

**Gate E:** Upgrade Gunner with independently verified statistics and taste memory, then run model and behavior comparisons. Implement a separately authorized video job runner that delivers outputs through Bunny only after tests.

**No production cutover** until Gates A–D pass for Uniform Intelligence and independently for Gunner/video.

## Why the current BLACKCELL OS server alone is insufficient

A 12-core, 64-GB RAM CPU-only server is ideal for orchestration and application processes, but **not** for production-quality vision and video model inference at scale. GPU inference has ongoing rental/power costs even with self-hosted software. Self-hosting is about control and potentially lower unit costs at sufficient usage—not zero cost or automatic improvement.
