# My Travel Bot

A TypeScript / React travel organizer matching the Nunito, cream, and forest-green style of My Inventory Bot and My True Wealth Bot.

## Run

Requires Node 22.13+. Use npm ci, npm run dev, npm run typecheck, npm test, and npm run build. Local development serves port 5173. Production targets Cloudflare Workers through Vinext and prepares a service worker with the complete client asset list.

## Using the app

1. Create an encrypted vault with a passphrase of at least 12 characters.
2. Create a trip and add flights, hotels, rental cars, excursions, and appointments.
3. Enter local start/end dates and each location's IANA time zone. For ambiguous daylight-saving fall-back times, the converter chooses the first resolved occurrence; check the calendar export when traveling during a clock change.
4. Enter total cost, currency, and remaining-balance deadline. Record each payment with its date and reference. Recording a payment does not transfer money.
5. Attach originals directly to a reservation. For trip-level attachments, select a trip in Documents.
6. Export the calendar and import it into a calendar app for reminders while Travel Bot is closed. Reservation alarms are two hours before start; payment alarms are one day before the due date. Re-export after edits; your calendar controls duplicate handling and alert delivery.
7. Back up before switching devices or clearing browser storage.

## Phone and offline use

Open the deployed HTTPS URL on a phone, add it to the home screen, restore a backup, and unlock with the same passphrase. The production service worker precaches application assets and its empty shell; the encrypted vault lives in IndexedDB. Load online first and test offline access before traveling. Google sign-in and Drive transfers require a connection.

The development build does not install the production service worker. Browsers may evict storage; keep an encrypted backup. Lock the vault when finished on a shared device. Encryption at rest does not protect against malware or a compromised browser while the vault is open.

## Google Drive

Integration is implemented, but requires the owner's OAuth configuration:

1. Enable Google Drive API in a Google Cloud project.
2. Configure the OAuth consent screen and authorized test users as appropriate.
3. Create a Web application OAuth client.
4. Add the exact deployed origin (and http://localhost:5173 for development) under Authorized JavaScript origins.
5. Paste the client ID in Settings and connect.

The app requests only https://www.googleapis.com/auth/drive.appdata. It stores encrypted immutable snapshots in appDataFolder, with no access to ordinary Drive documents. Tokens stay in memory and expire. There is no client secret in this web application.

Backups are manual snapshots, not automatic synchronization. Restore the newest snapshot before editing on another device, then create another backup. Existing snapshots are retained. The most recent 50 are shown. Storage uses the Google account's available quota; this is not unlimited free storage.

References: https://developers.google.com/workspace/drive/api/guides/appdata and https://developers.google.com/identity/oauth2/web/guides/use-token-model

## Import formats

- CSV requires title,start,end,zone columns. Optional: kind,endZone,location,confirmation,total,currency,due,notes,url. Dates use YYYY-MM-DDTHH:mm; due dates YYYY-MM-DD. Settings includes a template.
- ICS supports individual VEVENT entries with UTC, TZID, floating, or all-day dates. Floating dates use the device zone; all-day imports use 09:00 and require review. Recurrences are rejected rather than silently truncated.
- Pasted confirmation text is retained as notes in an editable draft; dates require manual entry.
- Any file type can be retained as an original attachment. PDFs/images are not automatically interpreted with OCR or AI. Import preview defaults must be reviewed.

Limits: 15 MB per file and 50 MB per vault. Originals for multiple reservations attach to the trip; a single reservation's originals attach directly to it. Untrusted files download rather than being embedded as executable HTML or SVG.

## Security and data model

AES-256-GCM with a fresh random 96-bit IV per save; PBKDF2-SHA-256 with 600,000 iterations and a random 128-bit salt. Passphrases and non-exportable keys are not persisted. Encryption covers reservation fields and attachments in browser storage, downloads, and Drive. There is no passphrase recovery service.

Zod validates imports, restored vaults, dates/zones, references, unique IDs, totals, and payment bounds. Saves finish before the UI reports success. Concurrent-tab writes detect stale revisions rather than overwriting them. Private Sites hosting supplies the outer access boundary; the server does not receive travel records or encryption keys.

## Validation

Tests cover partial payments, cross-zone flights, DST gaps, calendar reminders, CSV quoting, ICS imports, orphan references, encryption recovery, wrong passphrases, and tampering. TypeScript checking and the production build provide additional validation.

Browser interaction and phone offline tests were not run in this task. Google OAuth and real Drive transfers require a configured client ID and were not exercised against an account. The optional read-only WebMCP tool only reads an unlocked vault; no supported WebMCP runtime was available for integration validation.
