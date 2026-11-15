# BLACKCELL OS — Optional application suite

## Release policy
All 19 applications are independently optional. Development is not installation. The existing corporate App Store remains authoritative for eligibility, installation and removal. No new app is automatically installed or pinned; no existing installations are modified. App Store listing moves from Coming Soon to Install only after an app passes its release checks and the server catalog is explicitly registered with the existing permissions. Uninstall removes the app from the desktop, not its saved account data. Deleting personal data is a separate explicit action. Never publish credentials or service-role keys to the browser.

## Application implementation register
| App | Development scope | Status |
|---|---|---|
| Calculator | Standard/scientific arithmetic, degrees/radians, keyboard and touch | Initial development build, parser tests passed; browser and OS integration pending |
| World Clock | Live IANA time zones, add/remove cities, 12/24-hour mode, alarms | Initial live-clock build; alarms, account preferences and browser/OS integration pending |
| Notes | Notes, notebooks, search, account autosave | Planned |
| Calendar | Events, recurring schedules, time zones, optional external calendar connection | Planned |
| Reminders | Lists, due dates, repeat schedules, notification permissions | Planned |
| Contacts | Private address book, search, import/export | Planned |
| Mail | Connected email through provider-authorized access; compose and inbox | Planned |
| Gunner AI | Existing Gunner service connection with per-account authorization and approved actions | Planned |
| Music | Personal audio library, playlists and playback | Planned |
| Cinema | Personal video library and playback | Planned |
| Wallet | Private manual finances, budgets and optional approved connections | Planned |
| Journal | Account-private daily entries and search | Planned |
| Vault | Private file storage, access controls and explicit deletion | Planned |
| Terminal | Restricted developer tools; explicit permissions and command safeguards | Planned |
| Voice Memos | Permission-based recording, playback, export and private storage | Planned |
| Documents | Word processing, saving, recovery and export | Planned |
| Spreadsheets | Grid, formulas, persistence and import/export | Planned |
| Creative Studio | Authorized AI image/video providers and explicit job cost controls | Planned |
| Presentations | Editable slides, save, preview and export | Planned |

## Release checklist (each app)
- Functional implementation, no placeholder actions; keyboard, mobile, tablet and desktop checks.
- App-specific authentication, account isolation, authorization and privacy checks as applicable.
- Verify persistence, reconnect and error handling where appropriate; no silent data loss.
- Verify lazy opening and closing, desktop layout, dock, recycle/uninstall and OS startup.
- Verify catalog registration and explicit user installation; preserve current user installs and settings.
- Deployment confirmation against actual production release, not only repository commit.
- For external services, require a working approved provider connection and disclose any costs.

## Initial development build
`blackcell-os-utilities-dev.html?app=calculator` and `blackcell-os-utilities-dev.html?app=worldclock` are separate entry modes in a shared utility file, not catalog entries yet. The build has no backend writes or personal cloud data. Clock preferences are session-only; alarms are not yet implemented. This branch is not merged to production.
