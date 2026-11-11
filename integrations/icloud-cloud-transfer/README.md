# BLACKCELL — iCloud cloud-to-cloud transfer (PREPARED, NOT CONNECTED)

> **Adult-media destination option:** See [MEGA-OPTION.md](MEGA-OPTION.md) for the prepared iCloud → MEGA Cloud Drive / MEGA S4 cloud-to-cloud transfer path. MEGA’s legal adult-content permissions require explicit provider verification; the option is not activated and existing BLACKCELL storage is unchanged.


## Correct architecture

**iCloud Photos (or iCloud Drive) → private hosted transfer worker running rclone → BLACKCELL Supabase Storage S3 bucket → metadata registration → Military Library.**

No file needs to be downloaded or reuploaded on an iPhone/iPad/computer. The temporary **cloud worker** streams the data between the two services. This is not a built-in Apple iCloud-to-Supabase API or a direct Apple-provider transfer.

### Current verified destination

- Supabase project: `eeddazzwqokqlzvzjlxz`
- Private bucket: `corp-social-media`
- Current per-file limit: **45 MiB**
- Existing 33 files are already registered in BLACKCELL and untouched by this integration.
- **1 TB of storage has NOT been provisioned**. Do not start a large migration before validating the destination provider's paid capacity and file limits.

### Prerequisites

1. A **private cloud worker** (small VPS / container runner with persistent encrypted rclone configuration). This is an ongoing hosting/service dependency, not GitHub Pages or a browser file picker. No worker has been provisioned by this commit.
2. On that worker, install current **rclone** and create an `icloudphotos` remote using `rclone config`:
   - storage type: `iclouddrive`
   - service: `photos`
   - sign in using your Apple Account and 2FA **on your own trusted runner only**.
   - Verify with `rclone lsd icloudphotos:` and `rclone ls 'icloudphotos:PrimarySync/All Photos' --max-depth 1`.
   - If transferring iCloud **Drive** instead, create a separate remote using service `drive` and change the script source path.
   - Expect reauthentication when the Apple trust token expires (approximately 30 days). The rclone iCloud backend uses an unofficial Apple interface and may require maintenance.
3. In the **Supabase Dashboard → Storage → Configuration → S3**, enable S3 access and create a temporary **server-only** access key. Copy the documented S3 endpoint and region. **S3 access keys bypass storage RLS and can access all buckets**; do not place them in GitHub, GitHub Pages, chat messages, the browser, or any publicly readable config.
4. Create the destination rclone remote `blackcells3`, using `storage = s3`, `provider = Other`, **the endpoint / region from the Supabase dashboard**, and your server-only S3 credentials. Verify listing with `rclone lsd blackcells3:`.
5. Get the correct owner UUID from an authenticated BLACKCELL account. For a separate member's collection, always use that member's UUID, not the site administrator's by default.

### Safe first run

On the cloud worker, in the directory containing `copy-icloud-to-blackcell.sh`:

```bash
export BLACKCELL_OWNER_UUID='REPLACE-WITH-OWNER-UUID'
DRY_RUN=1 bash copy-icloud-to-blackcell.sh
```

After confirming the intended source, destination, supported file types, sizes, and estimated volume:

```bash
export BLACKCELL_OWNER_UUID='REPLACE-WITH-OWNER-UUID'
DRY_RUN=0 bash copy-icloud-to-blackcell.sh
```

The script:
- Copies only into `corp-social-media/<owner_uuid>/icloud-import/`.
- Copies supported JPG/JPEG/PNG/WEBP/GIF/HEIC/MP4/MOV/M4V/WEBM files up to the **existing 45 MiB** file limit.
- Uses `rclone copy --ignore-existing` so it does **not** delete or replace existing iCloud or BLACKCELL files. It may skip edited versions under existing paths.
- Can resume/retry without reimporting already named objects.
- Does **not** auto-register assets in BLACKCELL's gallery.

### CRITICAL: Gallery registration after cloud transfer

Files uploaded through S3 exist in `storage.objects` but will not be visible as BLACKCELL Military Library photos until **matching rows in `corp_social_assets` are created**. Run the preview and registration SQL in `register-icloud-import.sql` with a privileged, verified Supabase administrator context, substituting the same owner UUID. The registration query only adds approved media metadata for paths under this owner's `icloud-import/` prefix and skips preexisting paths.

Afterwards, verify the total assets, number of imported objects, MIME types, and original photos from a signed-in BLACKCELL account. Only then consider scheduling a read-only-to-iCloud recurring `copy` task.

### Security and cost considerations

- DO NOT provide Apple credentials, 2FA codes, rclone configuration, or S3 keys in chat or commit them to GitHub. Use restricted worker secrets and a secure encrypted config volume.
- Rotate the unrestricted S3 key when the one-time import is complete; alternatively use a short-lived authenticated S3 session if compatible with the chosen worker's runtime and token-refresh mechanism.
- Cloud workers, storage GB-month, requests and network egress can incur charges. Preview volume before switching off the dry run.
- The current 45 MiB cap is unsuitable for some original videos; leave oversized files in iCloud pending a high-capacity destination such as Cloudflare R2 and a complete BLACKCELL catalog integration.
- `rclone` on iCloud Photos is read-only. Imported items are COPIES, not deletions or moves.
- Expect photos/Live Photo companions and Apple album structure to require format and metadata validation. No guarantee of a bit-for-bit complete iCloud library without validating counts and unsupported formats.

### Verification status

Implementation scaffold committed; **no iCloud account connected, no transfer worker installed, no S3 credentials created, no transfer run, no images imported by this change**.
