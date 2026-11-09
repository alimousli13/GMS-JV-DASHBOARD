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

  { key: 'setup_church_rate',       sheet: 'Setup',   cell: 'B51', type: 'money',   panel: 'prices',  group: 'Church rental',        label: 'Church hourly rate' },
  { key: 'setup_church_hours_game', sheet: 'Setup',   cell: 'B52', type: 'number',  panel: 'prices',  group: 'Church rental',        label: 'Church hours booked per game' },

  { key: 'setup_insurance_cost',    sheet: 'Setup',   cell: 'B24', type: 'money',   panel: 'prices',  group: 'Insurance & overhead', label: 'Season insurance cost' },
  { key: 'setup_insurance_refund',  sheet: 'Setup',   cell: 'B25', type: 'money',   panel: 'prices',  group: 'Insurance & overhead', label: 'Expected insurance reimbursement' },
  { key: 'setup_other_season_fixed',sheet: 'Setup',   cell: 'B26', type: 'money',   panel: 'prices',  group: 'Insurance & overhead', label: 'Other season fixed costs' },


  { key: 'fund_sponsor_fees',       sheet: 'Funding', cell: 'B8',  type: 'money',   panel: 'funding', group: 'Team fees received (running totals)', label: 'Sponsor payments toward team fees' },
  { key: 'fund_player_fees',        sheet: 'Funding', cell: 'B9',  type: 'money',   panel: 'funding', group: 'Team fees received (running totals)', label: 'Coach/Player payments' },
  { key: 'fund_add_sponsor',        sheet: 'Funding', cell: 'B15', type: 'money',   panel: 'funding', group: 'Extra funding (running totals)',      label: 'Additional sponsorships' },
  { key: 'fund_other',              sheet: 'Funding', cell: 'B16', type: 'money',   panel: 'funding', group: 'Extra funding (running totals)',      label: 'Other funding received' },
  { key: 'fund_insurance_refund',   sheet: 'Funding', cell: 'B19', type: 'money',   panel: 'funding', group: 'Refunds',                             label: 'Insurance refunds received' }
];

/* ---------- Weekly rentals (Setup rows 32–41 = weeks 1–10; only weeks in the season are shown) ---------- */
var RENTAL_COLS = [
  { part: 'court',  col: 'B', label: 'Court rental' },
  { part: 'church', col: 'C', label: 'Church rental', readonly: true }, // = hourly rate × hours booked (formula)
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

/* ======================= Sheet menu ======================= */
// Adds a "Kenny League" menu to the Google Sheet so one-time updates can be run
// with a click instead of from the Apps Script editor.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kenny League')
    .addItem('Update schedule from file data', 'updateSchedule')
    .addItem('Recalculate church rent from schedule', 'updateChurchRent')
    .addToUi();
}

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
    Setup:   { v: setupSh.getRange('A1:D60').getValues(), d: setupSh.getRange('A1:D60').getDisplayValues() },
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
                     type: 'money', readonly: !!rc.readonly, value: out_('money', grids.Setup.v[pos.r - 1][pos.c - 1], tz) });
    });
  }

  var dailySh = ss.getSheetByName(SHEET.daily);
  var range = dailySh.getRange(1, DAY_FIRST_COL, DAILY_LAST_ROW, DAY_COUNT);
  var dv = range.getValues(), dd = range.getDisplayValues();
  var days = [];
  for (var n = 0; n < DAY_COUNT; n++) {
    if (dv[DAY_INFO.week - 1][n] === '' || dv[DAY_INFO.week - 1][n] === null) continue;
    if (!Number(dv[DAY_INFO.games - 1][n])) continue; // no games scheduled that day
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
    schedule: readSchedule_(ss),
    fields: fields,
    rentals: rentals,
    days: days,
    dailyFields: DAILY_FIELDS.map(function (f) { return { field: f.field, label: f.label, type: f.type, group: f.group }; })
  };
}

function readSchedule_(ss) {
  var sh = ss.getSheetByName('Schedule');
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getDisplayValues();
  return rows.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { week: r[0], day: r[1], time: r[2], court: r[3], venue: r[4], home: r[5], away: r[6], date: r[8] };
  });
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
      if (rc.readonly) return;
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


/* =====================================================================
   ONE-TIME SCHEDULE UPDATE — run updateSchedule() from the Apps Script editor.
   Safe to run more than once. Undo anytime with File → Version history.
   - Rewrites the Schedule tab from the updated schedule (adds a Date column I).
   - Daily dates now come from the Schedule (Week 4 starts Dec 1 after Thanksgiving).
   - Rent is split by the games actually played at each venue, so a day that
     uses both venues (Wed Dec 9) gets the right share of each venue's rent.
   - "Scheduled game days" counts only days that have games (Week 5 has no Thursday).
   ===================================================================== */
// [week, date, day, time, venue, court, home, away] — from Gainesville_JV_League_Open_Updated.xlsx
var SCHEDULE_2026 = [
  [1, "2026-11-03", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Lincoln", "Oak View"],
  [1, "2026-11-03", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "PK2", "Lincoln 2"],
  [1, "2026-11-03", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Kanapaha", "Westside"],
  [1, "2026-11-03", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Howard Bishop", "Open"],
  [1, "2026-11-04", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Westwood", "Forge Elite"],
  [1, "2026-11-04", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Fort Clarke"],
  [1, "2026-11-05", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Oak View", "Lincoln 2"],
  [1, "2026-11-05", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "PK2", "Kanapaha"],
  [1, "2026-11-05", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Lincoln", "Open"],
  [1, "2026-11-05", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Westside", "Howard Bishop"],
  [1, "2026-11-06", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Westwood", "Fort Clarke"],
  [1, "2026-11-06", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Forge Elite"],
  [2, "2026-11-10", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Kanapaha", "Oak View"],
  [2, "2026-11-10", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Lincoln", "Fort Clarke"],
  [2, "2026-11-10", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Howard Bishop", "PK2"],
  [2, "2026-11-10", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Westwood", "Open"],
  [2, "2026-11-11", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Westside", "Forge Elite"],
  [2, "2026-11-11", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Lincoln 2"],
  [2, "2026-11-12", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Lincoln 2", "Fort Clarke"],
  [2, "2026-11-12", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "PK2", "Westwood"],
  [2, "2026-11-12", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Kanapaha", "Howard Bishop"],
  [2, "2026-11-12", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Oak View", "Open"],
  [2, "2026-11-13", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Lincoln", "Forge Elite"],
  [2, "2026-11-13", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Westside"],
  [3, "2026-11-17", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Lincoln", "Westwood"],
  [3, "2026-11-17", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Kanapaha", "Fort Clarke"],
  [3, "2026-11-17", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "PK2", "Open"],
  [3, "2026-11-17", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Howard Bishop", "Forge Elite"],
  [3, "2026-11-18", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "PK2", "Westside"],
  [3, "2026-11-18", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Oak View"],
  [3, "2026-11-19", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Kanapaha", "Lincoln 2"],
  [3, "2026-11-19", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "Oak View", "Westwood"],
  [3, "2026-11-19", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Fort Clarke", "Howard Bishop"],
  [3, "2026-11-19", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Forge Elite", "Open"],
  [3, "2026-11-20", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Westside", "Lincoln 2"],
  [3, "2026-11-20", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Lincoln"],
  [4, "2026-12-01", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "PK2", "Lincoln"],
  [4, "2026-12-01", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Kanapaha", "Westwood"],
  [4, "2026-12-01", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Forge Elite", "Lincoln 2"],
  [4, "2026-12-01", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Fort Clarke", "Open"],
  [4, "2026-12-02", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Oak View", "Westside"],
  [4, "2026-12-02", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Westwood"],
  [4, "2026-12-03", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "PK2", "Forge Elite"],
  [4, "2026-12-03", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "Lincoln", "Lincoln 2"],
  [4, "2026-12-03", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Howard Bishop", "Oak View"],
  [4, "2026-12-03", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Kanapaha", "Open"],
  [4, "2026-12-04", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Westside", "Fort Clarke"],
  [4, "2026-12-04", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "PK", "Howard Bishop"],
  [5, "2026-12-08", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Kanapaha", "Forge Elite"],
  [5, "2026-12-08", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Oak View", "Fort Clarke"],
  [5, "2026-12-08", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "PK", "Open"],
  [5, "2026-12-08", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Howard Bishop", "Lincoln 2"],
  [5, "2026-12-09", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Lincoln", "Westside"],
  [5, "2026-12-09", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "Lincoln 2", "Open"],
  [5, "2026-12-09", "Wed", "6:00 PM", "Alachua Sports Complex", "Court 1", "Oak View", "Forge Elite"],
  [5, "2026-12-09", "Wed", "6:00 PM", "Alachua Sports Complex", "Court 2", "Lincoln", "Kanapaha"],
  [5, "2026-12-09", "Wed", "7:00 PM", "Alachua Sports Complex", "Court 1", "PK2", "Fort Clarke"],
  [5, "2026-12-09", "Wed", "7:00 PM", "Alachua Sports Complex", "Court 2", "Westwood", "Howard Bishop"],
  [5, "2026-12-11", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Westwood", "Westside"],
  [5, "2026-12-11", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "PK", "PK2"]
];

var DAY_FULL = { Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Mon: 'Monday', Sun: 'Sunday' };
var VENUE_FULL = { 'Abundant Grace': 'Abundant Grace Church', 'Alachua Sports Complex': 'Alachua Sports Complex' };

function updateSchedule() {
  var ss = SpreadsheetApp.getActive();
  var sch = ss.getSheetByName('Schedule');
  var daily = ss.getSheetByName(SHEET.daily);
  var setup = ss.getSheetByName(SHEET.setup);

  // 1) Schedule tab — same column layout the formulas expect (A–H), plus Date in I.
  sch.getRange('A1:K1001').clearContent();
  sch.getRange('C2:C1001').setNumberFormat('@'); // keep "6:00 PM" as text, like before
  var rows = SCHEDULE_2026.map(function (g) {
    var p = g[1].split('-');
    return [g[0], DAY_FULL[g[2]] || g[2], g[3], g[5], VENUE_FULL[g[4]] || g[4], g[6], g[7], g[6] + ' vs ' + g[7],
            new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))];
  });
  sch.getRange(1, 1, 1, 9).setValues([['Week', 'Day', 'Time', 'Court', 'Location', 'Team 1', 'Team 2', 'Matchup', 'Date']]).setFontWeight('bold');
  sch.getRange(2, 1, rows.length, 9).setValues(rows);
  sch.getRange(2, 9, rows.length, 1).setNumberFormat('ddd, mmm d, yyyy');
  sch.getRange('K1:K3').setValues([['Schedule source'],
    ['Gainesville_JV_League_Open_Updated.xlsx — Full Schedule, imported ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d, yyyy')],
    ['Dates in column I drive the Daily Tracker dates.']]);

  // 2) Daily Tracker formulas, columns C–V. {c} = that day's column letter.
  var S = 'Schedule!$A$2:$A$1001,{c}8,Schedule!$B$2:$B$1001,{c}7';
  var patches = {
    5:  '="W"&{c}8&" "&LEFT({c}7,3)&CHAR(10)&IF({c}11=0,"No games",IF(AND({c}12=1,{c}13=1),"Both venues",IF({c}12=1,"Sports complex",IF({c}13=1,"Church",""))))',
    9:  '=IF({c}11=0,"",MINIFS(Schedule!$I$2:$I$1001,' + S + '))',
    66: '=IF(OR({c}8="",{c}12<>1),0,SUMIFS(Setup!$B$32:$B$41,Setup!$A$32:$A$41,{c}8)*COUNTIFS(' + S + ',Schedule!$E$2:$E$1001,"Alachua Sports Complex")/COUNTIFS(Schedule!$A$2:$A$1001,{c}8,Schedule!$E$2:$E$1001,"Alachua Sports Complex"))',
    67: '=IF(OR({c}8="",{c}13<>1),0,SUMIFS(Setup!$C$32:$C$41,Setup!$A$32:$A$41,{c}8)*COUNTIFS(' + S + ',Schedule!$E$2:$E$1001,"Abundant Grace Church")/COUNTIFS(Schedule!$A$2:$A$1001,{c}8,Schedule!$E$2:$E$1001,"Abundant Grace Church"))'
  };
  Object.keys(patches).forEach(function (row) {
    var formulas = [[]];
    for (var col = DAY_FIRST_COL; col < DAY_FIRST_COL + DAY_COUNT; col++) {
      formulas[0].push(patches[row].replace(/\{c\}/g, colLetter_(col)));
    }
    daily.getRange(Number(row), DAY_FIRST_COL, 1, DAY_COUNT).setFormulas(formulas);
  });
  daily.getRange(9, DAY_FIRST_COL, 1, DAY_COUNT).setNumberFormat('ddd mmm d');

  // 3) Setup: count only days that actually have games; refresh notes.
  setup.getRange('B47').setFormula("=COUNTIFS('Daily Tracker'!C11:V11,\">0\")");
  setup.getRange('D47').setValue('Days with at least one scheduled game (from Schedule).');
  setup.getRange('D9').setValue('Weeks 1–4: Tue–Fri. Week 5: Tue, Wed (both venues), Fri.');
  setup.getRange('D10').setValue('Tue/Thu: 4 games at the sports complex. Wed/Fri: 2 at the church. Wed Dec 9: 6 games.');
  setup.getRange('D28').setValue('Not used anymore: daily dates come from the Schedule tab (column I).');

  SpreadsheetApp.flush();
  ss.toast('Schedule updated: ' + rows.length + ' games.', 'Kenny League', 8);
}


/* =====================================================================
   ONE-TIME CHURCH RENT UPDATE — run updateChurchRent() from the editor.
   Church rent = hourly rate × hours booked, where hours booked =
   church games that week × hours per game (1 hour slots: 6 PM and 7 PM).
   Reads the Schedule, so it stays right when games move.
   Sports complex rent stays a flat weekly input (Setup column B).
   ===================================================================== */
function updateChurchRent() {
  var setup = SpreadsheetApp.getActive().getSheetByName(SHEET.setup);
  setup.getRange('A51:D52').setValues([
    ['Church hourly rate', 50, '', '$50/hour at Abundant Grace Church.'],
    ['Church hours booked per game', 1, '', 'Each game slot is 1 hour (6 PM, 7 PM).']
  ]);
  setup.getRange('B51').setNumberFormat('$#,##0.00');
  setup.getRange('B51:B52').setBackground('#fff2cc'); // yellow = editable, like the rest of Setup

  var formulas = [];
  for (var r = 32; r <= 41; r++) {
    formulas.push(['=$B$51*$B$52*COUNTIFS(Schedule!$A$2:$A$1001,A' + r + ',Schedule!$E$2:$E$1001,"Abundant Grace Church")']);
  }
  setup.getRange('C32:C41').setFormulas(formulas).setBackground(null);
  setup.getRange('C31').setValue('Church rental (auto)');
  setup.getRange('A43').setValue('Court = $1,000/week (flat). Church = hourly rate × hours booked, counted from the Schedule tab.');
  SpreadsheetApp.flush();
  SpreadsheetApp.getActive().toast('Church rent now calculated from the schedule.', 'Kenny League', 8);
}
