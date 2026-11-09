/**
 * Kenny League — Dashboard API (Google Apps Script, bound to the league Google Sheet)
 *
 * GET  → every dashboard number (from the "Web" tab) + the current value of every
 *        editable input, as JSON.
 * POST → writes edited inputs into the sheet (passcode required), lets the sheet
 *        recalculate, logs the edit, and returns the fresh numbers.
 * The sheet's formulas remain the ONLY place any math happens.
 *
 * ONE-TIME SETUP
 *   1. Google Sheet → Extensions → Apps Script. Replace Code.gs with this whole file. Save.
 *   2. Project Settings (gear icon) → Script properties → Add property:
 *        EDIT_PASSCODE = <a passcode you give the owner>
 *   3. Deploy → New deployment → gear → Web app.
 *        Execute as: Me    Who has access: Anyone    → Deploy → Authorize.
 *   4. Copy the Web app URL (ends in /exec) into config.js as API_URL.
 *
 * AFTER CHANGING THIS FILE: Deploy → Manage deployments → pencil → Version: New version
 * → Deploy. (Keeps the same URL.)
 */

var SHEET = { setup: 'Setup', daily: 'Daily Tracker', funding: 'Funding', web: 'Web', log: 'Edit Log' };

/* ---------- Season-level inputs ----------
   type: money | int | number | percent (stored as a fraction, entered as %) | date
   panel: which tab of the Enter Data page shows it
   Hints come from column D of the same row in the sheet. */
var FIELDS = [
  { key: 'setup_teams',             sheet: 'Setup',   cell: 'B5',  type: 'int',     panel: 'prices',  group: 'League & team fees',   label: 'Teams signed up' },
  { key: 'setup_fee_per_team',      sheet: 'Setup',   cell: 'B6',  type: 'money',   panel: 'prices',  group: 'League & team fees',   label: 'Fee per team' },
  { key: 'setup_sponsor_portion',   sheet: 'Setup',   cell: 'B7',  type: 'money',   panel: 'prices',  group: 'League & team fees',   label: 'Sponsor portion per team' },

  { key: 'setup_admission_cash',    sheet: 'Setup',   cell: 'B14', type: 'money',   panel: 'prices',  group: 'Admission prices',     label: 'Admission price: cash' },
  { key: 'setup_admission_card',    sheet: 'Setup',   cell: 'B15', type: 'money',   panel: 'prices',  group: 'Admission prices',     label: 'Admission price: card' },

  { key: 'setup_lg_price',          sheet: 'Setup',   cell: 'B16', type: 'money',   panel: 'prices',  group: 'Concession selling prices', label: 'Large Gatorade price' },
  { key: 'setup_sm_price',          sheet: 'Setup',   cell: 'B17', type: 'money',   panel: 'prices',  group: 'Concession selling prices', label: 'Small Gatorade price' },
  { key: 'setup_skittles_price',    sheet: 'Setup',   cell: 'B18', type: 'money',   panel: 'prices',  group: 'Concession selling prices', label: 'Skittles price' },

  { key: 'setup_lg_cost',           sheet: 'Setup',   cell: 'B19', type: 'money',   panel: 'prices',  group: 'Concession unit costs', label: 'Large Gatorade unit cost' },
  { key: 'setup_sm_cost',           sheet: 'Setup',   cell: 'B20', type: 'money',   panel: 'prices',  group: 'Concession unit costs', label: 'Small Gatorade unit cost' },
  { key: 'setup_skittles_cost',     sheet: 'Setup',   cell: 'B21', type: 'money',   panel: 'prices',  group: 'Concession unit costs', label: 'Skittles unit cost' },

  { key: 'setup_refs_per_game',     sheet: 'Setup',   cell: 'B11', type: 'int',     panel: 'prices',  group: 'Officials & staff',    label: 'Referees per game' },
  { key: 'setup_ref_rate',          sheet: 'Setup',   cell: 'B12', type: 'money',   panel: 'prices',  group: 'Officials & staff',    label: 'Referee rate per game' },
  { key: 'setup_scorekeeper_rate',  sheet: 'Setup',   cell: 'B13', type: 'money',   panel: 'prices',  group: 'Officials & staff',    label: 'Scorekeeper hourly rate' },

  { key: 'setup_card_rate',         sheet: 'Setup',   cell: 'B22', type: 'percent', panel: 'prices',  group: 'Card processing',      label: 'Card processing rate' },
  { key: 'setup_card_fee_txn',      sheet: 'Setup',   cell: 'B23', type: 'money',   panel: 'prices',  group: 'Card processing',      label: 'Card fee per transaction' },
  { key: 'setup_conc_card_share',   sheet: 'Setup',   cell: 'B27', type: 'percent', panel: 'prices',  group: 'Card processing',      label: 'Concession sales paid by card' },

  { key: 'setup_insurance_cost',    sheet: 'Setup',   cell: 'B24', type: 'money',   panel: 'prices',  group: 'Insurance & overhead', label: 'Season insurance cost' },
  { key: 'setup_insurance_refund',  sheet: 'Setup',   cell: 'B25', type: 'money',   panel: 'prices',  group: 'Insurance & overhead', label: 'Expected insurance reimbursement' },
  { key: 'setup_other_season_fixed',sheet: 'Setup',   cell: 'B26', type: 'money',   panel: 'prices',  group: 'Insurance & overhead', label: 'Other season fixed costs' },

  { key: 'setup_first_tuesday',     sheet: 'Setup',   cell: 'B28', type: 'date',    panel: 'prices',  group: 'Calendar',             label: 'First Tuesday of the season' },

  { key: 'fund_sponsor_fees',       sheet: 'Funding', cell: 'B8',  type: 'money',   panel: 'funding', group: 'Team fees received (running totals)', label: 'Sponsor payments toward team fees' },
  { key: 'fund_player_fees',        sheet: 'Funding', cell: 'B9',  type: 'money',   panel: 'funding', group: 'Team fees received (running totals)', label: 'Coach/Player payments' },
  { key: 'fund_add_sponsor',        sheet: 'Funding', cell: 'B15', type: 'money',   panel: 'funding', group: 'Extra funding (running totals)',      label: 'Additional sponsorships' },
  { key: 'fund_other',              sheet: 'Funding', cell: 'B16', type: 'money',   panel: 'funding', group: 'Extra funding (running totals)',      label: 'Other funding received' },
  { key: 'fund_insurance_refund',   sheet: 'Funding', cell: 'B19', type: 'money',   panel: 'funding', group: 'Refunds',                             label: 'Insurance refunds received' }
];

/* ---------- Weekly rentals (Setup rows 32–41 = weeks 1–10; only weeks in the season are shown) ---------- */
var RENTAL_COLS = [
  { part: 'court',  col: 'B', label: 'Court rental' },
  { part: 'church', col: 'C', label: 'Church rental' },
  { part: 'other',  col: 'D', label: 'Other fixed / week' }
];

/* ---------- Per-game-day inputs (Daily Tracker, columns C–V = days 1–20) ---------- */
var DAY_FIRST_COL = 3, DAY_COUNT = 20, DAILY_LAST_ROW = 73;
var DAILY_FIELDS = [
  { field: 'completed',     row: 10, type: 'bool',   group: 'Status',            label: 'Day completed' },
  { field: 'cash_adm',      row: 16, type: 'int',    group: 'Admissions',        label: 'Cash admissions sold' },
  { field: 'card_adm',      row: 19, type: 'int',    group: 'Admissions',        label: 'Card admissions sold' },
  { field: 'lg_sold',       row: 24, type: 'int',    group: 'Concessions sold',  label: 'Large Gatorade sold' },
  { field: 'sm_sold',       row: 27, type: 'int',    group: 'Concessions sold',  label: 'Small Gatorade sold' },
  { field: 'skittles_sold', row: 30, type: 'int',    group: 'Concessions sold',  label: 'Skittles sold' },
  { field: 'other_rev',     row: 34, type: 'money',  group: 'Concessions sold',  label: 'Other event revenue' },
  { field: 'score_hours',   row: 48, type: 'number', group: 'Staff',             label: 'Scorekeeper hours (all staff)' },
  { field: 'staff_hours',   row: 51, type: 'number', group: 'Staff',             label: 'Other staff hours' },
  { field: 'staff_rate',    row: 52, type: 'money',  group: 'Staff',             label: 'Other staff hourly rate' },
  { field: 'supplies_qty',  row: 54, type: 'number', group: 'Supplies & other',  label: 'Other supplies quantity' },
  { field: 'supplies_cost', row: 55, type: 'money',  group: 'Supplies & other',  label: 'Other supplies unit cost' },
  { field: 'other_exp',     row: 57, type: 'money',  group: 'Supplies & other',  label: 'Other event expenses' },
  { field: 'card_txns',     row: 59, type: 'int',    group: 'Card payments',     label: 'Card transaction count' }
];
// Read-only rows shown as the day summary
var DAY_INFO = { label: 5, dayName: 7, week: 8, date: 9, games: 11, revenue: 35, cost: 71, net: 72 };

/* ======================= Web app entry points ======================= */

function doGet() {
  try {
    return json_(buildPayload_(SpreadsheetApp.getActive()));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('EDIT_PASSCODE');
    if (!expected) return json_({ ok: false, error: 'EDIT_PASSCODE is not set in Apps Script → Project Settings → Script properties.' });
    if (String(body.passcode || '') !== expected) return json_({ ok: false, error: 'Wrong passcode.' });

    var ss = SpreadsheetApp.getActive();
    var changes = Array.isArray(body.changes) ? body.changes : [];
    var index = buildIndex_(ss);

    // Validate everything first, so a single typo doesn't leave a half-saved batch.
    var writes = [];
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i];
      var target = index[c.key];
      if (!target) return json_({ ok: false, error: 'Unknown field: ' + c.key });
      var parsed;
      try { parsed = parse_(target.type, c.value); }
      catch (err) { return json_({ ok: false, error: target.label + ': ' + err.message }); }
      writes.push({ target: target, value: parsed });
    }

    if (writes.length) {
      lock.waitLock(20000);
      var log = getLogSheet_(ss);
      var stamp = new Date();
      var logRows = [];
      writes.forEach(function (w) {
        var range = ss.getSheetByName(w.target.sheet).getRange(w.target.a1);
        var before = range.getDisplayValue();
        range.setValue(w.value);
        logRows.push([stamp, w.target.sheet + '!' + w.target.a1, w.target.label, before, w.value === '' ? '(blank)' : w.value]);
      });
      log.getRange(log.getLastRow() + 1, 1, logRows.length, 5).setValues(logRows);
      SpreadsheetApp.flush();
    }

    var payload = buildPayload_(ss);
    payload.saved = writes.length;
    return json_(payload);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ======================= Read everything ======================= */

function buildPayload_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var setupSh = ss.getSheetByName(SHEET.setup);
  var fundSh = ss.getSheetByName(SHEET.funding);
  var grids = {
    Setup:   { v: setupSh.getRange('A1:D50').getValues(), d: setupSh.getRange('A1:D50').getDisplayValues() },
    Funding: { v: fundSh.getRange('A1:D25').getValues(),  d: fundSh.getRange('A1:D25').getDisplayValues() }
  };

  var fields = FIELDS.map(function (f) {
    var rc = a1_(f.cell), g = grids[f.sheet];
    return {
      key: f.key, label: f.label, type: f.type, panel: f.panel, group: f.group,
      value: out_(f.type, g.v[rc.r - 1][rc.c - 1], tz),
      hint: g.d[rc.r - 1][3] || ''
    };
  });

  var seasonWeeks = Number(grids.Setup.v[7][1]) || 10; // Setup!B8
  var rentals = [];
  for (var w = 1; w <= Math.min(seasonWeeks, 10); w++) {
    RENTAL_COLS.forEach(function (rc) {
      var cell = rc.col + (31 + w), pos = a1_(cell);
      rentals.push({ key: 'rent_w' + w + '_' + rc.part, week: w, part: rc.part, label: 'Week ' + w + ' ' + rc.label,
                     type: 'money', value: out_('money', grids.Setup.v[pos.r - 1][pos.c - 1], tz) });
    });
  }

  var dailySh = ss.getSheetByName(SHEET.daily);
  var range = dailySh.getRange(1, DAY_FIRST_COL, DAILY_LAST_ROW, DAY_COUNT);
  var dv = range.getValues(), dd = range.getDisplayValues();
  var days = [];
  for (var n = 0; n < DAY_COUNT; n++) {
    if (dv[DAY_INFO.week - 1][n] === '' || dv[DAY_INFO.week - 1][n] === null) continue;
    var values = {};
    DAILY_FIELDS.forEach(function (f) { values[f.field] = out_(f.type, dv[f.row - 1][n], tz); });
    days.push({
      n: n + 1,
      label: String(dd[DAY_INFO.label - 1][n]).replace(/\s*\n\s*/g, ' · '),
      dayName: dd[DAY_INFO.dayName - 1][n],
      week: dv[DAY_INFO.week - 1][n],
      date: dd[DAY_INFO.date - 1][n],
      games: dd[DAY_INFO.games - 1][n],
      revenue: dd[DAY_INFO.revenue - 1][n],
      cost: dd[DAY_INFO.cost - 1][n],
      net: dd[DAY_INFO.net - 1][n],
      values: values
    });
  }

  return {
    ok: true,
    serverTime: Utilities.formatDate(new Date(), tz, 'MMM d, yyyy h:mm a'),
    outputs: readWeb_(ss),
    fields: fields,
    rentals: rentals,
    days: days,
    dailyFields: DAILY_FIELDS.map(function (f) { return { field: f.field, label: f.label, type: f.type, group: f.group }; })
  };
}

function readWeb_(ss) {
  var sh = ss.getSheetByName(SHEET.web);
  if (!sh) return {};
  var rows = sh.getDataRange().getDisplayValues();
  var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var k = head.indexOf('key'), v = head.indexOf('value'), f = head.indexOf('format');
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var key = String(rows[i][k] || '').trim();
    if (key) map[key] = { value: rows[i][v], format: f === -1 ? 'text' : String(rows[i][f] || 'text').trim().toLowerCase() };
  }
  return map;
}

/* ======================= Write helpers ======================= */

function buildIndex_(ss) {
  var idx = {};
  FIELDS.forEach(function (f) { idx[f.key] = { sheet: f.sheet, a1: f.cell, type: f.type, label: f.label }; });
  for (var w = 1; w <= 10; w++) {
    RENTAL_COLS.forEach(function (rc) {
      idx['rent_w' + w + '_' + rc.part] = { sheet: SHEET.setup, a1: rc.col + (31 + w), type: 'money', label: 'Week ' + w + ' ' + rc.label };
    });
  }
  for (var n = 1; n <= DAY_COUNT; n++) {
    DAILY_FIELDS.forEach(function (f) {
      idx['day' + n + '_' + f.field] = { sheet: SHEET.daily, a1: colLetter_(DAY_FIRST_COL + n - 1) + f.row, type: f.type, label: 'Day ' + n + ' ' + f.label };
    });
  }
  return idx;
}

function parse_(type, raw) {
  if (type === 'bool') return (raw === true || raw === 1 || raw === '1' || raw === 'true') ? 1 : 0;
  if (raw === null || raw === undefined || String(raw).trim() === '') return '';
  var s = String(raw).trim();
  if (type === 'date') {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new Error('use a date like 2026-11-10');
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  var n = Number(s.replace(/[$,%\s]/g, ''));
  if (!isFinite(n)) throw new Error('"' + s + '" is not a number');
  if (n < 0) throw new Error('cannot be negative');
  if (type === 'int' && Math.floor(n) !== n) throw new Error('must be a whole number');
  if (type === 'percent') {
    if (n > 100) throw new Error('enter a percent between 0 and 100');
    return n / 100;
  }
  return n;
}

function out_(type, v, tz) {
  if (v === '' || v === null || v === undefined) return '';
  if (type === 'date') return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  if (type === 'percent') return Math.round(Number(v) * 100 * 10000) / 10000;
  if (type === 'bool') return Number(v) === 1 ? 1 : 0;
  return v;
}

function getLogSheet_(ss) {
  var sh = ss.getSheetByName(SHEET.log);
  if (!sh) {
    sh = ss.insertSheet(SHEET.log);
    sh.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Cell', 'Field', 'Old value', 'New value']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function a1_(a1) {
  var m = /^([A-Z]+)(\d+)$/.exec(a1);
  var c = 0;
  for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
  return { r: Number(m[2]), c: c };
}

function colLetter_(c) {
  var s = '';
  while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
