# Cloudflare Workers deployment

Run `npm run deploy:cloudflare` from the project root. It rebuilds the app and uploads the server together with all client assets. Use `npm run deploy:cloudflare -- --dry-run` to validate without publishing.

The generated `dist/server/wrangler.cloudflare.json` selects the authenticated entry handler and configures `ASSETS` with `run_worker_first: true`. Authentication runs before both app and static-asset requests. `--keep-vars` retains the dashboard's `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `CF_ACCESS_EMAIL` settings; Wrangler retains secrets as well. Existing Cloudflare Access policies remain managed in the dashboard.

`access-guard.mjs` is based on the bundled guard recovered from deployed Worker version a8c69607-5c24-419d-a14d-ec81e94f39a4. It verifies the RS256 signature, issuer, audience, expiry, required claims and allowed email, with a comma-separated email allowlist for collaborators, then replaces client-supplied identity headers with the verified identity. Its bundled jose v6.2.12 dependency is covered by `jose.LICENSE.md`.

Do not deploy `dist/server/index.js` or the plain generated `wrangler.json` directly: those omit this deployment's Access guard and authenticated asset routing. This deployment command targets only `my-travel-bot.aehrath.workers.dev`; it does not deploy the separate Sites-hosted app.

## Collaborator access

Keep `CF_ACCESS_EMAIL` set to your email and append each invited collaborator separated by commas. Add those exact emails to the Cloudflare Access application's **Emails** allow policy too. Both checks must permit the person. Do not use an email address in an Email domain rule. No access is granted merely by sharing a Drive file.

Google Drive sharing also needs Google Picker API enabled in the existing OAuth project's Google Cloud console. Create a browser API key restricted to Google Picker API and the app's website origins (include `https://docs.google.com/*` per Google's Picker instructions). Set `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` in `.env.local`, then rebuild/deploy. The Google Cloud project number is taken from the existing OAuth client ID. If OAuth is in testing mode, add collaborators as test users. Sharing requests `drive.file` alongside the existing hidden-backup scope; it does not request full Drive access.

Shared files stay encrypted. Invitees also need the vault passphrase, provided separately. In Settings, create or choose a shared vault, assign Read only or Can edit, then load the current version before editing and publish changes afterwards. Writes use the last loaded ETag and reject stale versions; downloads remain independent copies after access is removed.

Drive's notification email includes an app link (`/#sharedVault=FILE_ID`) and opening instructions. Google's default Open button still previews the encrypted file. Use **Copy My Travel Bot link** for existing recipients. The app link selects Settings, asks recipients to connect the invited Google account, and guides file authorization through Picker before loading the vault. Links contain only the file ID; passphrases and keys are never included.

The invitation form now uses **Create and send invitation**: Drive grants access and sends its notification email with the direct app link in the message. **Resend invitation** also submits a notified request for an existing collaborator. No desktop email handler or mailto link is used. Google controls the email layout, including its default file-preview button; the custom message directs recipients to the My Travel Bot link. Recipients sign in, approve file access if Google requires it, and unlock the invited trip.
