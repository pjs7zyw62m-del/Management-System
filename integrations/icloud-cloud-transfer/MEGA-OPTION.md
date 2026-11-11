# BLACKCELL iCloud-to-MEGA cloud transfer — optional destination

**Status: transfer script prepared, provider NOT connected, no files moved or copied.**

This is an alternative to the existing iCloud-to-Supabase plan. It leaves your current BLACKCELL gallery intact and lets you choose between two different MEGA products.

## Choices

| Destination | Best use | Website integration |
| --- | --- | --- |
| **MEGA personal Cloud Drive** (`DESTINATION=mega`) | Private encrypted archive, backups, personal collections | Not an S3 bucket; direct web serving is complex. Do not embed public share/decryption links in BLACKCELL. |
| **MEGA S4 object storage** (`DESTINATION=megas4`) | Storage behind a private website API for photos/videos | S3-compatible. Requires a server-side authorization/presigned URL adapter and new database backend references. **This integration is NOT yet deployed.** |

Both can receive iCloud Photos data from a private hosted worker running `rclone`. The worker reads iCloud and writes to MEGA; it does not need to route bytes through an iPhone, but transit/caching happens on the worker.

## Explicit-content clarification (2026-11-11)

The source library is **mixed**: alongside ordinary photographs of men in uniform, some photographs depict adult masturbation. Those images constitute **sexually explicit content** and must NOT be treated as a standard non-explicit uniform gallery. This is a change in the classification of the proposed import; it does not establish permission to store the content with MEGA.

Before any transfer of explicit media:
- Obtain written approval from the chosen storage provider for **lawful, consensual sexually explicit adult photographs in a private archive**, and separately for streaming any such content through BLACKCELL. MEGA General Terms prohibit material classified as "unsuitable" or "obscene"; neither its encryption nor the S4 API is an exemption from those rules. Reference: https://mega.io/terms.
- Confirm that every depicted individual is age 18+ and there is appropriate authority/consent for storage and display. The 18+ viewer gate alone is not proof of age verification or consent.
- Keep explicit media separate from ordinary uniform photographs, in an authenticated, restricted adult collection. No public object URLs, public sharing/decryption keys, unauthenticated thumbnails, or automatic discovery indexing.
- Keep the iCloud original as a backup and do not schedule an actual transfer until provider terms, destination security, and capacity are approved. The prepared script remains dry-run-by-default.
- If the provider declines explicit content, select a storage provider whose written policy permits the use case rather than concealing its nature.

## Content-policy warning — verify BEFORE paying or transferring

MEGA's published General Terms prohibit several kinds of unlawful and "unsuitable, offensive, obscene or discriminatory" material. They do not clearly promise that all legal sexually explicit adult content is allowed in private storage. Consumer Cloud Drive and S4 terms/acceptable-use conditions must both be checked; encryption does not mean an exemption from terms. **Get confirmation from MEGA support about your exact lawful adult content category and intended private website use before choosing this provider.**

Do not store or share any illegal or nonconsensual content. Verify rights/consent and legal ages.

## Server setup

1. Use a trusted private cloud VM or managed worker with persistent encrypted `rclone` config and secure secrets. No worker or MEGA plan has been created by this code.
2. Install a current release of `rclone` and run `rclone config` *only on the trusted worker*.
3. Create a remote named `icloudphotos`, type `iclouddrive`, service `photos`. Authenticate using Apple Account and 2FA on the worker; expect 30-day trust-token renewal. Verify source with `rclone lsd icloudphotos:` then `rclone lsd icloudphotos:PrimarySync/`.
4. For **MEGA Cloud Drive**: create remote `megadrive` of type `mega` using its authenticated account. Keep credentials and encryption material in the worker's private config.
5. For **MEGA S4**: provision a paid S4-enabled MEGA account, create a PRIVATE bucket and restricted server key. Create remote `megas4` with type `s3`, provider `Mega` and the region/endpoint reported in your MEGA S4 account. Do not guess the endpoint or hardcode keys.
6. Confirm `rclone lsd megadrive:` or `rclone lsd megas4:`, as applicable.

### Preview (no copy)

```bash
DESTINATION=mega DRY_RUN=1 bash copy-icloud-to-mega.sh
# OR for MEGA S4:
MEGA_BUCKET='YOUR_PRIVATE_S4_BUCKET' DESTINATION=megas4 DRY_RUN=1 bash copy-icloud-to-mega.sh
```

### Actual copy — only after account/policy/plan verification

```bash
DESTINATION=mega DRY_RUN=0 bash copy-icloud-to-mega.sh
# OR:
MEGA_BUCKET='YOUR_PRIVATE_S4_BUCKET' DESTINATION=megas4 DRY_RUN=0 bash copy-icloud-to-mega.sh
```

The script never deletes from iCloud (`copy` rather than `sync`/`move`) and never overwrites existing destination names (`--ignore-existing`). That means it is *not* a two-way mirror and edited versions with the same name may be intentionally skipped.

After copying, compare source/destination item counts and sizes, use `rclone check` where supported, and sample-view actual full-resolution photos/videos including Live Photo companion videos. Do not delete iCloud originals as part of this workflow.

## BLACKCELL deployment boundaries

- Existing BLACKCELL site currently uses private **Supabase `corp-social-media`** and `corp_social_assets` records. Uploading directly to MEGA does NOT register photos in that gallery.
- Before enabling **MEGA S4 as primary BLACKCELL storage**, build a server-side S3 presigning layer with authenticated member permissions, an S4 asset-references schema, thumbnails and streaming support, and duplicate indexing. Never publish S4 keys to GitHub Pages. Migrate existing objects only after verification and rollback planning.
- MEGA personal Cloud Drive is most suitable for a private backup/archive, not a direct production photo CDN.
- Large 1 TB collections require paying for sufficient storage and a suitable worker's transfer bandwidth. Verify current prices and transfer policies in your own account before running.
