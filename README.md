# Kenny League — Season Dashboard

Client dashboard for the Gainesville JV Basketball League ("Kenny League"), built by our REM consulting team.

- **Live site:** https://gms-jv-dashboard.alimousli13.workers.dev (hosted on Cloudflare; every push to `main` redeploys it)
- **Owner data entry:** `/inputs.html` (the "Enter Data" button), protected by a passcode
- **Source of truth for all numbers and math:** the Google Sheet "Kenny League — Season Profit & Loss Tracker"

---

## Rules for AI assistants (Claude, Cursor, ChatGPT, etc.)

If you are an AI helping a teammate edit this repo, these rules are binding. If a request would break one, say so and propose the compliant alternative instead.

### DO
1. **Keep all math in the Google Sheet.** The website only *displays* values the sheet already calculated, and *writes inputs* into yellow input cells. If a new number is needed, add a formula in the sheet plus a row in the sheet's **Web** tab, then display it by key.
2. **Display numbers with `data-key` spans**, e.g. `<span class="num placeholder" data-key="season_net">—</span>`. `app.js` fills every `[data-key]` element automatically from the API. Add `data-signed` for values that should turn green/red.
3. **Keep it plain HTML, CSS, and vanilla JavaScript.** No frameworks, no npm packages in the site, no build step, no CDNs. Files are served exactly as they are in the repo.
4. **Edit Apps Script code only in `apps-script/Code.gs` in this repo**, on a branch. After it's merged to `main`, ship it with `./deploy.sh "message"` from an up-to-date `main` (see "Apps Script changes").
5. **When adding an editable input**, add an entry to `FIELDS` (season-level, Setup/Funding tabs) or `DAILY_FIELDS` (per game day, Daily Tracker) in `Code.gs`. The Enter Data page builds its forms from the API, so no HTML/JS change is needed.
6. **Check every sheet cell address against the actual sheet** before using it (see "Sheet map" below). Addresses are hard-coded in `Code.gs`.
7. **Add any new file that must not be public to `.assetsignore`** (Cloudflare publishes everything else in the repo root).
8. **Tell the human what to do next** when you're done: push the branch and open a pull request; if `apps-script/` changed, remind them it only goes live after merge + `./deploy.sh` from `main`; and say whether a one-time sheet update must be run from the sheet's **Kenny League** menu.
9. **Put each new feature in its own files.** A new section gets its own `name.js` and `name.css` (e.g. `sponsors.js`, `sponsors.css`), loaded with one `<script src>` / `<link>` line in `index.html`. Shared files (`index.html`, `app.js`, `style.css`) only get the section's HTML and that one include line. This keeps teammates from editing the same lines and avoids merge conflicts.
10. **Shared CSS stays in `style.css`** (variables, cards, tables, buttons). Feature CSS uses a class prefix matching its feature (e.g. `.sponsor-…` or `#sponsors …`) so styles don't collide.
11. **Every new `data-key` needs a matching row in the sheet's Web tab** (key, formula, format), and the PR description must list it. Otherwise the number shows "—".

### DON'T
1. **Don't hard-code dollar amounts, counts, prices, or dates in HTML/JS.** Use `—` as the placeholder and a `data-key`.
2. **Don't calculate, total, or derive numbers in JavaScript** (no summing, no multiplying price × quantity). Formatting only (currency, %, commas).
3. **Don't edit Code.gs on script.google.com, and don't upload it through github.com.** Change it in this repo on a branch, merge to `main`, then deploy from an up-to-date `main` with `./deploy.sh`. Deploying replaces the live Apps Script with that computer's copy. (If someone edited it online, run `npx @google/clasp@2.4.2 pull` first to recover it.)
4. **Don't write to formula cells from the website.** Only yellow input cells. Church rent (Setup C32:C41) is a formula; don't make it editable.
5. **Don't rename or delete existing Web-tab keys or `FIELDS`/`DAILY_FIELDS` keys** without updating every place that uses them (sheet Web tab, `index.html`, `Code.gs`).
6. **Don't put secrets in the repo.** The edit passcode lives only in Apps Script → Project Settings → Script properties (`EDIT_PASSCODE`). Never commit tokens or passwords.
7. **Don't change `config.js` URLs, `.clasp.json`, `wrangler.jsonc`, `.assetsignore`, or `deploy.sh`** unless the task is specifically about deployment.
8. **Don't add Google sign-in, databases, or other services** without asking the team. The architecture is intentionally Sheet + Apps Script + static site.
9. **Don't run destructive git commands** (`git reset --hard`, `git push --force`, deleting branches) for a teammate.
10. **Don't add feature code to the bottom of `app.js` or `style.css`.** Create the feature's own files instead (see DO #9).
11. **Don't commit straight to `main`.** Work on a branch (`git checkout -b feature-name`), open a pull request, and let Ali merge it. Merging to `main` puts it live for the client.

---

## How it works

```
Google Sheet (all formulas)  ──►  Apps Script web app (apps-script/Code.gs)
        ▲                               │  GET  → JSON: Web-tab outputs + current inputs + schedule
        │  POST (passcode) writes       │  POST → writes inputs, logs to "Edit Log" tab, returns fresh JSON
        │  yellow input cells           ▼
        └──────────────  Static site on Cloudflare (index.html, inputs.html)
```

- **Reading:** `app.js` calls the Apps Script URL (`API_URL` in `config.js`) and fills `[data-key]` elements. If that fails it falls back to the published CSV of the Web tab (`SHEET_CSV_URL`), which can lag ~5 minutes and has no schedule.
- **Writing:** `inputs.js` sends only changed fields + passcode. Apps Script validates everything (numbers, whole numbers, no negatives, percents 0–100) and writes nothing if any field is invalid.
- **Sponsors:** `sponsors.js` sends `action: sponsors_list` / `sponsors_save` (with the passcode) to the same Apps Script URL. Sponsor contact details are only returned to passcode holders, never in the public GET. Only columns A–C and F–H of **Sponsor Pipeline** are written; money columns D–E are never touched.
- **Every save is logged** in the sheet's **Edit Log** tab (time, cell, old → new).

## File map

| File | What it is | Public on the site? |
|---|---|---|
| `index.html` | Dashboard: Overview, Season P&L, Weekly Results, Setup, Schedule, Funding, Sponsors | Yes |
| `inputs.html` / `inputs.js` | Enter Data page (passcode, tabs: Game Days, Prices/Costs/Rates, Weekly Rentals, Funding) | Yes |
| `app.js` | Dashboard loader: fetch API → fill `data-key`s, render schedule; CSV fallback | Yes |
| `style.css` | All styles; CSS variables at top | Yes |
| `sponsors.js` / `sponsors.css` | Sponsors section: passcode-locked sponsor CRM (owner: Brianna) | Yes |
| `<feature>.js` / `<feature>.css` | One pair per new feature section | Yes |
| `assets/` | Files linked from the site (e.g. the sponsorship package PDF) | Yes |
| `.github/pull_request_template.md` | Checklist shown on every pull request | No |
| `config.js` | `API_URL` (Apps Script `/exec`) and `SHEET_CSV_URL` (published Web tab) | Yes (URLs aren't secret; writes need the passcode) |
| `apps-script/Code.gs` | The API + one-time sheet updates + "Kenny League" sheet menu | No |
| `apps-script/appsscript.json` | Apps Script manifest (web app: execute as owner, anyone can call) | No |
| `deploy.sh` | One-command ship: safety check (must be on an up-to-date `main`) → clasp push → redeploy same URL → git push | No |
| `.clasp.json` | Links `apps-script/` to the sheet's Apps Script project | No |
| `wrangler.jsonc`, `.assetsignore` | Cloudflare config; `.assetsignore` lists files kept off the website | No |

## Sheet map (cell addresses used in Code.gs)

| Tab | What | Key cells |
|---|---|---|
| **Season** | Season P&L summary (formulas only) | B6 net income, B17–B24 revenue, B28–B39 costs, A44:H53 weekly |
| **Setup** | Season inputs (yellow) | B5 teams, B6 fee, B7 sponsor portion, B11–B13 refs/scorekeeper, B14–B15 admission, B16–B18 prices, B19–B21 unit costs, B22–B23 card fees, B24–B26 insurance/overhead, B27 concession card share, B32:B41 court rent/week (input), **C32:C41 church rent (formula)**, D32:D41 other fixed/week, B51 church $/hour, B52 church hours per game |
| **Daily Tracker** | One column per game day, **C–V = days 1–20** (W1 Tue … W5 Fri) | Inputs: row 10 completed, 16 cash adm, 19 card adm, 24/27/30 Gatorade L/S + Skittles sold, 34 other revenue, 48 scorekeeper hrs, 51–52 other staff hrs/rate, 54–55 supplies qty/cost, 57 other expenses, 59 card txns. Formulas: 5 label, 9 date, 11 games, 35 revenue, 71 cost, 72 net |
| **Funding** | Running totals (yellow) | B8 sponsor payments, B9 player payments, B15 extra sponsorship, B16 other funding, B19 insurance refund |
| **Schedule** | One row per game | A week, B day (full name, e.g. "Tuesday"), C time, D court, E location ("Alachua Sports Complex" / "Abundant Grace Church"), F team 1, G team 2, H matchup, I date |
| **Sponsor Pipeline** | Sponsor CRM (header row must read exactly A–H as listed) | A Business / Sponsor, B Contact, C Email / Phone, D Pledged $, E Received $, F Stage, G Next Follow-up, H Notes. Website edits A–C and F–H only |
| **Web** | Export list for the site: `section, key, label, value, format` | `format` ∈ currency, number, percent, text |
| **Edit Log** | Auto-created audit trail of website saves | — |

Daily Tracker formulas depend on Schedule's column layout and exact day/location spellings. Keep them.

## Team edit workflows

**Golden rules:** `git pull` before you start · one branch per feature · each feature in its own files · numbers live in the Sheet · Ali merges to `main` (merging = live for the client).

### Website changes (everyone)
```bash
git checkout main && git pull                 # 1. start from the latest main
git checkout -b my-feature                    # 2. your own branch
# 3. edit your feature's own files (e.g. sponsors.js / sponsors.css)
git pull origin main                          # 4. catch up right before the PR
git add . && git commit -m "what changed" && git push -u origin my-feature   # 5. push the branch
```
6. On GitHub click **Compare & pull request**, fill in the checklist, and paste your branch's **Cloudflare preview link**.
7. Ali reviews and merges. The live site updates about a minute later.

### Apps Script changes (Ali and Brianna only)
Anything in `apps-script/`: new editable fields, sponsor saving, sheet menu items.
1. Make the change in `apps-script/Code.gs` **in this repo, on a branch**, using the same steps as website changes. **Never** edit it on script.google.com and never upload it through github.com.
2. Open a pull request and **say in it that it needs an Apps Script deploy**.
3. After it's merged, **one person** deploys from an up-to-date `main`:
   ```bash
   git checkout main && git pull --no-edit
   ./deploy.sh "what changed"
   ```
4. Post "deployed" in the group chat so the other person knows.

`deploy.sh` replaces the live Apps Script with **your computer's copy**. That's why it refuses to run from a branch or from a copy that's behind GitHub. If it stops you, run the command it prints, then try again.

If a change also needs a one-time sheet update (like the schedule import), run it from the sheet's **Kenny League** menu after deploying.

### Which one do I need?
| I want to… | Where | How it goes live |
|---|---|---|
| Enter game-day numbers, prices, costs, funding | Site → **Enter Data** (passcode) | Instantly |
| Fix a formula / add a calculation | Google Sheet | Instantly |
| Show a new number on the dashboard | Sheet **Web** tab row (key + formula + format), then `<span data-key="key">—</span>` in your section | Branch → PR → merge |
| Change layout, text, styling | Your feature's files (or `index.html` for the section HTML) | Branch → PR → merge |
| Make a new input editable on Enter Data | `apps-script/Code.gs` (`FIELDS` / `DAILY_FIELDS`) | Branch → PR → merge → `./deploy.sh` |
| Change how loading/saving works (incl. sponsors) | `apps-script/Code.gs` + `app.js` / `inputs.js` / `sponsors.js` | Branch → PR → merge → `./deploy.sh` |
| Run a one-time sheet update | Sheet → **Kenny League** menu | Instantly |

## Setup

**Every teammate:** follow `TEAM-SETUP.txt`: accept the GitHub collaborator invite → clone in Cursor (sign in to GitHub) → if git asks for a password, use a **classic** token with the `repo` scope. Fine-grained tokens don't work for repos you're a collaborator on (the repo owner can use either).

**Apps Script people (Ali, Brianna), one time per computer:**
1. Make sure you have **edit access** to the Google Sheet.
2. Install **Node.js**: https://nodejs.org (LTS installer), or `conda install -c conda-forge nodejs -y` if you use Anaconda. Check with `node -v`.
3. Turn on the **Google Apps Script API**: https://script.google.com/home/usersettings
4. Log in: `npx @google/clasp@2.4.2 login` (pick the Google account that has access to the sheet, click Allow).
5. Test: `./deploy.sh "test deploy"` from an up-to-date `main`. You should see `✓ Done`.

**Run locally:** `python3 -m http.server 8000`, open http://localhost:8000.

## Troubleshooting

- **Push rejected ("fetch first"):** `git pull origin main`, then push again. Never `git push --force`.
- **`deploy.sh` says "You're on branch…" or "GitHub has changes you don't have yet":** run the command it prints, then deploy again.
- **`deploy.sh` says "User has not enabled the Apps Script API":** turn it on at https://script.google.com/home/usersettings, wait 2 minutes, retry.
- **Sponsor tracker won't unlock:** it uses the same passcode as Enter Data. If it says "Unknown action", the latest Apps Script hasn't been deployed: run `./deploy.sh` from `main`.
- **Merge conflict:** open the file, keep the right lines, delete the `<<<<<<<` / `=======` / `>>>>>>>` markers, then `git add . && git commit -m "Merge" && git push`.
- **Site shows old content:** hard refresh (Cmd + Shift + R); check Cloudflare → Workers & Pages → gms-jv-dashboard → Deployments.
- **Numbers show "—" / banner "Live data unavailable":** open the `API_URL` in a browser; it should start with `{"ok":true`. If not, check Apps Script → Executions for errors.
- **Schedule box shows a message:** it says why (API not responding, or Apps Script needs redeploying via `./deploy.sh`).
- **Enter Data says "Wrong passcode":** the passcode is in Apps Script → Project Settings → Script properties → `EDIT_PASSCODE`.
