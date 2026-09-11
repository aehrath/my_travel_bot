# My Travel Bot

A TypeScript / React travel organizer matching the Nunito, cream, and forest-green style of My Inventory Bot and My True Wealth Bot.

## Run

Requires Node 22.13+. Use npm ci, npm run dev, npm run typecheck, npm test, and npm run build. Local development serves port 7777. Production targets Cloudflare Workers through Vinext and prepares a service worker with the complete client asset list.

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

The app requests only https://www.googleapis.com/auth/drive.appdata. It stores encrypted immutable snapshots in appDataFolder, with no access to ordinary Drive documents. Tokens stay in memory and expire. There is no client secret in this web application.

Backups are manual snapshots, not automatic synchronization. Restore the newest snapshot before editing on another device, then create another backup. Existing snapshots are retained. The most recent 50 are shown. Storage uses the Google account's available quota; this is not unlimited free storage.

References: https://developers.google.com/workspace/drive/api/guides/appdata and https://developers.google.com/identity/oauth2/web/guides/use-token-model

## Import formats

- CSV requires title,start,end,zone columns. Optional: kind,endZone,airline,flightNumber,fromAirport,toAirport,location,confirmation,total,currency,due,notes,url. Dates use YYYY-MM-DDTHH:mm; due dates YYYY-MM-DD. Settings includes a template.
- ICS supports individual VEVENT entries with UTC, TZID, floating, or all-day dates. Floating dates use the device zone; all-day imports use 09:00 and require review. Recurrences are rejected rather than silently truncated.
- Pasted flight confirmations with DEPARTS/ARRIVES, two airport codes, and two English day-month-year dates are parsed locally into a reviewable flight draft, including local times, time zones, airline/flight number, and booking reference. Both dates are preserved, including date-line crossings. Incomplete recognized flight layouts raise an error instead of guessing today. Other text becomes a manual draft with today’s date. Original pasted text remains in notes.
- Any file type can be retained as an original attachment. PDFs/images are not automatically interpreted with OCR or AI. Import preview defaults must be reviewed.

Limits: 15 MB per file and 50 MB per vault. Originals for multiple reservations attach to the trip; a single reservation's originals attach directly to it. Untrusted files download rather than being embedded as executable HTML or SVG.

## Security and data model

AES-256-GCM with a fresh random 96-bit IV per save; PBKDF2-SHA-256 with 600,000 iterations and a random 128-bit salt. Passphrases and non-exportable keys are not persisted. Encryption covers reservation fields and attachments in browser storage, downloads, and Drive. There is no passphrase recovery service.

Zod validates imports, restored vaults, dates/zones, references, unique IDs, totals, and payment bounds. Saves finish before the UI reports success. Concurrent-tab writes detect stale revisions rather than overwriting them. Private Sites hosting supplies the outer access boundary; the server does not receive the vault or encryption keys. Optional flight lookup sends only the chosen route and departure date to the server, and the airport codes to Aviationstack.

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
