# My Travel Bot

A TypeScript / React travel organizer matching the Nunito, cream, and forest-green style of My Inventory Bot and My True Wealth Bot.

## Run

Requires Node 22.13+. The project pins Node 22.23.2 in `.nvmrc`. Before running commands, select it with nvm:

```sh
nvm install
nvm use
npm ci
npm run dev
```

For an IDE run configuration, select Node 22.23.2 as the Node interpreter as well. An error about `node:util` missing `styleText` means the command is using an older Node version; check `node --version` in the terminal or the interpreter in the IDE.

Use npm run typecheck, npm test, and npm run build for validation. Local development serves port 7777. Production targets Cloudflare Workers through Vinext and prepares a service worker with the complete client asset list.

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
4. Add the exact deployed origin (and http://localhost:7777 for development) under Authorized JavaScript origins.
5. Configure NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID in the app build environment and rebuild. For local development, set it in .env.local and restart the server. Travelers only use Connect Google Drive; no client ID field is shown in Settings.

The app requests `drive.file` for files created or explicitly selected with Google Picker, and `drive.appdata` to restore older snapshots. New backups, shared vaults, trip files, invitation indexes, and private sharing settings are created inside one **My Travel Bot** folder. Existing owned shared files are moved there when listed or opened. Legacy hidden app-data snapshots remain available for recovery. The parent folder itself is not shared, so each file keeps its own permissions. Access tokens are retained in sessionStorage for the current browser tab until Google’s reported expiry, so refreshes reuse valid authorization. Locking the vault does not revoke Google consent. Disconnect clears the local token without revoking the account-wide grant. Renewal remains a Google user-initiated authorization flow; there is no client secret in the browser.

For shared-file recipients, enable **Google Picker API** in the same project, create a browser API key restricted to your app origins and the Picker API, and set `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` before rebuilding.

### Trip sharing and invitations

Choose the owner’s shared vault and enter the recipient’s Google email. Sharing follows the per-trip View/Edit selections directly; there is no whole-vault mode or backup prompt. Current local edits are used when sending an invitation. Each selected trip has View and Edit buttons; leave both off to exclude the trip and its reservations, payments, and attachments. Selected-trip sharing removes that person's direct whole-vault grant. Broader group/domain/public grants must be removed first. Turn all trip permissions off for an existing recipient to remove their access.

Each shared trip has one encrypted file with its own Google Drive ACL. A private recipient index contains only the selected file IDs; the owner's private catalog reconnects to the same files on other computers. The recipient opens the emailed app link, authorizes the invited files when Google requires it, and unlocks using the passphrase supplied separately. Mixed collections allow edits only to trips with Edit permission.

Changes persist automatically on this device; Save to Google Drive publishes them. Conditional ETags prevent stale shared-file writes. A Drive conflict leaves local work intact and reports that sync needs attention. Local writes atomically retain the ten previous encrypted revisions and compare both revision time and ciphertext to reject stale tabs.

Importing a saved file is additive: existing local trips, reservations, payments, and attachments take precedence, and missing items are added. Live shared updates use the previous loaded version to apply remote edits only to records unchanged locally. Explicit encrypted trip deletion records override older copies on every merge and remove that trip’s reservations and documents. Absence of a trip from an older copy is never interpreted as deletion. Settings has no recovery section or replace-vault action. Opening a shared vault with a different encryption key while local trips exist is blocked rather than replacing them; use a separate browser profile for that vault. Cloud copying requires a valid Google session and network; failed uploads remain saved locally. Previously lost data can only be recovered if an earlier copy still exists.

**Invitation email setup:** Enable **Gmail API** in the same Google Cloud project as the OAuth client. Under Google Auth Platform → Data Access, configure `https://www.googleapis.com/auth/gmail.send`; use appropriate test users while the OAuth app is in testing. The Create and send invitation button requests permission to send from the connected Gmail account, then sends a single message containing the app link. No inbox-reading permission is requested. Success requires Gmail to return a sent-message ID; an API error is shown instead of reporting success. Sending acceptance does not prove inbox delivery. This implementation has mocked API coverage; live sending still requires the project setup and consent.

Google references: [Gmail setup](https://developers.google.com/workspace/gmail/api/quickstart/js), [sending messages](https://developers.google.com/workspace/gmail/api/guides/sending).

Every committed edit persists locally, including across app restarts. **Save to Google Drive** explicitly uploads the current draft and publishes editable shared-trip changes. Connecting, reopening, and editing do not upload drafts. The saved revision checkpoint persists locally; failed saves and edits made during an upload remain marked as local changes. Drive conflicts never replace local data; the save status reports failures. Existing saved versions are retained for recovery. Storage uses the Google account's available quota; this is not unlimited free storage.

References: https://developers.google.com/workspace/drive/api/guides/appdata and https://developers.google.com/identity/oauth2/web/guides/use-token-model

## Import formats

- CSV requires title,start,end,zone columns. Optional: kind,endZone,airline,flightNumber,fromAirport,toAirport,location,confirmation,total,currency,due,notes,url. Dates use YYYY-MM-DDTHH:mm; due dates YYYY-MM-DD. Settings includes a template.
- ICS supports individual VEVENT entries with UTC, TZID, floating, or all-day dates. Floating dates use the device zone; all-day imports use 09:00 and require review. Recurrences are rejected rather than silently truncated.
- Pasted flight confirmations with DEPARTS/ARRIVES, two airport codes, and two English day-month-year dates are parsed locally into a reviewable flight draft, including local times, time zones, airline/flight number, and booking reference. Both dates are preserved, including date-line crossings. Incomplete recognized flight layouts raise an error instead of guessing today. Other text becomes a manual draft with today’s date. Original pasted text remains in notes.
- Any file type can be retained as an original attachment. PDFs/images are not automatically interpreted with OCR or AI. Import preview defaults must be reviewed.

Limits: 15 MB per file and 50 MB per vault. Originals for multiple reservations attach to the trip; a single reservation's originals attach directly to it. PDFs and common images can be viewed inside the app. Preview types are checked against file signatures; HTML, SVG, and other formats remain download-only. Previews stay on this device.

## Security and data model

AES-256-GCM with a fresh random 96-bit IV per save; PBKDF2-SHA-256 with 600,000 iterations and a random 128-bit salt. Passphrases are never persisted. The optional Keep this vault unlocked setting stores a non-exportable CryptoKey in IndexedDB on this device; Lock vault removes it. Encryption covers reservation fields and attachments in browser storage, downloads, and Drive. There is no passphrase recovery service.

Zod validates imports, restored vaults, dates/zones, references, unique IDs, totals, and payment bounds. Saves finish before the UI reports success. Concurrent-tab writes detect stale revisions rather than overwriting them. Cloudflare Access supplies the deployed outer access boundary; the server does not receive the vault or encryption keys. Optional flight lookup sends only the chosen route and departure date to the server, and the airport codes to Aviationstack.

## Validation

Tests cover partial payments, cross-zone flights, DST gaps, calendar reminders, CSV quoting, ICS imports, orphan references, encryption recovery, wrong passphrases, and tampering. TypeScript checking and the production build provide additional validation.

Browser interaction and phone offline tests were not run in this task. Google OAuth and real Drive transfers require a configured client ID and were not exercised against an account. The optional read-only WebMCP tool only reads an unlocked vault; no supported WebMCP runtime was available for integration validation.

Flight reservations include From and To airport autocomplete (also available during import review). The offline directory contains 7,917 IATA-coded airports from https://github.com/mwgg/Airports, downloaded 2026-09-10 under the MIT license (lib/airports.LICENSE). Search accepts IATA/ICAO codes, airport names, and cities; selection fills the corresponding time zone. Manual airport entries are retained. Older backups default the new fields to empty strings. CSV accepts optional fromAirport and toAirport columns.

## Optional current-flight lookup

Airline autocomplete is an offline list of common carriers; search by name or IATA code, or enter an unlisted airline manually. Airline and flightNumber fields are encrypted with the reservation, included in calendar descriptions, and accepted in CSV imports. Older backups receive empty defaults. Confirmation references remain separate.

Aviationstack offers a free personal-use plan with 100 requests/month as checked September 11, 2026: https://aviationstack.com/pricing/. The app only calls its current-flights endpoint over HTTPS, with no paid or historical/future fallback. This does not provide future reservation schedules or automatic delay monitoring. Coverage may omit flights; use ticket confirmations for advance travel planning. Provider plans and overage policies can change; choose the Free plan and check account billing/quota settings before enabling.

1. Obtain a Free API key from https://aviationstack.com/signup/free (not a Google OAuth ID).
2. For the local production server, create `.dev.vars` in the project root containing `AVIATIONSTACK_API_KEY=your_key`. This file is ignored by Git. Restart the server on port 7777. For Vite development, the Cloudflare plugin also reads `.dev.vars`.
3. For hosted use, configure `AVIATIONSTACK_API_KEY` as a server-side Worker secret through the hosting platform before deploying. Never use a `NEXT_PUBLIC_` prefix or put the key into the browser.
4. Select airports and today's departure date in the departure airport's time zone, then choose **Find current flights**. Review a matching result to fill scheduled local departure/arrival times, time zones, airline, and flight number. Arrival dates across midnight and the date line are preserved. Existing payments and booking references are not modified.

One explicit lookup makes one provider request (up to 100 results); no polling, automatic retries, or pagination. Results are filtered by the exact route and departure local date, deduplicated, then ranked by proximity to the entered time. Incomplete timestamps are excluded; cancelled/diverted/incident results cannot populate a reservation. API keys remain server-side. Lookup requires same-origin requests and platform identity when hosted; the local loopback preview is allowed. The app does not enforce a durable account-wide monthly quota; the provider account controls usage. Real API responses require a configured account and have not been tested here.

Delta Markdown flight tables are also supported: flight numbers such as DELTA 92, city names, and compact dates such as Fri, 15JAN. Missing years use the next upcoming occurrence and must match the stated weekday. City-to-airport and arrival-date inferences are shown prominently in import review and saved in the notes. Ambiguous cities require an airport code. Review every inference before saving; the original confirmation is retained.

Hotel confirmations with Property, Arrival Date, Departure Date, Total Cost, and currency are parsed from tables or plain text. Stay nights and balance arithmetic are checked. Missing check-in/out times use explicitly flagged 15:00/11:00 placeholders; property time zone is inferred only when a country maps to one zone. Payments/Invoiced amounts are proposed payments in review and require an actual payment date or removal before saving. No payment deadline is invented. Original confirmation text remains in notes.

Remaining balance deadlines can use a specific date or a whole number of days before check-in (or the reservation start for other types). Relative deadlines follow changes to the start date, appear as calculated dates in Payments and calendar exports, and remain relative in encrypted backups. Zero days means the check-in date.

Shuttle confirmations with Depart/Arrive dates and times, Starts, and Address import as Shuttle reservations. Both booking references and the original text are preserved. A pickup country with one time zone supplies a flagged time-zone inference; otherwise the time zones must be entered in review. Costs and payment deadlines are not inferred from this layout.

## Update the Cloudflare Workers app

From this project directory:

```sh
nvm use
npm run deploy:cloudflare
```

This builds and uploads the current local code and assets to `my-travel-bot.aehrath.workers.dev`, preserving the Cloudflare Access login checks and dashboard variables. If your Cloudflare login has expired, run `npx wrangler login` first. Git commits or pushes are not required for this direct deployment.

To check the deployment without publishing, use `npm run deploy:cloudflare -- --dry-run`. Avoid deploying the generated server entry directly, since it omits this app's custom Access handler. See `cloudflare/README.md` for the deployment details.

A private live vault file supplies the latest encrypted version and its ETag. Connected edits check that version; Save to Google Drive checks again and publishes conditionally. A three-way merge accepts remote changes to unchanged local records, retains independent local changes, and blocks overlapping record edits. Failed checks keep local drafts. The encrypted last-read base is retained locally. Simultaneous first-time creation of duplicate live files is detected and blocks saving rather than selecting an arbitrary file.

Drive performance: the private live file is now a small encrypted index linking immutable encrypted trip files (trip details plus reservations) and separate encrypted attachment files, all in the same My Travel Bot folder. Owner saves upload only changed parts and then replace the index with an If-Match ETag guard. A failed part upload or index conflict does not publish partial data; local changes and the prior Drive index remain available. Old part versions are retained, so storage grows with changed versions. Shared-trip publication still runs separately using its existing permissions and format.

Existing full-vault files remain readable and convert automatically on the next owner save. The first conversion uploads all parts; a new device downloads all parts on its first load. Later loads reuse validated encrypted parts from IndexedDB and fetch only new references. The index includes encrypted content hashes, record ordering, and deleted-trip markers. Missing or invalid parts fail the whole read rather than silently importing an incomplete vault. Local vault storage and exported backups remain self-contained.

The favicon and home-screen icons are derived from public/robot.svg, matching the robot shown within the app.
