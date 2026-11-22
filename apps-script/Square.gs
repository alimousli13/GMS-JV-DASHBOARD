/* =====================================================================
   Square → sheet sync
   ---------------------------------------------------------------------
   Pulls every Square sale and fills the game-day numbers, so nobody has
   to count tickets, snacks or card fees by hand.

   SETUP (one time, by Ali or Kenny):
     Apps Script → Project Settings → Script properties → Add property
       SQUARE_TOKEN = the Square Production access token
     (Never put the token in this file, GitHub, chat, text or email.)
     Then in the Google Sheet: Kenny League → Turn on nightly Square sync.

   WHAT IT FILLS, per game day that has Square sales (Daily Tracker rows):
     16 cash tickets · 19 card tickets · 24 card ticket orders with the $1 fee
     27 card concession orders with the $1 fee (no ticket in the order)
     30 Square's actual fees · 32 other Square sales (custom amounts, passes)
     59 card payments · Concessions tab: quantity of each item sold
   Items sold in Square that aren't on the Concessions tab are added to it.

   WHICH DAY A SALE COUNTS FOR:
     In-person sales count on the game day they happened. Sales on days with
     no games are skipped (listed in the sync summary), except online tickets,
     which count for the next game day within 14 days.
   Days with no Square sales are left exactly as typed.
   ===================================================================== */

var SQ = {
  api: 'https://connect.squareup.com/v2',
  version: '2025-01-23',
  rows: { cash: 16, card: 19, cardOrders: 24, concSmall: 27, fees: 30, other: 32, cardTxns: 59 },
  dateRow: 9, headRow: 5,
  onlineLookbackDays: 14,
  ticket: /ticket/i,
  online: /online/i,
  pass: /season/i,
  prop: 'SQUARE_LAST_SYNC'
};

/* ---------- Entry points ---------- */

// Sheet menu: Kenny League → Sync Square now
function squareSyncNow() {
  var ss = SpreadsheetApp.getActive();
  try {
    var r = squareSync_();
    ss.toast(r.text, 'Square sync', 15);
  } catch (e) {
    ss.toast(String(e.message || e), 'Square sync failed', 20);
    throw e;
  }
}

// Sheet menu: Kenny League → Turn on nightly Square sync (also runs once now)
function squareTurnOnNightly() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'squareSyncNightly') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('squareSyncNightly').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
  squareSyncNow();
  SpreadsheetApp.getActive().toast('Nightly Square sync is on (about 11:30 PM every night).', 'Square sync', 10);
}

// Time trigger. Errors are saved so the Enter Data page can show them.
function squareSyncNightly() {
  try { squareSync_(); } catch (e) { /* recorded by squareSync_ */ }
}

// Status for the Enter Data page (no secrets).
function squareStatus_() {
  var props = PropertiesService.getScriptProperties();
  var last = null;
  try { last = JSON.parse(props.getProperty(SQ.prop) || 'null'); } catch (e) {}
  return { connected: !!props.getProperty('SQUARE_TOKEN'), last: last };
}

/* ---------- The sync ---------- */

function squareSync_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SQUARE_TOKEN')) throw new Error('SQUARE_TOKEN is not set (Apps Script → Project Settings → Script properties).');
  var ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sqPrepareSheet_(ss);
    var days = sqGameDays_(ss, tz);
    if (!days.length) throw new Error('No game-day dates found on the Daily Tracker.');

    var start = new Date(new Date(days[0].date + 'T00:00:00').getTime() - SQ.onlineLookbackDays * 86400000);
    var end = new Date();
    var locs = sqLocationIds_();
    var orders = sqOrders_(locs, start.toISOString(), end.toISOString());
    var fees = sqFees_(locs, start.toISOString(), end.toISOString());

    var agg = sqAggregate_(orders, fees, days, tz);
    var newItems = sqWrite_(ss, agg, days);

    var touched = days.filter(function (d) { return agg.byDay[d.idx]; });
    var summary = {
      ok: true,
      at: Utilities.formatDate(new Date(), tz, 'MMM d, h:mm a'),
      orders: agg.counted,
      days: touched.map(function (d) { var a = agg.byDay[d.idx]; return { n: d.idx + 1, label: d.label, orders: a.orders, sales: Math.round(a.sales * 100) / 100 }; }),
      skipped: { orders: agg.skipped, amount: Math.round(agg.skippedAmt * 100) / 100 },
      newItems: newItems
    };
    summary.text = 'Synced ' + summary.orders + ' Square sale' + (summary.orders === 1 ? '' : 's') + ' into ' +
      touched.length + ' game day' + (touched.length === 1 ? '' : 's') + '.' +
      (newItems.length ? ' New concession items added: ' + newItems.join(', ') + ' (add their cost).' : '') +
      (agg.skipped ? ' Skipped ' + agg.skipped + ' sale' + (agg.skipped === 1 ? '' : 's') + ' ($' + summary.skipped.amount.toFixed(2) + ') on days with no games.' : '');
    props.setProperty(SQ.prop, JSON.stringify(summary));
    getLogSheet_(ss).appendRow([new Date(), 'Square sync', 'Square sync', '', summary.text]);
    return summary;
  } catch (e) {
    props.setProperty(SQ.prop, JSON.stringify({ ok: false, at: Utilities.formatDate(new Date(), tz, 'MMM d, h:mm a'), error: String(e.message || e) }));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Square API ---------- */

function sqFetch_(method, path, body) {
  var opts = {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('SQUARE_TOKEN'),
               'Square-Version': SQ.version, Accept: 'application/json' }
  };
  if (body) opts.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(SQ.api + path, opts);
  var code = res.getResponseCode(), json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  if (code === 401) throw new Error('Square rejected the token. Check that SQUARE_TOKEN is the Production access token.');
  if (code === 403) throw new Error('The Square token is missing a permission (needs Orders, Payments and Merchant profile read).');
  if (code >= 300) {
    var err = json.errors && json.errors[0];
    throw new Error('Square error: ' + ((err && (err.detail || err.code)) || ('HTTP ' + code)));
  }
  return json;
}

function sqLocationIds_() {
  var j = sqFetch_('get', '/locations');
  var ids = (j.locations || []).filter(function (l) { return l.status !== 'INACTIVE'; }).map(function (l) { return l.id; });
  if (!ids.length) throw new Error('No active Square locations found for this token.');
  return ids.slice(0, 10);
}

function sqOrders_(locs, startIso, endIso) {
  var out = [], cursor = null, guard = 0;
  do {
    var body = {
      location_ids: locs, limit: 500,
      query: {
        filter: { date_time_filter: { created_at: { start_at: startIso, end_at: endIso } },
                  state_filter: { states: ['COMPLETED', 'OPEN'] } },
        sort: { sort_field: 'CREATED_AT', sort_order: 'ASC' }
      }
    };
    if (cursor) body.cursor = cursor;
    var j = sqFetch_('post', '/orders/search', body);
    out = out.concat(j.orders || []);
    cursor = j.cursor;
  } while (cursor && ++guard < 50);
  return out;
}

// Square's processing fees, totalled per order.
function sqFees_(locs, startIso, endIso) {
  var byOrder = {};
  locs.forEach(function (loc) {
    var cursor = null, guard = 0;
    do {
      var q = '/payments?location_id=' + encodeURIComponent(loc) + '&begin_time=' + encodeURIComponent(startIso) +
              '&end_time=' + encodeURIComponent(endIso) + '&limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      var j = sqFetch_('get', q);
      (j.payments || []).forEach(function (p) {
        if (p.status !== 'COMPLETED' || !p.order_id) return;
        var fee = (p.processing_fee || []).reduce(function (s, f) { return s + sqMoney_(f.amount_money); }, 0);
        byOrder[p.order_id] = (byOrder[p.order_id] || 0) + fee;
      });
      cursor = j.cursor;
    } while (cursor && ++guard < 100);
  });
  return byOrder;
}

function sqMoney_(m) { return m && m.amount ? Number(m.amount) / 100 : 0; }
function sqNorm_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/* ---------- Sorting sales into game days ---------- */

function sqGameDays_(ss, tz) {
  var dt = ss.getSheetByName(SHEET.daily);
  var dates = dt.getRange(SQ.dateRow, DAY_FIRST_COL, 1, DAY_COUNT).getValues()[0];
  var heads = dt.getRange(SQ.headRow, DAY_FIRST_COL, 1, DAY_COUNT).getDisplayValues()[0];
  var out = [];
  dates.forEach(function (v, i) {
    if (!(v instanceof Date)) return;
    out.push({ idx: i, date: Utilities.formatDate(v, tz, 'yyyy-MM-dd'), label: String(heads[i] || ('Day ' + (i + 1))).split('\n')[0] });
  });
  return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function sqAggregate_(orders, feesByOrder, days, tz) {
  var byDate = {}; days.forEach(function (d) { byDate[d.date] = d; });
  var res = { byDay: {}, counted: 0, skipped: 0, skippedAmt: 0, prices: {}, names: {} };

  orders.forEach(function (o) {
    var tenders = (o.tenders || []).filter(function (t) { return t.type !== 'NO_SALE'; });
    if (!tenders.length) return; // not paid
    var total = sqMoney_(o.total_money);
    var lines = o.line_items || [];
    var isOnlineTicket = lines.some(function (li) { return SQ.ticket.test(li.name || '') && SQ.online.test(li.name || ''); });

    var date = Utilities.formatDate(new Date(o.created_at), tz, 'yyyy-MM-dd');
    var day = byDate[date];
    if (!day && isOnlineTicket) {
      day = days.filter(function (d) {
        var gap = (new Date(d.date + 'T00:00:00') - new Date(date + 'T00:00:00')) / 86400000;
        return gap >= 0 && gap <= SQ.onlineLookbackDays;
      })[0];
    }
    if (!day) { res.skipped++; res.skippedAmt += total; return; }

    var a = res.byDay[day.idx] = res.byDay[day.idx] ||
      { cash: 0, card: 0, cardOrders: 0, concSmall: 0, cardTxns: 0, fees: 0, other: 0, conc: {}, orders: 0, sales: 0 };
    res.counted++; a.orders++; a.sales += total;

    var cashAmt = 0, cardAmt = 0, cardTenders = 0;
    tenders.forEach(function (t) {
      if (t.type === 'CASH') cashAmt += sqMoney_(t.amount_money);
      else { cardAmt += sqMoney_(t.amount_money); cardTenders++; }
    });
    var isCard = cardAmt > cashAmt;

    var tickets = 0;
    lines.forEach(function (li) {
      var name = String(li.name || '').trim();
      var qty = Math.round(Number(li.quantity) || 0);
      var lineTotal = sqMoney_(li.gross_sales_money || li.total_money);
      if (li.item_type === 'CUSTOM_AMOUNT' || !name) { a.other += lineTotal; return; }
      if (SQ.ticket.test(name)) { tickets += qty; return; }
      if (SQ.pass.test(name)) { a.other += lineTotal; return; }
      var key = sqNorm_(name);
      a.conc[key] = (a.conc[key] || 0) + qty;
      res.names[key] = name;
      if (li.base_price_money) res.prices[key] = sqMoney_(li.base_price_money);
    });
    if (isCard) a.card += tickets; else a.cash += tickets;

    var charged = (o.service_charges || []).reduce(function (s, c) {
      return s + sqMoney_(c.total_money || c.applied_money || c.amount_money);
    }, 0) > 0;
    if (charged && isCard) { if (tickets > 0) a.cardOrders++; else a.concSmall++; }

    a.cardTxns += cardTenders;
    a.fees += feesByOrder[o.id] || 0;
  });
  return res;
}

/* ---------- Writing to the sheet ---------- */

function sqWrite_(ss, agg, days) {
  var dt = ss.getSheetByName(SHEET.daily);
  var idxs = Object.keys(agg.byDay).map(Number);
  if (!idxs.length) return [];

  // Daily Tracker rows: read each row once, change synced days only, write back.
  var map = { cash: SQ.rows.cash, card: SQ.rows.card, cardOrders: SQ.rows.cardOrders, concSmall: SQ.rows.concSmall,
              fees: SQ.rows.fees, other: SQ.rows.other, cardTxns: SQ.rows.cardTxns };
  Object.keys(map).forEach(function (k) {
    var rng = dt.getRange(map[k], DAY_FIRST_COL, 1, DAY_COUNT), vals = rng.getValues();
    idxs.forEach(function (i) {
      var v = agg.byDay[i][k];
      vals[0][i] = (k === 'fees' || k === 'other') ? Math.round(v * 100) / 100 : v;
    });
    rng.setValues(vals);
  });

  // Concessions tab: match by name, add anything new, then set each synced day's quantities.
  var sh = ss.getSheetByName(CONC.sheet);
  if (!sh) { setupConcessions(); sh = ss.getSheetByName(CONC.sheet); }
  var items = readConcessions_(ss), byName = {};
  items.forEach(function (it) { byName[sqNorm_(it.name)] = it.row; });

  var sold = {};
  idxs.forEach(function (i) { Object.keys(agg.byDay[i].conc).forEach(function (k) { sold[k] = true; }); });
  var nextRow = items.reduce(function (mx, it) { return Math.max(mx, it.row + 1); }, CONC.first);
  var added = [];
  Object.keys(sold).forEach(function (k) {
    if (byName[k] || nextRow > CONC.last) return;
    var row = nextRow++;
    sh.getRange(row, 1, 1, 5).setValues([[agg.names[k], agg.prices[k] || '', '', 1, newConcId_()]]);
    concRowFormulas_(row).forEach(function (f) { sh.getRange(f[0]).setFormula(f[1]); });
    byName[k] = row; added.push(agg.names[k]);
  });

  var last = Math.max(nextRow - 1, CONC.first);
  var qtyRng = sh.getRange(CONC.first, CONC.dayCol, last - CONC.first + 1, DAY_COUNT), qty = qtyRng.getValues();
  var names = sh.getRange(CONC.first, 1, last - CONC.first + 1, 1).getValues();
  names.forEach(function (n, r) {
    var k = sqNorm_(n[0]);
    if (!k) return;
    idxs.forEach(function (i) { qty[r][i] = agg.byDay[i].conc[k] || 0; });
  });
  qtyRng.setValues(qty);
  return added;
}

/* ---------- One-time sheet prep (safe to repeat) ----------
   Reuses the last old Skittles rows: 30 = Square's actual fees, 32 = other Square sales.
   Row 63 (Square card fees) uses the actual fees when a day is synced, else the 2.3% + 15¢ estimate. */
function sqPrepareSheet_(ss) {
  var dt = ss.getSheetByName(SHEET.daily), season = ss.getSheetByName('Season');
  if (String(dt.getRange('A30').getValue()).trim() === 'Square fees, actual (Square sync)') return;
  var last = DAY_FIRST_COL + DAY_COUNT - 1, BLACK = '#000000', MONEY = '$#,##0.00';
  function cols(row) { return dt.getRange(row, DAY_FIRST_COL, 1, DAY_COUNT); }
  function f(tpl) { var o = []; for (var c = DAY_FIRST_COL; c <= last; c++) o.push(tpl.replace(/\{c\}/g, colLetter_(c))); return [o]; }

  dt.getRange('A30').setValue('Square fees, actual (Square sync)').setFontColor(BLACK);
  cols(30).setValue(0).setNumberFormat(MONEY).setFontColor(BLACK);
  dt.getRange('A31').setValue('(not used)').setFontColor('#999999');
  cols(31).setValue(0);
  dt.getRange('A32').setValue('Other Square sales (custom amounts, passes)').setFontColor(BLACK);
  cols(32).setValue(0).setNumberFormat(MONEY).setFontColor(BLACK);
  dt.getRange('A42').setValue('(not used)').setFontColor('#999999');
  cols(42).setValue(0);
  cols(35).setFormulas(f(CARD_FEE_FORMULAS.revenue));
  dt.getRange('A63').setValue('Square card fees (actual when synced, else 2.3% + 15¢ estimate)');
  cols(63).setFormulas(f(CARD_FEE_FORMULAS.squareFees));
  if (season) {
    season.getRange('A21').setValue('Other event revenue (incl. other Square sales)');
    season.getRange('B21').setFormula("=SUM('Daily Tracker'!C34:V34)+SUM('Daily Tracker'!C32:V32)");
  }
  SpreadsheetApp.flush();
}
