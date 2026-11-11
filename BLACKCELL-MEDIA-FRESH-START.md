# BLACKCELL — Photo & Video Fresh Start + Import Processor

**Status:** Database review gate active and review interface available from the Level 7 Administration dashboard. Media reset still requires explicit owner action. **Existing 33 photos have NOT been deleted.** External iCloud→Backblaze B2 is NOT connected or running.

## 1. Permanent fresh-start reset

Only the verified BLACKCELL Level 7 corporate owner can open **Administration → Media Import Processor** (`corporate-media-admin.html`) and see the **Reset All BLACKCELL Photo & Video Media** control. These controls have been removed from the Network Military Library. It requires both browser confirmation and typing `DELETE ALL BLACKCELL MEDIA`.

The reset proceeds in this order:
1. Read the exact current media file paths from `corp_social_assets` (not from a user-supplied URL).
2. Remove each batch of private `corp-social-media` objects through the **Supabase Storage API**, NOT SQL. Stop if a storage operation fails.
3. Delete each successful asset record. Cascading FKs remove media-linked votes, favorites, duplicate fingerprints, visual AI indexes, analysis, rediscovery and album associations.
4. Remove any *empty* media-only social posts owned by the initiating owner, clear the owner's old albums and saved country collection presets.
5. Verify the media table contains zero photo/video records. Refresh the website state.

**Intentionally untouched:** original iCloud photographs and videos; NEXUS inmate photos; employee identities/permissions; private chat-media attachments and chat messages; text-only social posts; GitHub files and visual design.

**Important:** No browser session from this coding environment can perform the authenticated Storage API remove. The reset must be initiated from the corporate owner's signed-in website. Do not delete `storage.objects` from SQL: that would orphan the actual files.

## 2. Protected intake path for ALL future photos and videos

All newly uploaded `library` or `post` assets are assigned `review_status='pending'` **by a database trigger**, even if a client tries to mark them approved.

The private media and its signed Storage URL are visible only to its owner and verified Level 7 corporate administrators while pending; shared galleries, album browsing, recommendation engines, visual discovery, profiles and network feeds exclude them.

**Employee interface:** Employees still upload photos and videos from **BLACKCELL Network → Military Library**, but the advanced upload classification and batch AI controls are hidden. The separate Administration page requires owner role, clearance level 7, current corporate security-code verification and Supabase RLS. Employees cannot open its processor or reset controls. The administrative dashboard design itself is not modified beyond a new navigation card/link.

**Manual review is required before release:**
- Identify the country *only when supported by evidence*. Unknown remains pending.
- Confirm military branch, subject, era (where known), unit (optional), and distinctive searchable tags.
- Classify as adult-restricted when explicit. Adult-restricted media stays owner-only, and can never enter a shared album.
- Check rights/consent, and for explicit material, adult age eligibility before approval.
- Optionally run existing AI suggestions for an approved **non-explicit photograph**, then CORRECT any mistaken labels. AI provider credits may apply. Video AI recognition is NOT implemented; videos use manual review.
- For nonexplicit approved media, match an existing album with the same country/branch/category, or create a new precisely labeled album. Album association is created **before** approval to prevent incorrect or unfiled release.

No automatic country inference from unreliable uniform visuals; owner verification is the classification source of truth. This favors correctness over unattended publishing.

## 3. Future Backblaze B2 / iCloud cloud-to-cloud pathway

`integrations/icloud-cloud-transfer/copy-icloud-to-backblaze.sh` is a **dry-run-by-default** skeleton to use on a trusted private cloud worker. It copies iCloud Photos into a PRIVATE B2 staging prefix under the owner's UUID. It never publishes directly.

**Not yet done / requires separate setup:**
- Backblaze B2 account, 1 TB+ paid capacity, restricted S3 application keys and private bucket.
- Written provider confirmation that private storage and authenticated use of the specific lawful sexually explicit adult content is permitted.
- Private cloud transfer worker for Apple Account 2FA and rclone authentication, including periodic renewal.
- Server-side B2 asset registration and S3 presigner/streamer for BLACKCELL (GitHub Pages must never contain B2 credentials).
- Complete dedupe and media verification against staging, transaction-safe catalog registration, video size support and AI indexing after approval.

**Do not assume the dry-run script alone makes B2 media appear in BLACKCELL.** The present deployed website's media storage is still Supabase's 45 MiB-per-file private bucket. Large video transfers and a 1 TB collection require the B2 pipeline to be finished and verified.

## 4. Verification checklist

- The owner sees the reset + import review panel; an employee cannot.
- After performing reset: 0 records in `corp_social_assets`; 0 objects in `corp-social-media`; other buckets unchanged.
- A new photo uploaded to Military Library appears in pending queue but NOT normal gallery.
- A new video behaves identically and can be previewed manually.
- Country/branch/category must be confirmed; an unknown country cannot be silently filed as another country.
- Nonexplicit approved media appears in matching country album.
- Explicit approved media appears only under the owner's PRIVATE 18+ ARCHIVE; employees cannot sign or fetch those private objects.
- New media is never auto-sent to OpenAI for analysis.

## November 11 — Administration location

- Administration dashboard card + navigation: **Media Import Processor**.
- Dedicated security-gated route: `corporate-media-admin.html`.
- The old processor/irreversible-reset interface was removed from `corporate-network.html`.
- Existing pending uploads continue to be gated by database policies and protected Storage URLs.
- Website deployment must be tested in the owner's authenticated browser before claiming a successful live end-to-end review or reset.

## November 11 — Backblaze connection health check

The owner has created a private Backblaze B2 bucket and a bucket-scoped read/write application key restricted to `blackcell-intake/`. To check connectivity without exposing credentials:

1. In **Supabase → Edge Functions → Secrets**, securely set (values must NEVER be committed or shared in chat):
   - `BLACKCELL_B2_KEY_ID`: B2 application key ID
   - `BLACKCELL_B2_APPLICATION_KEY`: B2 application key secret
   - `BLACKCELL_B2_BUCKET`: `blackcellcorp-media-vault`
   - `BLACKCELL_B2_ENDPOINT`: `https://s3.us-east-005.backblazeb2.com`
2. Open BLACKCELL **Administration → Media Import Processor** and select **CHECK CONNECTION** in **Backblaze B2 Storage**.
3. The Supabase JWT-verified `blackcell-b2-storage` Edge Function verifies the owner role, clearance level 7 and current corporate code session; it makes one AWS SigV4 **ListObjectsV2** request scoped to `blackcell-intake/`, with `max-keys=1`. Only a connection status is returned.
4. A connected status confirms the secret, region, bucket and read/list permission for the staging prefix. **It does not verify write access**, provision capacity, transfer images, index photos or enable large-video browsing. Keep importing paused until the owner expressly approves the full pipeline.
5. If not connected, verify values in Supabase Secrets without showing them to another person.

**Security:** No B2 secrets in GitHub, public HTML, site JavaScript, logs or API responses; B2 requests originate on the Edge Function server. Provider written confirmation for the planned lawful adult media and reliable 1 TB+ iCloud-to-B2 cloud-to-cloud processing remain outstanding.
