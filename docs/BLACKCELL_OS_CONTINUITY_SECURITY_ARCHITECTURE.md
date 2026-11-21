# BLACKCELL OS — Continuity and Security Architecture
**Status:** Accepted product direction / future work. Not a claim of shipped functionality.
**Scope:** BLACKCELL browser/PWA OS on iPhone, iPad, and desktop.

## Product principle
Make devices feel continuous and macOS-like **without falsely claiming native Apple APIs, kernel privileges, or Secure Enclave control**. Every remote operation must require account authorization. Keep NEXUS and other BLACKCELL applications' permission boundaries intact.

## Continuity capability matrix

| Apple reference | BLACKCELL equivalent | Browser/PWA boundary | Implementation phase |
|---|---|---|---|
| Handoff | “Continue on BLACKCELL”: save a minimal, allowlisted app route and safe draft pointer to the verified member account; show resume tiles on other signed-in devices | Never silently synchronize private editor contents, media or passwords; opt-in per app | Phase 1 |
| AirDrop | BLACKCELL Private Share with user-to-user offers, receiver approval, encrypted transport/storage, size policy, expiration and revocation | Not Apple AirDrop/Bluetooth peer discovery | Phase 2 |
| iPhone Mirroring | User-initiated, consented, view-only screen share in supported browsers | Cannot remotely control a user's iPhone or mirror an iPhone OS through browser APIs | Research only |
| Phone from Mac | In-app BLACKCELL voice/video calling with WebRTC and permission prompts | Not cellular/PSTN calling without a separately contracted carrier and compliance work | Phase 3 |
| Universal Clipboard | Explicit “Send clipboard to my device”: user taps Share, receiving device taps Paste; short TTL and preview | Browsers cannot read another device’s system clipboard silently | Phase 2 |
| Sidecar | Companion display for BLACKCELL windows on a paired second browser/tablet | Cannot register iPad as OS-level external monitor | Phase 3 |
| Universal Control | Authorized cross-device in-app cursor/control layer for BLACKCELL-only windows | Cannot take over system keyboard or pointer globally | Research only |

### Continuity invariants
1. Both devices must be signed in to the same verified account or an explicitly approved recipient relationship; never trust device names alone.
2. Synchronize only allowlisted metadata (app ID, route, pointer, savedAt, expiry) rather than raw message bodies, camera frames, passwords, private media contents or clipboard values without direct initiation.
3. Expire handoff entries (e.g. 24 hours), show “Continue on BLACKCELL” only for resumable, authorized apps, and revoke on sign-out or app uninstall.
4. Receiving device must repeat authorization checks; an originating device may not grant itself or a peer elevated permissions.
5. Do not infer the presence of Apple's native Continuity APIs based on an iPhone/iPad user-agent.

## BLACKCELL security analogues (not Apple feature equivalence)

| macOS technology | BLACKCELL security requirement | What is NOT claimed |
|---|---|---|
| Gatekeeper/notarization | Allowlisted, versioned application manifest; integrity-verified deployment artifacts; explicit install approvals; safe update/rollback; runtime permission checks on every app launch | Apps are not Apple notarized or signed by Apple |
| System Integrity Protection | Protected server-side routes, least-privilege CI and cloud roles, write-protected production release artifacts, audit trails, emergency rollback and strong account authorization | No XNU/kernel-level filesystem protection inside a website |
| Secure Enclave | Passkey/WebAuthn authentication, hardware-backed credentials *when the platform supplies them*, server-side key custody and independent session enforcement | No direct programmatic access to extract/control Apple's Secure Enclave |
| App Sandbox | Strong CSP, iframe `sandbox` with minimal capabilities, origin isolation where feasible, restrictive Permissions-Policy, per-app and per-resource authorization/RLS | Iframe isolation alone is not an OS kernel sandbox |
| Exclave / kernel memory isolation | Separate server trust zones and privileged services, scoped tokens and defense in depth | The browser OS does not implement kernel enclaves or Apple's exclaves |

## Required security acceptance tests
- App whose manifest is missing/not approved is not launchable even with forged UI elements or local storage.
- Direct requests to another member's storage folder are rejected by server-side RLS/policies; signed URLs are scoped and short-lived.
- Cross-device handoff forged with a different user ID, deleted app, expired token or locked session is refused.
- Remote clipboard shares require initiating and accepting gestures and expire automatically. Do not archive content or place it in system clipboard without a second gesture.
- In-app calls require camera/microphone permission. Screen sharing is visibly active and can be stopped from the originating device.
- Logout invalidates pending handoffs/shares; device loss permits session revocation.
- No secret keys or service-role tokens in client JavaScript, HTML or device storage.
- All fallback UI clearly distinguishes a working integration from a proposed or unsupported native feature.

## Delivery phases
1. **Mac workstation foundation** (current PR): Launchpad, Dock, menu bar, Spaces, Mission Control, Spotlight, desktop files, window lifecycle. Preserve original app permissions.
2. **Secure continuity MVP:** Handoff of safe app pointers, device registry, recipient confirmation, expiry/revocation, audit records; validate with iPhone→desktop and desktop→iPad tests.
3. **Private Share + clipboard:** Consent-first file transfers and explicit clipboard shares, backed by protected storage/DB policies. No native AirDrop claim.
4. **Communication/companion workflows:** WebRTC in-app calls and an optional BLACKCELL companion-view session. Only after privacy, abuse prevention and performance testing.
5. **Security hardening:** CSP/Permissions-Policy review, SRI/manifest validation, WebAuthn/passkeys where supported, isolation/penetration testing, incident response and deployment rollback drills.

## Non-goals
No spoofed Wi-Fi/Bluetooth toggles, system-wide phone mirroring, native cellular calling, XNU kernel features, Secure Enclave identity claims, invisible device access, unconsented device pairing or silent clipboard collection. Apple services are external and only available via legitimately authorized integrations.

## Privacy boundary
Do not mix BLACKCELL uniform/media site data with NEXUS corporate records merely because the user opens both in BLACKCELL OS. All device-to-device exchanges respect app/domain boundaries and recipient consent.
