## What changed
<!-- One or two sentences. Which section of the dashboard? -->

## Checklist (tick every box before asking for a merge)
- [ ] I started this branch from the latest `main` and ran `git pull origin main` right before opening this PR
- [ ] My feature lives in its **own files** (e.g. `sponsors.js`, `sponsors.css`); shared files only got the section HTML and one `<script>` / `<link>` line
- [ ] **No hard-coded numbers** in HTML/JS, and **no math** in JavaScript (formatting only)
- [ ] Every new `data-key` has a matching row in the Google Sheet's **Web** tab (key, formula, format)
- [ ] I did **not** edit `config.js`, `deploy.sh`, `.clasp.json` or `wrangler.jsonc`
- [ ] If I changed `apps-script/` (Ali/Brianna only): I wrote **"needs Apps Script deploy"** below, and I did **not** also edit it on script.google.com
- [ ] No private info (sponsor contacts, emails, phone numbers, passcodes) is shown on the page or committed
- [ ] I opened the **Cloudflare preview link** for this branch and the page works on desktop and phone

## Preview link
<!-- Paste the Cloudflare preview URL for this branch -->

## Needs Apps Script deploy?
<!-- yes / no. If yes, after merge: git checkout main && git pull --no-edit && ./deploy.sh "..." -->

## New Web-tab keys (if any)
<!-- key → what it means → which sheet cells the formula uses -->
