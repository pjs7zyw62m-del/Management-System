#!/usr/bin/env bash
# BLACKCELL: iCloud Photos -> MEGA cloud using a PRIVATE HOSTED transfer worker.
# COPY only: no deletion or modification at either source.
# DRY_RUN=1 by default; secrets remain in encrypted rclone config on worker.
set -euo pipefail

: "${ICLOUD_REMOTE:=icloudphotos}"
: "${DESTINATION:=megas4}"
: "${DRY_RUN:=1}"
: "${MEGA_BUCKET:=}"
: "${MEGA_PREFIX:=blackcell-icloud-archive}"

case "$DESTINATION" in
  mega)
    : "${MEGA_REMOTE:=megadrive}"
    dest="${MEGA_REMOTE}:${MEGA_PREFIX}"
    ;;
  megas4)
    : "${MEGA_REMOTE:=megas4}"
    : "${MEGA_BUCKET:?Set MEGA_BUCKET to the S4 bucket name from your MEGA dashboard}"
    dest="${MEGA_REMOTE}:${MEGA_BUCKET}/${MEGA_PREFIX}"
    ;;
  *)
    printf >&2 'DESTINATION must be mega or megas4.\n'
    exit 2
    ;;
esac
command -v rclone >/dev/null || { printf >&2 'Install rclone on the private cloud worker first.\n'; exit 2; }
src="${ICLOUD_REMOTE}:PrimarySync/All Photos"

args=(--ignore-existing --transfers 2 --checkers 2 --retries 3 --stats 30s --progress)
if [[ "$DRY_RUN" != "0" ]]; then
  args+=(--dry-run)
  printf 'PREVIEW ONLY: no files will be transferred.\n'
else
  printf 'LIVE CLOUD COPY: source iCloud files stay untouched.\n'
fi

printf 'SOURCE: %s\nDESTINATION: %s\n' "$src" "$dest"
printf 'MEGA account destination: %s\n' "$DESTINATION"
printf 'This is a cloud-WORKER-mediated copy, not a native iCloud/MEGA service connection.\n'
printf 'Verify provider policies, storage plan, and supported file types before live transfer.\n'
rclone copy "$src" "$dest" "${args[@]}"
printf '\nCopy invocation finished. Confirm counts and integrity before considering archive complete.\n'
printf 'IMPORTANT: Files at MEGA are NOT automatically visible in the BLACKCELL website.\n'
