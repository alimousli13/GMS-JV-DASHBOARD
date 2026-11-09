# Kenny League — Season Dashboard

Client dashboard for the Gainesville JV Basketball League (“Kenny League”). It replaces the Google Sheets P&L tracker as the viewing layer for season finance, schedule, funding, and team workstreams.

The Google Sheet does all calculations. This site never totals or derives numbers; it only displays values the sheet already computed.

## Open locally

1. Double-click `index.html`, or open that file in a browser.
2. Without a published CSV URL, every figure stays as “—” and a banner explains that live data is unavailable.

To load live sheet values, browsers often block `fetch` from `file://`. If that happens, serve the folder over HTTP, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Connect the Google Sheet

1. Publish the Web tab as CSV.
2. Paste the URL in `config.js`:

```js
const SHEET_CSV_URL = "PASTE_URL_HERE";
```

Replace `PASTE_URL_HERE` with the published CSV link. Expected columns: `section`, `key`, `label`, `value`, `format` (`currency`, `number`, `percent`, or `text`).

## How to contribute

Edit only your fenced HTML/CSS section so teammates are not blocked.

```bash
git pull
```

Change markup between your `<!-- ===== START: … ===== -->` and `<!-- ===== END: … ===== -->` comments in `index.html`, and only your fenced block in `style.css` (for example `.ws-finance-*` or `.ws-ops-*`).

```bash
git add index.html style.css
git commit -m "Update finance workstream section"
git push
```

Do not change `app.js` unless you are maintaining the shared loader.

## Adding live numbers

To add a number, add a row to the Web tab in the Google Sheet with your workstream prefix (e.g. `ops_`), then add `<span data-key="ops_yourkey">—</span>` in your section. No JS changes needed.

## Owner data entry (Enter Data page)

`inputs.html` lets the owner edit every input — daily quantities and hours, prices, unit costs, rates, weekly rentals and funding totals. Saves go straight into the Google Sheet through a small Apps Script web app; the sheet recalculates and the dashboard shows the new numbers. Every save is logged in the sheet's **Edit Log** tab.

One-time setup (full steps at the top of `apps-script/Code.gs`):

1. Google Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
2. Project Settings → Script properties → add `EDIT_PASSCODE`.
3. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**.
4. Paste the `/exec` URL into `config.js` as `API_URL`.

The passcode lives only in Apps Script — never commit it to this repo.

To make another cell editable: add it to `FIELDS` (season-level) or `DAILY_FIELDS` (per game day) in `Code.gs`, paste the updated file into Apps Script, then Deploy → Manage deployments → Edit → New version. The page builds its form from the API, so no HTML/JS changes are needed.
