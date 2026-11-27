# CORE release integrity
The website uses the shared release inspector regardless of browser or device type. It compares the loaded entry references and build metadata against the actually published page; it does not assume a GitHub commit is deployed.

## Release preparation
When direct CSS or JavaScript changes, update all referencing entry URLs. Run `RELEASE_BASE=<base commit SHA> RELEASE_HEAD=HEAD RELEASE_TOKEN=<unique release> node scripts/core-release-check.mjs --stamp` after committing the source changes on a release branch, review and commit the result. Review dynamic imports separately. The preflight workflow rejects unchanged direct entry asset URLs. The OS build and fallback manifest must agree for OS releases.

## Production verification
CORE Release Integrity runs preflight on pull requests and checks the published bytes for changed static files after pushes to main, with bounded retries. Front-matter-generated pages require separate validation; the release manifest fallback is compared separately. A GitHub merge alone is not a confirmed deployment. Inspect the Actions result before declaring delivery successful. Do not bypass failed checks. Branch protection and GitHub Pages hosting settings are managed separately.

## Safe updates
Verified owner OS sessions can still update automatically when idle if enabled. Other eligible pages check on entry/return (at most once per five minutes, not polling); if stale, show a manual reopen control. Login, employee entry and standalone REDLINE are protected from automatic checks/reloads. Active REDLINE windows, uploads, unsaved forms and dialogs prevent updates. Existing authenticated sessions and library files are not cleared. Older loaded clients need one manual navigation to receive the improved updater.
