# BLACKCELL OS — Optional application suite

## Release policy
All 19 apps have an initial development entry. Keep each application independently optional, preserve existing corporate authorization and the server-owned installation state, and never automatically install or pin any app. No development entry is registered in the production catalog. Uninstall must preserve account data. Never expose service keys or credentials. This branch is not merged or deployed.

## Development implementation register
| App | Initial implementation | Remaining work |
|---|---|---|
| Calculator | Standard/scientific parser, keyboard/touch buttons | Browser and OS tests |
| World Clock | IANA clocks, city selection, foreground one-time alarms | Browser/audio tests, persisted clocks, background alerts |
| Notes | Notes, notebooks, search, text/JSON export | Account storage, import |
| Calendar | Month navigation, dated events, JSON export | Recurrence, external calendar, account storage |
| Reminders | Task lists, deadlines, completion and overdue status | Account storage, background reminders |
| Contacts | Create/edit/delete/search, CSV export | Import and account storage |
| Mail | Draft workspace, mailto handoff, draft export | OAuth, inbox, authenticated sending |
| Gunner AI | Conversation request editor and export | Authorized AI integration and actual replies |
| Music | Local audio file selection and playback, auto-next | Account media library, playlists |
| Cinema | Local video file selection and playback | Account media library |
| Wallet | Manual USD ledger, totals and CSV export | Account storage, budget targets, optional banking |
| Journal | Dated writing, search and export | Account storage and privacy tests |
| Vault | Local AES-GCM password-based file encryption/decryption | Cryptographic round-trip and browser tests, cloud vault |
| Terminal | Allowlisted local utility commands | Authorized administrative tools, if approved |
| Voice Memos | Microphone recording, playback and download | Browser microphone tests and account storage |
| Documents | Plain-text editor, word count, export | Rich formatting, account storage, DOCX import/export |
| Spreadsheets | 25x8 formula grid, CSV and JSON export | Browser and larger formula tests, XLSX and account storage |
| Creative Studio | Local image editing, export and AI brief | Approved AI image/video providers, job billing |
| Presentations | Slide editor, themes, preview, JSON export | Account storage, import, PPTX export |

## Verification
18 arithmetic/parser checks and 8 basic ledger, CSV and spreadsheet checks passed in isolated JavaScript tests. Saved source files inspected; full browser, device, crypto, media, security, cloud and catalog tests are not complete. No production readiness claim is made. Development data is tab-local unless explicitly exported. No confidential data should be entered into standalone builds.

## Release gates
- Functional browser checks across desktop, iPad and phone.
- Corporate authorization and account isolation; separate storage permissions and audit controls as needed.
- Appropriate persistence, import/export, recovery, reconnect and error handling.
- Real provider integrations and cost controls where appropriate, not fake data or simulated AI.
- Install, launch, dock, close and uninstall without affecting existing apps or account data.
- Server-side catalog registration as optional, default uninstalled; no automatic desktop installation.
- Production deployment verification before calling an app available.

See `blackcell-os-app-suite-manifest-dev.json` for independent entry paths and status.
