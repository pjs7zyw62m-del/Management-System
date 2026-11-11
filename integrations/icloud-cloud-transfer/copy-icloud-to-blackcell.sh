#!/usr/bin/env bash
# BLACKCELL cloud-to-cloud iCloud Photos -> private Supabase S3 Storage.
# Run ONLY on a dedicated trusted cloud worker with rclone configured.
# No source deletion. DRY_RUN=1 by default; no secrets in this script.
set -euo pipefail

: "${BLACKCELL_OWNER_UUID:?Set the exact signed-in BLACKCELL owner's Supabase user UUID}"
: "${ICLOUD_REMOTE:=icloudphotos}"
: "${DEST_REMOTE:=blackcells3}"
: "${DEST_BUCKET:=corp-social-media}"
: "${DRY_RUN:=1}"

if ! [[ "$BLACKCELL_OWNER_UUID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  printf >&2 'BLACKCELL_OWNER_UUID must be a valid UUID.\n'
  exit 2
fi
command -v rclone >/dev/null || { printf >&2 'Install rclone first.\n'; exit 2; }

source_path="${ICLOUD_REMOTE}:PrimarySync/All Photos"
dest_path="${DEST_REMOTE}:${DEST_BUCKET}/${BLACKCELL_OWNER_UUID}/icloud-import"
args=(
  --ignore-case
  --include '*.{jpg,jpeg,png,webp,gif,heic,mp4,mov,m4v,webm}'
  --max-size 45M
  --ignore-existing
  --transfers 2
  --checkers 4
  --retries 3
  --stats 30s
  --progress
)
if [[ "$DRY_RUN" != "0" ]]; then
  args+=(--dry-run)
  printf 'DRY RUN — no objects will be transferred. Set DRY_RUN=0 after review.\n'
else
  printf 'LIVE COPY — source iCloud files will be preserved; destination copies will be created.\n'
fi
printf 'Source: %s\nDestination: %s\n' "$source_path" "$dest_path"
printf 'Only supported media up to 45 MiB is copied into the current BLACKCELL bucket.\n'
rclone copy "$source_path" "$dest_path" "${args[@]}"
printf '\nTransfer step complete. Registration of imported files in corp_social_assets is a SEPARATE admin step.\n'
