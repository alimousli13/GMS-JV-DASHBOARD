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
4. **Edit Apps Script code only in `apps-script/Code.gs` in this repo**, then ship it with `./deploy.sh "message"`.
5. **When adding an editable input**, add an entry to `FIELDS` (season-level, Setup/Funding tabs) or `DAILY_FIELDS` (per game day, Daily Tracker) in `Code.gs`. The Enter Data page builds its forms from the API, so no HTML/JS change is needed.
6. **Check every sheet cell address against the actual sheet** before using it (see "Sheet map" below). Addresses are hard-coded in `Code.gs`.
7. **Add any new file that must not be public to `.assetsignore`** (Cloudflare publishes everything else in the repo root).
8. **Tell the human which command to run** when you're done: `git push` for site-only changes, `./deploy.sh "message"` if `apps-script/` changed, and whether a one-time sheet update must be run from the sheet's **Kenny League** menu.
9. **Keep scoped CSS**: shared styles first in `style.css`, page/section-specific styles in their own commented `START`/`END` blocks.

### DON'T
1. **Don't hard-code dollar amounts, counts, prices, or dates in HTML/JS.** Use `—` as the placeholder and a `data-key`.
2. **Don't calculate, total, or derive numbers in JavaScript** (no summing, no multiplying price × quantity). Formatting only (currency, %, commas).
3. **Don't edit Code.gs on script.google.com.** `./deploy.sh` overwrites it with the repo version. (If someone did, run `npx @google/clasp@2.4.2 pull` first to recover it.)
4. **Don't write to formula cells from the website.** Only yellow input cells. Church rent (Setup C32:C41) is a formula; don't make it editable.
5. **Don't rename or delete existing Web-tab keys or `FIELDS`/`DAILY_FIELDS` keys** without updating every place that uses them (sheet Web tab, `index.html`, `Code.gs`).
6. **Don't put secrets in the repo.** The edit passcode lives only in Apps Script → Project Settings → Script properties (`EDIT_PASSCODE`). Never commit tokens or passwords.
7. **Don't change `config.js` URLs, `.clasp.json`, `wrangler.jsonc`, `.assetsignore`, or `deploy.sh`** unless the task is specifically about deployment.
8. **Don't add Google sign-in, databases, or other services** without asking the team. The architecture is intentionally Sheet + Apps Script + static site.
9. **Don't run destructive git commands** (`git reset --hard`, `git push --force`, deleting branches) for a teammate.

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
- **Every save is logged** in the sheet's **Edit Log** tab (time, cell, old → new).

## File map

| File | What it is | Public on the site? |
|---|---|---|
| `index.html` | Dashboard: Overview, Season P&L, Weekly Results, Setup, Schedule, Funding, Sponsors | Yes |
| `inputs.html` / `inputs.js` | Enter Data page (passcode, tabs: Game Days, Prices/Costs/Rates, Weekly Rentals, Funding) | Yes |
| `app.js` | Dashboard loader: fetch API → fill `data-key`s, render schedule; CSV fallback | Yes |
| `style.css` | All styles; CSS variables at top | Yes |
| `config.js` | `API_URL` (Apps Script `/exec`) and `SHEET_CSV_URL` (published Web tab) | Yes (URLs aren't secret; writes need the passcode) |
| `apps-script/Code.gs` | The API + one-time sheet updates + "Kenny League" sheet menu | No |
| `apps-script/appsscript.json` | Apps Script manifest (web app: execute as owner, anyone can call) | No |
| `deploy.sh` | One-command ship: clasp push → redeploy same URL → git push | No |
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
| **Web** | Export list for the site: `section, key, label, value, format` | `format` ∈ currency, number, percent, text |
| **Edit Log** | Auto-created audit trail of website saves | — |

Daily Tracker formulas depend on Schedule's column layout and exact day/location spellings. Keep them.

## Team edit workflows

**Golden rules:** `git pull` before you start · code lives in this repo · numbers live in the Sheet.

| I want to… | Where | Then run |
|---|---|---|
| Enter game-day numbers, prices, costs, funding | Site → **Enter Data** (passcode) | nothing (live) |
| Fix a formula / add a calculation | Google Sheet | nothing (live) |
| Show a new number on the dashboard | Sheet **Web** tab row (key + formula + format), then `<span data-key="key">—</span>` in `index.html` | `git push` |
| Change layout, text, styling | `index.html`, `style.css` | `git push` |
| Make a new input editable on Enter Data | `apps-script/Code.gs` (`FIELDS` / `DAILY_FIELDS`) | `./deploy.sh "msg"` |
| Change how loading/saving works | `apps-script/Code.gs`, `app.js`, `inputs.js` | `./deploy.sh "msg"` |
| Run a one-time sheet update | Sheet → **Kenny League** menu | — |

Commands:
```bash
git pull                                              # always first
git add . && git commit -m "what changed" && git push # site-only changes
./deploy.sh "what changed"                            # anything in apps-script/ (also pushes the site)
```

## Setup

**Every teammate:** follow `TEAM-SETUP.txt`: accept the GitHub collaborator invite → clone in Cursor (sign in to GitHub) → if git asks for a password, use a **classic** token with the `repo` scope. Fine-grained tokens don't work for repos you're a collaborator on (repo owner can use either).

**Only if you'll change Apps Script:** get edit access to the Google Sheet → install Node.js → turn on the Apps Script API at https://script.google.com/home/usersettings → `npx @google/clasp@2.4.2 login`.

**Run locally:** `python3 -m http.server 8000`, open http://localhost:8000.

## Troubleshooting

- **Push rejected ("fetch first"):** `git pull`, then push again.
- **Merge conflict:** open the file, keep the right lines, delete the `<<<<<<<` / `=======` / `>>>>>>>` markers, then `git add . && git commit -m "Merge" && git push`.
- **Site shows old content:** hard refresh (Cmd + Shift + R); check Cloudflare → Workers & Pages → gms-jv-dashboard → Deployments.
- **Numbers show "—" / banner "Live data unavailable":** open the `API_URL` in a browser; it should start with `{"ok":true`. If not, check Apps Script → Executions for errors.
- **Schedule box shows a message:** it says why (API not responding, or Apps Script needs redeploying via `./deploy.sh`).
- **Enter Data says "Wrong passcode":** the passcode is in Apps Script → Project Settings → Script properties → `EDIT_PASSCODE`.
