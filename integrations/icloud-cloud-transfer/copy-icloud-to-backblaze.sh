#!/usr/bin/env bash
# BLACKCELL cloud-to-cloud iCloud Photos -> private Backblaze B2 STAGING bucket.
# Run on a trusted hosted cloud worker. DRY RUN by default.
# THIS DOES NOT PUBLISH OR REGISTER PHOTOS IN BLACKCELL.
set -euo pipefail
: "${ICLOUD_REMOTE:=icloudphotos}"
: "${B2_REMOTE:=backblazeb2}"
: "${B2_BUCKET:?Set B2_BUCKET to your PRIVATE B2 bucket name}"
: "${BLACKCELL_OWNER_UUID:?Set authenticated BLACKCELL owner's UUID}"
: "${DRY_RUN:=1}"
if ! [[ "$BLACKCELL_OWNER_UUID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo 'Invalid owner UUID' >&2; exit 2
fi
command -v rclone >/dev/null || { echo 'rclone must be installed on the private worker' >&2; exit 2; }
source_path="${ICLOUD_REMOTE}:PrimarySync/All Photos"
target="${B2_REMOTE}:${B2_BUCKET}/blackcell-intake/${BLACKCELL_OWNER_UUID}"
args=(--ignore-existing --transfers 3 --checkers 4 --retries 4 --stats 30s --progress)
if [[ "$DRY_RUN" != "0" ]]; then args+=(--dry-run); fi
printf 'Source: %s\nDestination: %s\nDRY_RUN=%s\n' "$source_path" "$target" "$DRY_RUN"
printf 'No iCloud files will be deleted. No BLACKCELL photos will be published.\n'
printf 'Verify provider approval of lawful explicit media, paid capacity, credentials and destination before running LIVE.\n'
rclone copy "$source_path" "$target" "${args[@]}"
printf 'Copy step complete. A separate B2-to-BLACKCELL metadata/presigning connector and owner review must run BEFORE gallery publication.\n'
