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
  { key: 'setup_admission_card',    sheet: 'Setup',   cell: 'B15', type: 'money',   panel: 'prices',  group: 'Admission prices',     label: 'Ticket price: card (per ticket, before fee)' },
  { key: 'setup_card_fee_order',    sheet: 'Setup',   cell: 'B16', type: 'money',   panel: 'prices',  group: 'Card fees we charge',  label: 'Card fee per ticket order' },
  { key: 'setup_conc_card_fee',     sheet: 'Setup',   cell: 'B17', type: 'money',   panel: 'prices',  group: 'Card fees we charge',  label: 'Card fee per concession order under $5' },


  { key: 'setup_refs_per_game',     sheet: 'Setup',   cell: 'B11', type: 'int',     panel: 'prices',  group: 'Officials & staff',    label: 'Referees per game' },
  { key: 'setup_ref_rate',          sheet: 'Setup',   cell: 'B12', type: 'money',   panel: 'prices',  group: 'Officials & staff',    label: 'Referee rate per game' },
  { key: 'setup_scorekeeper_rate',  sheet: 'Setup',   cell: 'B13', type: 'money',   panel: 'prices',  group: 'Officials & staff',    label: 'Scorekeeper hourly rate' },

  { key: 'setup_card_rate',         sheet: 'Setup',   cell: 'B22', type: 'percent', panel: 'prices',  group: 'Card processing',      label: 'Square rate per card sale' },
  { key: 'setup_card_fee_txn',      sheet: 'Setup',   cell: 'B23', type: 'money',   panel: 'prices',  group: 'Card processing',      label: 'Square fixed fee per card sale' },
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
  { field: 'card_adm',      row: 19, type: 'int',    group: 'Admissions',        label: 'Card tickets sold',
    hint: 'Every ticket paid by card, at the door or online.' },
  { field: 'card_orders',   row: 24, type: 'int',    group: 'Admissions',        label: 'Card ticket orders',
    hint: 'Separate card payments. A family buying 3 tickets on one card = 1 order. The card fee is added once per order.' },
  { field: 'other_rev',     row: 34, type: 'money',  group: 'Other revenue',     label: 'Other event revenue' },
  { field: 'score_hours',   row: 48, type: 'number', group: 'Staff',             label: 'Scorekeeper hours (all staff)' },
  { field: 'staff_hours',   row: 51, type: 'number', group: 'Staff',             label: 'Other staff hours' },
  { field: 'staff_rate',    row: 52, type: 'money',  group: 'Staff',             label: 'Other staff hourly rate' },
  { field: 'supplies_qty',  row: 54, type: 'number', group: 'Supplies & other',  label: 'Other supplies quantity' },
  { field: 'supplies_cost', row: 55, type: 'money',  group: 'Supplies & other',  label: 'Other supplies unit cost' },
  { field: 'other_exp',     row: 57, type: 'money',  group: 'Supplies & other',  label: 'Other event expenses' },
  { field: 'card_conc_small', row: 27, type: 'int',  group: 'Card payments',     label: 'Card concession orders under $5',
    hint: 'Each one adds the $1 card fee. Concession orders of $5 or more have no fee.' },
  { field: 'card_txns',     row: 59, type: 'int',    group: 'Card payments',     label: 'All card payments',
    hint: 'Every card sale that night, tickets and concessions. Square charges 15¢ on each. Left at 0, it counts ticket orders + small concession orders.' }
];
// Read-only rows shown as the day summary
/* ---------- Concession items (sheet tab "Concessions") ----------
   One row per item: A Item, B Price, C Unit cost, D Active (1/0), E ID (stable key),
   F..Y = quantity sold on game days 1-20 (same order as Daily Tracker C..V),
   Z Sold (season), AA Revenue, AB Profit, AC Needs (formulas). Blank price/cost is fine;
   AC only says "price"/"cost" when an item has sold but is missing one. The owner adds/edits items on the
   Enter Data page; Daily Tracker rows 33 (revenue) and 43 (item cost) sum this tab. */
var CONC = { sheet: 'Concessions', first: 3, last: 300, dayCol: 6, width: 29 };
var CONC_FIELDS = { name: { col: 'A', type: 'text' }, price: { col: 'B', type: 'money' },
                    cost: { col: 'C', type: 'money' }, active: { col: 'D', type: 'bool' } };

// Shared by setupCardFee (Code.gs) and the Square sync (Square.gs).
var CARD_FEE_FORMULAS = {
  revenue:    '=IF(ISNUMBER({c}33),SUM({c}22,{c}33,{c}34,{c}29,{c}32),"Set small price")',
  squareFees: '=IF(ISNUMBER({c}62),IF(N({c}30)>0,{c}30,{c}62*{c}60+MAX({c}59,{c}24+{c}27)*{c}61),"Set small price")'
};

var DAY_INFO = { label: 5, dayName: 7, week: 8, date: 9, games: 11, revenue: 35, cost: 71, net: 72 };

/* ======================= Sheet menu ======================= */
// Adds a "Kenny League" menu to the Google Sheet so one-time updates can be run
// with a click instead of from the Apps Script editor.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kenny League')
    .addItem('Update schedule from file data', 'updateSchedule')
    .addItem('Recalculate church rent from schedule', 'updateChurchRent')
    .addItem('Set up concession item list', 'setupConcessions')
    .addItem('Apply card fees ($1 per order, Square 2.3% + 15¢)', 'setupCardFee')
    .addSeparator()
    .addItem('Sync Square now', 'squareSyncNow')
    .addItem('Turn on nightly Square sync', 'squareTurnOnNightly')
    .addToUi();
}

/* ======================= Web app entry points ======================= */

/* GET
   ?view=public            → schedule only (used by the public site gmsjvbasketball.com)
   ?key=<READ_KEY>         → full dashboard payload (finances, inputs, schedule)
   READ_KEY lives in Apps Script → Project Settings → Script properties. Until it is
   set, the full payload is served without a key (so nothing breaks during setup). */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var ss = SpreadsheetApp.getActive();
    if (p.view === 'public') return json_(buildPublic_(ss));
    var readKey = PropertiesService.getScriptProperties().getProperty('READ_KEY');
    if (readKey && String(p.key || '') !== readKey) {
      return json_({ ok: false, error: 'Not authorized. The dashboard needs READ_KEY in config.js.' });
    }
    return json_(buildPayload_(ss));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// Public data only: the game schedule. No money, no inputs, no sponsor details.
function buildPublic_(ss) {
  return {
    ok: true,
    serverTime: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MMM d, yyyy h:mm a'),
    schedule: readSchedule_(ss)
  };
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('EDIT_PASSCODE');
    if (!expected) return json_({ ok: false, error: 'EDIT_PASSCODE is not set in Apps Script → Project Settings → Script properties.' });
    if (String(body.passcode || '') !== expected) return json_({ ok: false, error: 'Wrong passcode.' });

    if (body.action === 'sponsors_list' || body.action === 'sponsors_save') {
      lock.waitLock(20000);
      return json_(sponsorHandle_(body));
    }
    if (body.action === 'square_sync') {
      var sync = squareSync_(); // takes its own lock
      var after = buildPayload_(SpreadsheetApp.getActive());
      after.syncSummary = sync;
      return json_(after);
    }
    if (body.action) return json_({ ok: false, error: 'Unknown action.' });

    var ss = SpreadsheetApp.getActive();
    var changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length) lock.waitLock(20000); // before reading item rows, so simultaneous adds can't collide
    var conc = readConcessions_(ss);
    var index = buildIndex_(ss, conc);

    // New concession items arrive as citem:new-1:name / :price / :cost / :active.
    var extraWrites = [], newItems = {};
    changes.forEach(function (c) {
      var m = /^citem:(new-\d+):(name|price|cost|active)$/.exec(String(c.key));
      if (m) newItems[m[1]] = newItems[m[1]] || {};
      if (m) newItems[m[1]][m[2]] = c.value;
    });
    var nextRow = conc.reduce(function (mx, it) { return Math.max(mx, it.row + 1); }, CONC.first);
    Object.keys(newItems).forEach(function (tmp) {
      if (!String(newItems[tmp].name || '').trim()) throw new Error('Each new concession item needs a name.');
      if (nextRow > CONC.last) throw new Error('The concession list is full.');
      var row = nextRow++, id = newConcId_();
      addConcIndex_(index, tmp, row, String(newItems[tmp].name).trim());
      extraWrites.push({ target: { sheet: CONC.sheet, a1: 'E' + row, label: 'New item ID', noLog: true }, value: id });
      if (!('active' in newItems[tmp])) extraWrites.push({ target: { sheet: CONC.sheet, a1: 'D' + row, noLog: true }, value: 1 });
      concRowFormulas_(row).forEach(function (f) { extraWrites.push({ target: { sheet: CONC.sheet, a1: f[0], noLog: true, formula: true }, value: f[1] }); });
    });

    // Validate everything first, so a single typo doesn't leave a half-saved batch.
    var writes = [];
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i];
      var target = index[c.key];
      if (!target) return json_({ ok: false, error: 'Unknown field: ' + c.key });
      var parsed;
      try { parsed = parse_(target.type, c.value); }
      catch (err) { return json_({ ok: false, error: target.label + ': ' + err.message }); }
      if (target.type === 'text' && parsed === '') return json_({ ok: false, error: target.label + ': can\'t be blank' });
      writes.push({ target: target, value: parsed });
    }
    writes = writes.concat(extraWrites);

    if (writes.length) {
      var log = getLogSheet_(ss);
      var stamp = new Date();
      var logRows = [];
      writes.forEach(function (w) {
        var range = ss.getSheetByName(w.target.sheet).getRange(w.target.a1);
        var before = range.getDisplayValue();
        if (w.target.formula) range.setFormula(w.value); else range.setValue(w.value);
        if (w.target.noLog) return;
        logRows.push([stamp, w.target.sheet + '!' + w.target.a1, w.target.label, before, w.value === '' ? '(blank)' : w.value]);
      });
      if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, 5).setValues(logRows);
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

  var conc = readConcessions_(ss);
  var dailySh = ss.getSheetByName(SHEET.daily);
  var range = dailySh.getRange(1, DAY_FIRST_COL, DAILY_LAST_ROW, DAY_COUNT);
  var dv = range.getValues(), dd = range.getDisplayValues();
  var days = [];
  for (var n = 0; n < DAY_COUNT; n++) {
    if (dv[DAY_INFO.week - 1][n] === '' || dv[DAY_INFO.week - 1][n] === null) continue;
    if (!Number(dv[DAY_INFO.games - 1][n])) continue; // no games scheduled that day
    var values = {};
    DAILY_FIELDS.forEach(function (f) { values[f.field] = out_(f.type, dv[f.row - 1][n], tz); });
    var concQty = {};
    conc.forEach(function (it) { concQty[it.id] = it.qty[n]; });
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
      // For the all-game-days table (display strings straight from the sheet).
      iso: (dv[DAY_INFO.date - 1][n] instanceof Date) ? Utilities.formatDate(dv[DAY_INFO.date - 1][n], tz, 'yyyy-MM-dd') : '',
      admissions: dd[21][n],   // row 22 total admission revenue
      concessions: dd[32][n],  // row 33 concession revenue
      squareFees: dd[62][n],   // row 63 Square card fees
      // Concessions are only sold at the church (rows 12/13 = sports complex / church that day).
      hasConcessions: Number(dv[12][n]) === 1,
      values: values,
      conc: concQty
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
    concessions: conc.map(function (it) {
      return { id: it.id, name: it.name, price: it.price, cost: it.cost, active: it.active,
               sold: it.sold, revenue: it.revenue, profit: it.profit, needs: it.needs };
    }),
    dailyFields: DAILY_FIELDS.map(function (f) { return { field: f.field, label: f.label, type: f.type, group: f.group, hint: f.hint || '' }; }),
    square: squareStatus_()
  };
}

function readSchedule_(ss) {
  var sh = ss.getSheetByName('Schedule');
  if (!sh || sh.getLastRow() < 2) return [];
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, 9);
  var rows = rng.getDisplayValues(), raw = rng.getValues(), tz = ss.getSpreadsheetTimeZone();
  return rows.map(function (r, i) {
    var d = raw[i][8];
    return { week: r[0], day: r[1], time: r[2], court: r[3], venue: r[4], home: r[5], away: r[6], date: r[8],
             iso: d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : '' };
  }).filter(function (g) { return g.week !== '';
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

function buildIndex_(ss, conc) {
  var idx = {};
  (conc || readConcessions_(ss)).forEach(function (it) { addConcIndex_(idx, it.id, it.row, it.name); });
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
  if (type === 'text') {
    if (s.length > 60) throw new Error('keep it under 60 characters');
    if (/^[=+@\-]/.test(s)) throw new Error('can\'t start with = + - or @');
    return s;
  }
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
// Team names updated Nov 16, 2026 (school names replaced by team names, e.g. Lincoln -> Terriers Blue).
var SCHEDULE_2026 = [
  [1, "2026-11-03", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Terriers Blue", "Panthers"],
  [1, "2026-11-03", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Waves", "Terriers White"],
  [1, "2026-11-03", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Coyotes", "Wildcats"],
  [1, "2026-11-03", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Hawks", "Blues Wave"],
  [1, "2026-11-04", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Whirlwinds", "Forge Elite"],
  [1, "2026-11-04", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Falcons"],
  [1, "2026-11-05", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Panthers", "Terriers White"],
  [1, "2026-11-05", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "Waves", "Coyotes"],
  [1, "2026-11-05", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Terriers Blue", "Blues Wave"],
  [1, "2026-11-05", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Wildcats", "Hawks"],
  [1, "2026-11-06", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Whirlwinds", "Falcons"],
  [1, "2026-11-06", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Forge Elite"],
  [2, "2026-11-10", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Coyotes", "Panthers"],
  [2, "2026-11-10", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Terriers Blue", "Falcons"],
  [2, "2026-11-10", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Hawks", "Waves"],
  [2, "2026-11-10", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Whirlwinds", "Blues Wave"],
  [2, "2026-11-11", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Wildcats", "Forge Elite"],
  [2, "2026-11-11", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Terriers White"],
  [2, "2026-11-12", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Terriers White", "Falcons"],
  [2, "2026-11-12", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "Waves", "Whirlwinds"],
  [2, "2026-11-12", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Coyotes", "Hawks"],
  [2, "2026-11-12", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Panthers", "Blues Wave"],
  [2, "2026-11-13", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Terriers Blue", "Forge Elite"],
  [2, "2026-11-13", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Wildcats"],
  [3, "2026-11-17", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Terriers Blue", "Whirlwinds"],
  [3, "2026-11-17", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Coyotes", "Falcons"],
  [3, "2026-11-17", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Waves", "Blues Wave"],
  [3, "2026-11-17", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Hawks", "Forge Elite"],
  [3, "2026-11-18", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Waves", "Wildcats"],
  [3, "2026-11-18", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Panthers"],
  [3, "2026-11-19", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Coyotes", "Terriers White"],
  [3, "2026-11-19", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "Panthers", "Whirlwinds"],
  [3, "2026-11-19", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Falcons", "Hawks"],
  [3, "2026-11-19", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Forge Elite", "Blues Wave"],
  [3, "2026-11-20", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Wildcats", "Terriers White"],
  [3, "2026-11-20", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Terriers Blue"],
  [4, "2026-12-01", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Waves", "Terriers Blue"],
  [4, "2026-12-01", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Coyotes", "Whirlwinds"],
  [4, "2026-12-01", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "Forge Elite", "Terriers White"],
  [4, "2026-12-01", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Falcons", "Blues Wave"],
  [4, "2026-12-02", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Panthers", "Wildcats"],
  [4, "2026-12-02", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Whirlwinds"],
  [4, "2026-12-03", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 1", "Waves", "Forge Elite"],
  [4, "2026-12-03", "Thu", "6:00 PM", "Alachua Sports Complex", "Court 2", "Terriers Blue", "Terriers White"],
  [4, "2026-12-03", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 1", "Hawks", "Panthers"],
  [4, "2026-12-03", "Thu", "7:00 PM", "Alachua Sports Complex", "Court 2", "Coyotes", "Blues Wave"],
  [4, "2026-12-04", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Wildcats", "Falcons"],
  [4, "2026-12-04", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Hawks"],
  [5, "2026-12-08", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 1", "Coyotes", "Forge Elite"],
  [5, "2026-12-08", "Tue", "6:00 PM", "Alachua Sports Complex", "Court 2", "Panthers", "Falcons"],
  [5, "2026-12-08", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 1", "B2M", "Blues Wave"],
  [5, "2026-12-08", "Tue", "7:00 PM", "Alachua Sports Complex", "Court 2", "Hawks", "Terriers White"],
  [5, "2026-12-09", "Wed", "6:00 PM", "Abundant Grace", "Main Court", "Terriers Blue", "Wildcats"],
  [5, "2026-12-09", "Wed", "7:00 PM", "Abundant Grace", "Main Court", "Terriers White", "Blues Wave"],
  [5, "2026-12-09", "Wed", "6:00 PM", "Alachua Sports Complex", "Court 1", "Panthers", "Forge Elite"],
  [5, "2026-12-09", "Wed", "6:00 PM", "Alachua Sports Complex", "Court 2", "Terriers Blue", "Coyotes"],
  [5, "2026-12-09", "Wed", "7:00 PM", "Alachua Sports Complex", "Court 1", "Waves", "Falcons"],
  [5, "2026-12-09", "Wed", "7:00 PM", "Alachua Sports Complex", "Court 2", "Whirlwinds", "Hawks"],
  [5, "2026-12-11", "Fri", "6:00 PM", "Abundant Grace", "Main Court", "Whirlwinds", "Wildcats"],
  [5, "2026-12-11", "Fri", "7:00 PM", "Abundant Grace", "Main Court", "B2M", "Waves"]
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

/* START: Sponsor Pipeline — never included in public GET */
function sponsorSheet_() {
  var ss = SpreadsheetApp.getActive(); // script is bound to the tracker; openById would need broader Google permissions
  var sh = ss.getSheetByName('Sponsor Pipeline');
  if (!sh || sh.getSheetId() !== 1061870498) throw new Error('Sponsor Pipeline tab does not match the configured tracker.');
  var expected = ['Business / Sponsor','Contact','Email / Phone','Pledged $','Received $','Stage','Next Follow-up','Notes'];
  var normalize = function(s) {return String(s).toLowerCase().replace(/[^a-z0-9]/g,'');};
  var values = sh.getDataRange().getDisplayValues(), header = -1;
  for (var r=0;r<Math.min(values.length,20);r++) {
    if (expected.every(function(s,c){return normalize(values[r][c])===normalize(s);})) {header=r+1;break;}
  }
  if (header < 0) throw new Error('Tracker headers differ from the approved A–H mapping. Nothing was changed.');
  return {sheet:sh,header:header};
}
function sponsorVersion_(values) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(values)));
}
function sponsorList_(info) {
  var sh=info.sheet, last=sh.getLastRow(), result=[];
  if(last<=info.header)return result;
  var data=sh.getRange(info.header+1,1,last-info.header,8).getValues();
  data.forEach(function(v,i){
    if(!v[0])return;
    result.push({row:info.header+1+i,version:sponsorVersion_(v),business:String(v[0] || ''),contact:String(v[1] || ''),
      communication:String(v[2] || ''),stage:String(v[5] || ''),followup:v[6] instanceof Date ? Utilities.formatDate(v[6],sh.getParent().getSpreadsheetTimeZone(),'yyyy-MM-dd') : String(v[6] || ''),notes:String(v[7] || '')});
  });
  return result;
}
function sponsorHandle_(body) {
  var info=sponsorSheet_(),sh=info.sheet;
  if(body.action==='sponsors_save'){
    var record=body.record || {}, cols={business:1,contact:2,communication:3,stage:6,followup:7,notes:8}, clean={};
    Object.keys(cols).forEach(function(k){
      var v=String(record[k] == null ? '' : record[k]).trim(),limit=k==='notes'?4000:k==='communication'?300:200;
      if(v.length>limit)throw new Error(k+' is too long.');
      if(/^[=+@\-]/.test(v))throw new Error(k+' cannot begin with a formula character.');
      clean[k]=v;
    });
    if(!clean.business)throw new Error('Business / Sponsor is required.');
    if(clean.followup){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(clean.followup))throw new Error('Use a valid follow-up date.');
      var parts=clean.followup.split('-').map(Number),date=new Date(parts[0],parts[1]-1,parts[2]);
      if(date.getFullYear()!==parts[0] || date.getMonth()!==parts[1]-1 || date.getDate()!==parts[2])throw new Error('Invalid date.');
    }
    var row=body.row == null ? sh.getLastRow()+1 : Number(body.row);
    if(!Number.isInteger(row)||row<=info.header||row>sh.getLastRow()+1)throw new Error('Invalid sponsor row.');
    if(body.row != null && sponsorVersion_(sh.getRange(row,1,1,8).getValues()[0])!==body.version)throw new Error('This sponsor changed in the spreadsheet. Lock and unlock the tracker to reload before editing.');
    Object.keys(cols).forEach(function(k){
      if(sh.getRange(row,cols[k]).getFormula())throw new Error('A target cell contains a formula. Nothing was changed.');
    });
    var before=sh.getRange(row,1,1,8).getValues()[0];
    // Write only A–C and F–H; existing financial cells D–E are never written.
    sh.getRange(row,1,1,3).setValues([[clean.business,clean.contact,clean.communication]]);
    sh.getRange(row,6,1,3).setValues([[clean.stage,clean.followup ? date : '',clean.notes]]);
    sh.getRange(row,7).setNumberFormat('yyyy-mm-dd');
    var log=getLogSheet_(sh.getParent());
    log.appendRow([new Date(),'Sponsor Pipeline!'+row,'Sponsor outreach edit',JSON.stringify(before),JSON.stringify(sh.getRange(row,1,1,8).getValues()[0])]);
    SpreadsheetApp.flush();
  }
  return {ok:true,sponsors:sponsorList_(info)};
}
/* END: Sponsor Pipeline */


/* =====================================================================
   CONCESSION ITEMS
   ===================================================================== */
function newConcId_() { return 'c' + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

// Sold / revenue / profit / needs for one item row. Blank price or cost never causes an error:
// unsold items just show 0, and sold items missing a number show blank plus a "Needs" flag.
function concRowFormulas_(row) {
  var A = 'A' + row, B = 'B' + row, C = 'C' + row, Z = 'Z' + row;
  return [[Z, '=IF(' + A + '="","",SUM(F' + row + ':Y' + row + '))'],
          ['AA' + row, '=IF(' + A + '="","",IF(N(' + Z + ')=0,0,IF(ISNUMBER(' + B + '),' + Z + '*' + B + ',"")))'],
          ['AB' + row, '=IF(' + A + '="","",IF(N(' + Z + ')=0,0,IF(AND(ISNUMBER(' + B + '),ISNUMBER(' + C + ')),' + Z + '*(' + B + '-' + C + '),"")))'],
          ['AC' + row, '=IF(OR(' + A + '="",N(' + Z + ')=0),"",IF(NOT(ISNUMBER(' + B + ')),"price",IF(NOT(ISNUMBER(' + C + ')),"cost","")))']];
}

function addConcIndex_(idx, id, row, name) {
  Object.keys(CONC_FIELDS).forEach(function (f) {
    idx['citem:' + id + ':' + f] = { sheet: CONC.sheet, a1: CONC_FIELDS[f].col + row, type: CONC_FIELDS[f].type,
                                     label: 'Concession "' + name + '" ' + f };
  });
  for (var n = 1; n <= DAY_COUNT; n++) {
    idx['conc_' + n + '_' + id] = { sheet: CONC.sheet, a1: colLetter_(CONC.dayCol + n - 1) + row, type: 'int',
                                    label: 'Day ' + n + ' ' + name + ' sold' };
  }
}

// Every item row on the Concessions tab. Rows typed straight into the sheet get an ID here.
function readConcessions_(ss) {
  var sh = ss.getSheetByName(CONC.sheet);
  if (!sh || sh.getLastRow() < CONC.first) return [];
  var n = sh.getLastRow() - CONC.first + 1;
  var rng = sh.getRange(CONC.first, 1, n, CONC.width);
  var v = rng.getValues(), d = rng.getDisplayValues(), out = [];
  v.forEach(function (r, i) {
    var name = String(r[0]).trim(), id = String(r[4]).trim();
    if (!name && !id) return;
    if (!id) {
      id = newConcId_();
      sh.getRange(CONC.first + i, 5).setValue(id);
      if (r[3] === '') sh.getRange(CONC.first + i, 4).setValue(1);
      concRowFormulas_(CONC.first + i).forEach(function (f) { sh.getRange(f[0]).setFormula(f[1]); });
    }
    var qty = [];
    for (var k = 0; k < DAY_COUNT; k++) { var q = r[CONC.dayCol - 1 + k]; qty.push(q === '' || q === null ? '' : Number(q) || 0); }
    out.push({ id: id, row: CONC.first + i, name: name, price: r[1] === '' ? '' : r[1], cost: r[2] === '' ? '' : r[2],
               active: (r[3] === '' || Number(r[3]) === 1) ? 1 : 0, qty: qty,
               sold: d[i][25], revenue: d[i][26], profit: d[i][27], needs: String(d[i][28] || '') });
  });
  return out;
}

// Starting list = the items in the owner's Square account (Nov 2026). Costs are left for him to fill in.
var CONC_SEED = [['Airheads', 1], ['Candy', 3], ['Chips', 2], ['Combo #1', 5], ['Combo #2', 5], ['Combo #3', 6],
                 ['Combo #4', 6], ['Combo #5', 7], ['Cookies', 2], ['Gatorade 12oz', 2], ['Gatorade 20oz', 3],
                 ['Hot Dogs', 2], ['Snack', 5], ['Soda', 2], ['Water', 1]];

/* ONE-TIME: run from the sheet's Kenny League menu → "Set up concession item list".
   Creates the Concessions tab, moves any old Gatorade/Skittles quantities onto it, and points
   the Daily Tracker's concession revenue (row 33) and item cost (row 43) at it. Safe to re-run. */
function setupConcessions() {
  var ss = SpreadsheetApp.getActive();
  var daily = ss.getSheetByName(SHEET.daily), setup = ss.getSheetByName(SHEET.setup);
  var sh = ss.getSheetByName(CONC.sheet), created = false;

  if (!sh) {
    created = true;
    sh = ss.insertSheet(CONC.sheet);
    sh.getRange('A1').setValue('Concession items. Add anything sold at the table (easiest on the website: Enter Data → Concessions). Price and cost can stay blank until an item sells. Active 1 = shown on game days. Columns F–Y = quantity sold each game day.');
    var head = ['Item', 'Price', 'Unit cost', 'Active', 'ID'];
    for (var n = 1; n <= DAY_COUNT; n++) head.push("='Daily Tracker'!" + colLetter_(DAY_FIRST_COL + n - 1) + '5');
    head.push('Sold (season)', 'Revenue', 'Profit', 'Needs');
    sh.getRange(2, 1, 1, head.length).setValues([head]).setFontWeight('bold').setWrap(true).setVerticalAlignment('top');
    sh.setFrozenRows(2); sh.setFrozenColumns(1);
    sh.getRange('B3:C300').setNumberFormat('$#,##0.00');
    sh.getRange('AA3:AB300').setNumberFormat('$#,##0.00');
    sh.getRange('A3:D300').setBackground('#fff2cc'); // yellow = editable, like the rest of the tracker

    var rows = CONC_SEED.map(function (it) { return { name: it[0], price: it[1], cost: '', active: 1, qty: null }; });

    // Carry over anything already entered in the old fixed rows (24 Large Gatorade, 27 Small, 30 Skittles).
    var old = [[24, 'Large Gatorade (old entries)', 'B16', 'B19'], [27, 'Small Gatorade (old entries)', 'B17', 'B20'],
               [30, 'Skittles (old entries)', 'B18', 'B21']];
    old.forEach(function (o) {
      var q = daily.getRange(o[0], DAY_FIRST_COL, 1, DAY_COUNT).getValues()[0];
      if (!q.some(function (x) { return Number(x) > 0; })) return;
      rows.push({ name: o[1], price: setup.getRange(o[2]).getValue(), cost: setup.getRange(o[3]).getValue(), active: 0, qty: q });
      daily.getRange(o[0], DAY_FIRST_COL, 1, DAY_COUNT).setValue(0);
    });

    rows.forEach(function (it, i) {
      var r = CONC.first + i;
      var vals = [it.name, it.price, it.cost, it.active, newConcId_()];
      for (var k = 0; k < DAY_COUNT; k++) vals.push(it.qty ? (it.qty[k] === '' ? '' : Number(it.qty[k]) || 0) : '');
      sh.getRange(r, 1, 1, 5 + DAY_COUNT).setValues([vals]);
      concRowFormulas_(r).forEach(function (f) { sh.getRange(f[0]).setFormula(f[1]); });
    });
  }

  // Refresh every item row's formulas (also adds the Needs column to a tab made by an older version).
  sh.getRange(2, 29).setValue('Needs').setFontWeight('bold');
  for (var rr = CONC.first; rr <= Math.max(sh.getLastRow(), CONC.first); rr++) {
    if (String(sh.getRange(rr, 1).getValue()).trim() === '') continue;
    concRowFormulas_(rr).forEach(function (f) { sh.getRange(f[0]).setFormula(f[1]); });
  }

  // Point the Daily Tracker at the Concessions tab (tracker column C ↔ Concessions column F, and so on).
  var rev = [[]], cost = [[]];
  for (var c = DAY_FIRST_COL; c < DAY_FIRST_COL + DAY_COUNT; c++) {
    var q = colLetter_(c + CONC.dayCol - DAY_FIRST_COL);
    rev[0].push('=ARRAYFORMULA(SUMPRODUCT(IFERROR(Concessions!$B$3:$B$300*1,0),IFERROR(Concessions!' + q + '$3:' + q + '$300*1,0)))');
    cost[0].push('=ARRAYFORMULA(SUMPRODUCT(IFERROR(Concessions!$C$3:$C$300*1,0),IFERROR(Concessions!' + q + '$3:' + q + '$300*1,0)))');
  }
  daily.getRange(33, DAY_FIRST_COL, 1, DAY_COUNT).setFormulas(rev);
  daily.getRange(43, DAY_FIRST_COL, 1, DAY_COUNT).setFormulas(cost);
  daily.getRange('A23').setValue('GAME CONCESSIONS (items and quantities now live on the Concessions tab)');
  daily.getRange('A33').setValue('Game concession revenue (Concessions tab)');
  daily.getRange('A43').setValue('Total concession item cost (Concessions tab)');
  daily.getRange('A24:A32').setFontColor('#999999');
  daily.getRange('A37:A42').setFontColor('#999999');
  var season = ss.getSheetByName('Season');
  if (season) season.getRange('A12').setValue('Concession prices and costs live on the Concessions tab.');
  setup.getRange('D16').setValue('Not used anymore: concession prices live on the Concessions tab.');

  SpreadsheetApp.flush();
  ss.toast(created ? 'Concessions tab created with ' + CONC_SEED.length + ' items. Add unit costs on the website.' :
                     'Concessions tab already existed; formulas re-linked.', 'Kenny League', 10);
}

/* ======================= Card fees =======================
   What Kenny charges:  tickets $7 + $1 once per card ticket order (2 tickets on one card = $15);
                        concessions + $1 on card orders under $5 (none at $5 or more).
   What Square charges: 2.3% + 15¢ per card sale (Setup B22 / B23).
   Run once from the sheet menu: Kenny League → Apply card fees. Reuses the old Gatorade/Skittles rows:
     Setup B16 = card fee per ticket order, B17 = card fee per concession order under $5
     Daily Tracker 24 = card ticket orders (input), 25 fee, 26 ticket fee revenue
     Daily Tracker 27 = card concession orders under $5 (input), 28 fee, 29 concession fee revenue
     Daily Tracker 21 = card tickets × price + ticket fees; 35 total revenue adds row 29
     Daily Tracker 62 = card sales base (tickets + fees + card share of concessions + concession fees)
     Daily Tracker 63 = base × rate + 15¢ × card payments (row 59, or ticket orders + small concession orders if 0)
   Safe to run again: never overwrites values already entered. */
function setupCardFee() {
  var ss = SpreadsheetApp.getActive();
  var setup = ss.getSheetByName(SHEET.setup), dt = ss.getSheetByName(SHEET.daily),
      web = ss.getSheetByName(SHEET.web), season = ss.getSheetByName('Season');
  var ticketDone = String(setup.getRange('A16').getValue()).trim() === 'Card fee per ticket order' ||
                   String(setup.getRange('A16').getValue()).trim() === 'Card fee per order';
  var concDone = String(setup.getRange('A17').getValue()).trim() === 'Card fee per concession order under $5';
  var YELLOW = '#fff2cc', BLACK = '#000000', MONEY = '$#,##0.00', last = DAY_FIRST_COL + DAY_COUNT - 1;
  function cols(row) { return dt.getRange(row, DAY_FIRST_COL, 1, DAY_COUNT); }
  function f(tpl) { var o = []; for (var c = DAY_FIRST_COL; c <= last; c++) o.push(tpl.replace(/\{c\}/g, colLetter_(c))); return [o]; }
  function label(sh, a1, text) { sh.getRange(a1).setValue(text).setFontColor(BLACK); }

  // ---- Setup ----
  label(setup, 'A15', 'Ticket price: card (per ticket, before fee)');
  setup.getRange('D15').setValue('Usually the same as cash. The card fee is added once per card order.');
  label(setup, 'A16', 'Card fee per ticket order');
  setup.getRange('D16').setValue('Added once per card payment, however many tickets: 2 tickets on one card = $7 + $7 + $1 = $15.');
  label(setup, 'A17', 'Card fee per concession order under $5');
  setup.getRange('D17').setValue('Added to card concession orders under $5. Orders of $5 or more have no fee.');
  setup.getRange('B16:B17').setBackground(YELLOW).setFontColor(BLACK).setNumberFormat(MONEY);
  label(setup, 'A22', 'Square rate per card sale');
  setup.getRange('D22').setValue('Square charges 2.3% + 15¢ per card sale (from Kenny). Applied to all card sales, fees included.');
  label(setup, 'A23', 'Square fixed fee per card sale');
  setup.getRange('D23').setValue('15¢ on every card payment (Daily Tracker row 59).');
  if (!ticketDone) {
    if (Number(setup.getRange('B15').getValue()) === 8) setup.getRange('B15').setValue(7);
    setup.getRange('B16').setValue(1);
  }
  if (!concDone) {
    setup.getRange('B17').setValue(1);
    // Kenny's Square terms; only replace the old placeholder values (2.5%, $0).
    if (Number(setup.getRange('B22').getValue()) === 0.025) setup.getRange('B22').setValue(0.023);
    if (Number(setup.getRange('B23').getValue()) === 0) setup.getRange('B23').setValue(0.15);
  }

  // ---- Daily Tracker: ticket fee ----
  label(dt, 'A19', 'Card tickets sold');
  label(dt, 'A21', 'Card admission revenue (tickets + card fees)');
  label(dt, 'A23', 'CARD FEES WE CHARGE ($1 per order)');
  label(dt, 'A24', 'Card ticket orders (one per card payment)');
  label(dt, 'A25', 'Card fee per ticket order');
  label(dt, 'A26', 'Ticket card fee revenue');
  if (!ticketDone) {
    // Keep past totals unchanged: old math was tickets × $8, i.e. one $1 fee per ticket.
    cols(24).setValues(cols(19).getValues().map(function (r) { return r.map(function (v) { return Number(v) || 0; }); }));
  }
  cols(24).setBackground(YELLOW).setFontColor(BLACK).setNumberFormat('0');
  cols(25).setFormulas(f('=Setup!$B$16')).setBackground(null).setFontColor(BLACK).setNumberFormat(MONEY);
  cols(26).setFormulas(f('={c}24*{c}25')).setBackground(null).setFontColor(BLACK).setNumberFormat(MONEY);
  cols(21).setFormulas(f('={c}19*{c}20+{c}26'));

  // ---- Daily Tracker: concession fee (orders under $5) ----
  label(dt, 'A27', 'Card concession orders under $5');
  label(dt, 'A28', 'Card fee per concession order under $5');
  label(dt, 'A29', 'Concession card fee revenue');
  if (!concDone) cols(27).setValue(0); // old Small Gatorade quantities were already moved to the Concessions tab
  cols(27).setBackground(YELLOW).setFontColor(BLACK).setNumberFormat('0');
  cols(28).setFormulas(f('=Setup!$B$17')).setBackground(null).setFontColor(BLACK).setNumberFormat(MONEY);
  cols(29).setFormulas(f('={c}27*{c}28')).setBackground(null).setFontColor(BLACK).setNumberFormat(MONEY);
  label(dt, 'A35', 'TOTAL EVENT REVENUE');
  cols(35).setFormulas(f(CARD_FEE_FORMULAS.revenue));

  // ---- Daily Tracker: what Square charges ----
  label(dt, 'A59', 'All card payments (0 = ticket orders + small concession orders)');
  label(dt, 'A60', 'Square rate per card sale');
  label(dt, 'A61', 'Square fixed fee per card sale');
  label(dt, 'A62', 'Card sales total (tickets, fees, card share of concessions)');
  label(dt, 'A63', 'Square card fees (2.3% + 15¢ per sale)');
  cols(62).setFormulas(f('=IF(ISNUMBER({c}35),{c}21+{c}33*{c}58+{c}29,"Set small price")'));
  cols(63).setFormulas(f(CARD_FEE_FORMULAS.squareFees));

  // Old item-cost rows that multiplied rows 24/27; not in any total, blank them so they can't mislead.
  [40, 41].forEach(function (r) { dt.getRange(r, 1).setValue('(not used)').setFontColor('#999999'); cols(r).setValue(0); });

  // ---- Season: concession card fees count as revenue ----
  label(season, 'A20', 'Card fees on concession orders under $5');
  season.getRange('B20').setFormula("=SUM('Daily Tracker'!C29:V29)").setNumberFormat(MONEY);
  label(season, 'A37', 'Square card fees');

  // ---- Web outputs for the dashboard ----
  if (web) {
    var rows = web.getDataRange().getValues(), keys = rows.map(function (r) { return String(r[1]).trim(); });
    // Reuse the row if the key exists, else take over an old Gatorade/Skittles row, else add a row at the end.
    function put(key, section, text, formula, oldRow) {
      var r = keys.indexOf(key) + 1;
      if (!r && oldRow && /gatorade|skittles/.test(keys[oldRow - 1] || '')) r = oldRow;
      if (!r) r = Math.max(web.getLastRow(), keys.length) + 1;
      web.getRange(r, 1, 1, 4).setValues([[section, key, text, formula]]);
      web.getRange(r, 4).setNumberFormat(MONEY);
      keys[r - 1] = key;
    }
    put('card_fee_order', 'setup', 'Card fee per ticket order', '=Setup!B16', 83);
    put('conc_card_fee', 'setup', 'Card fee per concession order under $5', '=Setup!B17', 84);
    put('card_fee_txn', 'setup', 'Square fixed fee per card sale', '=Setup!B23');
    put('rev_conc_card_fees', 'revenue', 'Card fees on concession orders under $5', '=Season!B20');
  }

  SpreadsheetApp.flush();
  ss.toast('Card fees set: tickets $' + setup.getRange('B15').getValue() + ' + $' + setup.getRange('B16').getValue() +
           ' per card order; concessions + $' + setup.getRange('B17').getValue() + ' on card orders under $5; Square ' +
           (Number(setup.getRange('B22').getValue()) * 100).toFixed(1) + '% + $' + Number(setup.getRange('B23').getValue()).toFixed(2) + ' per sale.',
           'Kenny League', 10);
}
