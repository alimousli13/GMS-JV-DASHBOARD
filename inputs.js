/*
  Enter Data page.
  Reads current inputs from the Apps Script API (API_URL in config.js), lets the
  owner edit them, and POSTs only the changed fields back to the Google Sheet.
  No math happens here — the sheet recalculates and sends back fresh numbers.
  To add a new editable field: add it to FIELDS / DAILY_FIELDS in apps-script/Code.gs
  and redeploy. This page builds its forms from what the API returns.
*/
(function () {
  "use strict";

  var API = typeof API_URL === "string" ? API_URL.trim() : "";
  var PASS_KEY = "kl_edit_passcode";
  var DAY_KEY = "kl_last_day";

  var state = {
    data: null,
    original: {},   // key -> string value as loaded
    edits: {},      // key -> string value the user typed
    meta: {},       // key -> field meta
    dayN: null,
    passcode: "",
    newConc: [],    // temp ids of concession items added but not saved yet
    newCount: 0
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- storage (wrapped: can be blocked) ---------- */
  function sGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function sDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  /* ---------- status ---------- */
  function status(msg, kind) {
    var el = $("in-status");
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = "in-status" + (kind ? " is-" + kind : "");
  }

  /* ---------- API ---------- */
  function api(body) {
    var url = API + (API.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
    if (!body && typeof READ_KEY === "string" && READ_KEY) url += "&key=" + encodeURIComponent(READ_KEY);
    // POST body is sent as text/plain so the browser skips the CORS preflight Apps Script can't answer.
    var opts = body ? { method: "POST", body: JSON.stringify(body) } : {};
    return fetch(url, opts)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.ok) throw new Error((json && json.error) || "Request failed");
        return json;
      });
  }

  /* ---------- data ---------- */
  function str(v) { return v === null || v === undefined ? "" : String(v); }

  function ingest(data) {
    state.data = data;
    state.original = {};
    state.meta = {};
    data.fields.concat(data.rentals).forEach(function (f) {
      state.original[f.key] = str(f.value);
      state.meta[f.key] = f;
    });
    data.days.forEach(function (d) {
      data.dailyFields.forEach(function (f) {
        var key = "day" + d.n + "_" + f.field;
        state.original[key] = str(d.values[f.field]);
        state.meta[key] = { key: key, label: f.label, type: f.type, group: f.group, hint: f.hint || "" };
      });
    });
    // Concession items: name/price/cost/on-off, plus a quantity per item per game day
    (data.concessions || []).forEach(function (it) {
      concMeta(it.id, it.name);
      [["name", it.name], ["price", it.price], ["cost", it.cost], ["active", it.active]].forEach(function (p) {
        state.original["citem:" + it.id + ":" + p[0]] = str(p[1]);
      });
      data.days.forEach(function (d) {
        var key = "conc_" + d.n + "_" + it.id;
        state.original[key] = str(d.conc ? d.conc[it.id] : "");
        state.meta[key] = { key: key, label: it.name, type: "int", group: "Concessions sold",
                            hint: it.price === "" ? "No price yet (fine until it sells)" : money(it.price) + " each" };
      });
    });
    state.newConc = [];
    $("in-server-time").textContent = data.serverTime || "—";
    if (state.dayN === null || !findDay(state.dayN)) state.dayN = pickStartDay(data.days);
  }

  // Sheet display values usually arrive formatted ("$75.00"); format bare numbers the same way.
  function money(v) {
    var s = String(v === null || v === undefined ? "" : v).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(s));
  }

  function concMeta(id, name) {
    var label = name || "New item";
    state.meta["citem:" + id + ":name"] = { key: "citem:" + id + ":name", label: label + " name", type: "text", placeholder: "Item name" };
    state.meta["citem:" + id + ":price"] = { key: "citem:" + id + ":price", label: label + " price", type: "money", placeholder: "optional" };
    state.meta["citem:" + id + ":cost"] = { key: "citem:" + id + ":cost", label: label + " cost", type: "money", placeholder: "optional" };
    state.meta["citem:" + id + ":active"] = { key: "citem:" + id + ":active", label: label + " selling", type: "bool" };
  }

  function findConc(id) {
    var list = (state.data && state.data.concessions) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function findDay(n) {
    var days = state.data ? state.data.days : [];
    for (var i = 0; i < days.length; i++) if (days[i].n === n) return days[i];
    return null;
  }

  function pickStartDay(days) {
    var saved = Number(sGet(DAY_KEY));
    if (saved && days.some(function (d) { return d.n === saved; })) return saved;
    for (var i = 0; i < days.length; i++) if (Number(days[i].values.completed) !== 1) return days[i].n;
    return days.length ? days[0].n : null;
  }

  function current(key) { return Object.prototype.hasOwnProperty.call(state.edits, key) ? state.edits[key] : state.original[key]; }

  function isValid(type, v) {
    if (type === "bool" || type === "date") return true;
    if (type === "text") { var t = String(v).trim(); return t !== "" && t.length <= 60 && !/^[=+@\-]/.test(t); }
    var s = String(v).trim();
    if (s === "") return true;
    var n = Number(s.replace(/[$,%\s]/g, ""));
    if (!isFinite(n) || n < 0) return false;
    if (type === "int" && Math.floor(n) !== n) return false;
    if (type === "percent" && n > 100) return false;
    return true;
  }

  function setEdit(key, value, wrap) {
    if (value === state.original[key]) delete state.edits[key];
    else state.edits[key] = value;
    if (wrap) {
      wrap.classList.toggle("is-changed", Object.prototype.hasOwnProperty.call(state.edits, key));
      wrap.classList.toggle("is-invalid", !isValid(state.meta[key].type, value));
    }
    updateSaveBar();
    if (key.indexOf("day") === 0 || key.indexOf("conc_") === 0) refreshDayOptions();
    if (/^citem:.*:active$/.test(key)) renderDays();
  }

  /* ---------- rendering ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fieldControl(meta, compact) {
    var key = meta.key;
    if (meta.readonly) {
      var ro = el("div", "in-field is-readonly" + (compact ? " is-compact" : ""));
      ro.appendChild(el("span", "in-readonly", money(state.original[key])));
      ro.title = "Calculated from the schedule";
      return ro;
    }
    var wrap = el("div", "in-field" + (compact ? " is-compact" : ""));
    var id = "f-" + key;
    var value = current(key);

    if (meta.type === "bool") {
      wrap.classList.add("is-bool");
      var cb = el("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.checked = value === "1";
      var lab = el("label", "in-bool-label");
      lab.htmlFor = id;
      lab.appendChild(cb);
      if (compact) cb.setAttribute("aria-label", meta.label);
      else lab.appendChild(document.createTextNode(" " + meta.label));
      wrap.appendChild(lab);
      cb.addEventListener("change", function () { setEdit(key, cb.checked ? "1" : "0", wrap); });
    } else {
      if (!compact) {
        var label = el("label", "in-label", meta.label);
        label.htmlFor = id;
        wrap.appendChild(label);
      }
      var row = el("div", "in-input-row");
      if (meta.type === "money") row.appendChild(el("span", "in-affix", "$"));
      var input = el("input");
      input.id = id;
      input.value = value;
      if (compact) input.setAttribute("aria-label", meta.label);
      if (meta.type === "date") {
        input.type = "date";
      } else {
        input.type = "text";
        input.inputMode = meta.type === "int" ? "numeric" : meta.type === "text" ? "text" : "decimal";
        input.autocomplete = "off";
        input.placeholder = meta.placeholder || (meta.type === "int" ? "0" : meta.type === "text" ? "" : "0.00");
        if (meta.type === "text") input.maxLength = 60;
      }
      row.appendChild(input);
      if (meta.type === "percent") row.appendChild(el("span", "in-affix", "%"));
      wrap.appendChild(row);
      input.addEventListener("input", function () { setEdit(key, input.value.trim(), wrap); });
      if (meta.hint && !compact) wrap.appendChild(el("p", "in-hint", meta.hint));
    }
    if (Object.prototype.hasOwnProperty.call(state.edits, key)) wrap.classList.add("is-changed");
    return wrap;
  }

  function renderGroups(container, metas) {
    container.innerHTML = "";
    var groups = [], byGroup = {};
    metas.forEach(function (m) {
      if (!byGroup[m.group]) { byGroup[m.group] = []; groups.push(m.group); }
      byGroup[m.group].push(m);
    });
    groups.forEach(function (g) {
      var card = el("fieldset", "card in-group");
      card.appendChild(el("legend", "", g));
      var grid = el("div", "in-grid");
      byGroup[g].forEach(function (m) { grid.appendChild(fieldControl(m)); });
      card.appendChild(grid);
      container.appendChild(card);
    });
  }

  function dayHasEdits(n) {
    var prefix = "day" + n + "_";
    return Object.keys(state.edits).some(function (k) { return k.indexOf(prefix) === 0; });
  }

  function dayOptionText(d) {
    var done = current("day" + d.n + "_completed") === "1";
    return (dayHasEdits(d.n) ? "• " : "") + d.label + (d.date ? " · " + d.date : "") + (done ? "  ✓" : "");
  }

  function refreshDayOptions() {
    var sel = $("in-day-select");
    for (var i = 0; i < sel.options.length; i++) {
      var d = findDay(Number(sel.options[i].value));
      if (d) sel.options[i].textContent = dayOptionText(d);
    }
  }

  function renderDays() {
    var days = state.data.days;
    var sel = $("in-day-select");
    sel.innerHTML = "";
    days.forEach(function (d) {
      var o = el("option", "", dayOptionText(d));
      o.value = String(d.n);
      sel.appendChild(o);
    });
    sel.value = String(state.dayN);

    var all = $("in-alldays");
    if (all && window.KLDayTable) {
      window.KLDayTable.render(all, state.data, {
        selected: state.dayN,
        edited: dayHasEdits,
        onPick: function (n) {
          goDay(n);
          var bar = document.querySelector(".in-day-bar");
          if (bar) bar.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    var d = findDay(state.dayN);
    var sum = $("in-day-summary");
    sum.innerHTML = "";
    if (!d) return;
    [["Date", d.date || "Set first Tuesday"], ["Games", d.games], ["Day revenue", money(d.revenue)],
     ["Day cost", money(d.cost)], ["Day net income", money(d.net)]].forEach(function (pair, i) {
      var k = el("article", "kpi");
      k.appendChild(el("p", "kpi-label", pair[0]));
      var v = el("p", "kpi-value num", pair[1] === "" ? "—" : pair[1]);
      if (i === 4) {
        var n = Number(String(pair[1]).replace(/[$,\s()]/g, ""));
        if (/\(|^-/.test(String(pair[1]))) v.classList.add("negative");
        else if (n > 0) v.classList.add("positive");
        if (!isFinite(n)) v.classList.add("warn-badge");
      }
      k.appendChild(v);
      sum.appendChild(k);
    });

    var fields = state.data.dailyFields, metas = [], conc = concMetasForDay(d.n), placed = false;
    fields.forEach(function (f, i) {
      metas.push(state.meta["day" + d.n + "_" + f.field]);
      var lastAdmission = f.group === "Admissions" && (!fields[i + 1] || fields[i + 1].group !== "Admissions");
      if (lastAdmission) { metas = metas.concat(conc); placed = true; }
    });
    if (!placed) metas = metas.concat(conc);
    renderGroups($("in-day-fields"), metas);

    $("in-day-prev").disabled = days[0].n === d.n;
    $("in-day-next").disabled = days[days.length - 1].n === d.n;
  }

  function renderRentals() {
    var body = $("in-rent-body");
    body.innerHTML = "";
    var weeks = {};
    var order = [];
    state.data.rentals.forEach(function (r) {
      if (!weeks[r.week]) { weeks[r.week] = {}; order.push(r.week); }
      weeks[r.week][r.part] = r;
    });
    order.forEach(function (w) {
      var tr = el("tr");
      tr.appendChild(el("th", "", "Week " + w));
      ["court", "church", "other"].forEach(function (part) {
        var td = el("td");
        var r = weeks[w][part];
        if (r) td.appendChild(fieldControl(state.meta[r.key], true));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  // Items to show on a game day: everything switched on, plus anything already sold that day
  function concMetasForDay(n) {
    return ((state.data && state.data.concessions) || []).filter(function (it) {
      var qty = Number(current("conc_" + n + "_" + it.id)) || 0;
      return current("citem:" + it.id + ":active") === "1" || qty > 0;
    }).map(function (it) {
      var m = state.meta["conc_" + n + "_" + it.id];
      m.label = current("citem:" + it.id + ":name") || it.name;
      return m;
    });
  }

  function renderConc() {
    var body = $("in-conc-body");
    if (!body) return;
    body.innerHTML = "";
    var list = ((state.data && state.data.concessions) || []).slice();
    list.sort(function (a, b) { return (Number(b.active) || 0) - (Number(a.active) || 0); });
    var ids = list.map(function (it) { return it.id; }).concat(state.newConc);
    if (!ids.length) {
      var tr0 = el("tr"), td0 = el("td", "placeholder", "No items yet. Click + Add item.");
      td0.colSpan = 5; tr0.appendChild(td0); body.appendChild(tr0);
    }
    ids.forEach(function (id) {
      var tr = el("tr");
      ["name", "price", "cost", "active"].forEach(function (f) {
        var td = el("td", "in-conc-" + f);
        var w = fieldControl(state.meta["citem:" + id + ":" + f], true);
        var itm = findConc(id);
        if (itm && itm.needs === f && current("citem:" + id + ":" + f) === "") w.classList.add("is-missing");
        td.appendChild(w);
        tr.appendChild(td);
      });
      var it = findConc(id);
      var sold = el("td", "num in-conc-sold", it ? (it.sold === "" ? "0" : String(it.sold)) : "New");
      if (it && it.needs) sold.appendChild(el("span", "in-needs", "add " + it.needs));
      tr.appendChild(sold);
      body.appendChild(tr);
    });
    var box = $("in-conc-needs");
    if (box) {
      var msg = concNeedsMessage();
      box.hidden = !msg;
      box.textContent = msg;
    }
  }

  // Card fee is once per card order. Flag days where orders look wrong (never blocks saving).
  function cardOrderMessage() {
    var notes = [];
    ((state.data && state.data.days) || []).forEach(function (d) {
      var t = Number(current("day" + d.n + "_card_adm")) || 0, o = Number(current("day" + d.n + "_card_orders")) || 0;
      if (t > 0 && o === 0) notes.push(d.label + ": " + t + " card ticket" + (t === 1 ? "" : "s") + " but 0 card orders, so no card fees are counted");
      else if (o > t) notes.push(d.label + ": more card orders (" + o + ") than card tickets (" + t + ")");
    });
    return notes.length ? "Check card orders: " + notes.join("; ") + "." : "";
  }

  // Only items that have actually sold can be missing something. Unsold items can stay blank.
  function concNeedsMessage() {
    var list = ((state.data && state.data.concessions) || []).filter(function (it) { return it.needs; });
    if (!list.length) return "";
    return "Sold without a " + (list.every(function (it) { return it.needs === "cost"; }) ? "cost" : "price or cost") + ": " +
      list.map(function (it) { return it.name + " (" + it.needs + ")"; }).join(", ") +
      ". Fill these in so profit is right. Everything else can stay blank.";
  }

  function addConc() {
    var id = "new-" + (++state.newCount);
    state.newConc.push(id);
    concMeta(id, "");
    state.original["citem:" + id + ":name"] = "";
    state.original["citem:" + id + ":price"] = "";
    state.original["citem:" + id + ":cost"] = "";
    state.original["citem:" + id + ":active"] = "1";
    renderConc();
    var input = document.getElementById("f-citem:" + id + ":name");
    if (input) input.focus();
  }

  function renderSquare() {
    var sq = state.data && state.data.square, box = $("in-square");
    if (!box) return;
    box.hidden = !(sq && sq.connected);
    if (box.hidden) return;
    var last = sq.last, t = $("in-square-text");
    t.className = "in-square-text";
    if (!last) t.textContent = "Square is connected. Not synced yet.";
    else if (last.ok === false) { t.textContent = "Last Square sync failed (" + last.at + "): " + last.error; t.className += " is-error"; }
    else t.textContent = "Square: last synced " + last.at + " · " + last.orders + " sale" + (last.orders === 1 ? "" : "s") + " across " + (last.days || []).length + " game day" + ((last.days || []).length === 1 ? "" : "s") + ".";
  }

  function squareSync() {
    if (!state.passcode) { status("Enter the editing passcode first.", "error"); $("in-passcode").focus(); return; }
    if (Object.keys(state.edits).length) { status("Save or discard your changes before syncing from Square.", "error"); return; }
    var btn = $("in-square-sync");
    btn.disabled = true; btn.textContent = "Syncing…";
    status("Pulling sales from Square…", "info");
    api({ passcode: state.passcode, action: "square_sync" })
      .then(function (data) {
        ingest(data);
        renderAll();
        status((data.syncSummary && data.syncSummary.text) || "Synced from Square.", "ok");
      })
      .catch(function (e) { status("Square sync failed: " + e.message, "error"); })
      .then(function () { btn.disabled = false; btn.textContent = "Sync from Square now"; });
  }

  function renderAll() {
    $("in-loading").hidden = true;
    renderSquare();
    renderDays();
    renderGroups($("in-prices-fields"), state.data.fields.filter(function (f) { return f.panel === "prices"; }).map(function (f) { return state.meta[f.key]; }));
    renderGroups($("in-funding-fields"), state.data.fields.filter(function (f) { return f.panel === "funding"; }).map(function (f) { return state.meta[f.key]; }));
    renderRentals();
    renderConc();
    updateSaveBar();
  }

  function updateSaveBar() {
    var n = Object.keys(state.edits).length;
    var bad = Object.keys(state.edits).filter(function (k) { return !isValid(state.meta[k].type, state.edits[k]); }).length;
    $("in-dirty-count").textContent = n === 0 ? "No unsaved changes"
      : n + " unsaved change" + (n === 1 ? "" : "s") + (bad ? " · " + bad + " need fixing" : "");
    $("in-save").disabled = n === 0 || bad > 0;
    $("in-discard").disabled = n === 0;
    $("in-savebar").classList.toggle("is-dirty", n > 0);
  }

  /* ---------- actions ---------- */
  function goDay(n) {
    state.dayN = n;
    sSet(DAY_KEY, String(n));
    renderDays();
  }

  function shiftDay(step) {
    var days = state.data.days;
    for (var i = 0; i < days.length; i++) {
      if (days[i].n === state.dayN && days[i + step]) return goDay(days[i + step].n);
    }
  }

  function setUnlocked(on) {
    $("in-lock-form").hidden = on;
    $("in-unlocked").hidden = !on;
  }

  function unlock(pass, remember) {
    status("Checking passcode…", "info");
    return api({ passcode: pass, changes: [] })
      .then(function () {
        state.passcode = pass;
        if (remember) sSet(PASS_KEY, pass); else sDel(PASS_KEY);
        setUnlocked(true);
        status("Unlocked. Edit any field, then press Save changes.", "ok");
      })
      .catch(function (e) {
        state.passcode = "";
        sDel(PASS_KEY);
        setUnlocked(false);
        status("Could not unlock: " + e.message, "error");
      });
  }

  function save() {
    var keys = Object.keys(state.edits);
    if (!keys.length) return;
    if (!state.passcode) {
      status("Enter the editing passcode first.", "error");
      $("in-passcode").focus();
      return;
    }
    var unnamed = state.newConc.filter(function (id) {
      var touched = keys.some(function (k) { return k.indexOf("citem:" + id + ":") === 0; });
      return touched && !String(state.edits["citem:" + id + ":name"] || "").trim();
    });
    if (unnamed.length) {
      status("Give each new concession item a name before saving.", "error");
      return;
    }
    var changes = keys.map(function (k) { return { key: k, value: state.edits[k] }; });
    $("in-save").disabled = true;
    $("in-save").textContent = "Saving…";
    status("Saving " + keys.length + " change" + (keys.length === 1 ? "" : "s") + " to the sheet…", "info");
    api({ passcode: state.passcode, changes: changes })
      .then(function (data) {
        state.edits = {};
        ingest(data);
        renderAll();
        var net = data.outputs && data.outputs.season_net ? data.outputs.season_net.value : "";
        status("Saved " + data.saved + " change" + (data.saved === 1 ? "" : "s") + "." +
               (net ? " Season net income is now " + net + "." : ""), "ok");
        var needs = [concNeedsMessage(), cardOrderMessage()].filter(Boolean).join(" ");
        if (needs) status($("in-status").textContent + " " + needs, "ok");
      })
      .catch(function (e) {
        status("Not saved: " + e.message, "error");
        if (/passcode/i.test(e.message)) { state.passcode = ""; sDel(PASS_KEY); setUnlocked(false); }
      })
      .then(function () {
        $("in-save").textContent = "Save changes";
        updateSaveBar();
      });
  }

  function discard() {
    state.edits = {};
    state.newConc = [];
    renderAll();
    status("Changes discarded.", "info");
  }

  /* ---------- wiring ---------- */
  function wire() {
    var addBtn = $("in-conc-add");
    if (addBtn) addBtn.addEventListener("click", addConc);
    var sqBtn = $("in-square-sync");
    if (sqBtn) sqBtn.addEventListener("click", squareSync);
    Array.prototype.forEach.call(document.querySelectorAll("[data-goto]"), function (b) {
      b.addEventListener("click", function () {
        var tab = document.querySelector('.in-tab[data-tab="' + b.getAttribute("data-goto") + '"]');
        if (tab) { tab.click(); window.scrollTo(0, 0); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".in-tab"), function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        Array.prototype.forEach.call(document.querySelectorAll(".in-tab"), function (b) {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        Array.prototype.forEach.call(document.querySelectorAll(".in-panel"), function (p) {
          p.hidden = p.getAttribute("data-panel") !== tab;
        });
      });
    });
    $("in-day-select").addEventListener("change", function (e) { goDay(Number(e.target.value)); });
    $("in-day-prev").addEventListener("click", function () { shiftDay(-1); });
    $("in-day-next").addEventListener("click", function () { shiftDay(1); });
    $("in-save").addEventListener("click", save);
    $("in-discard").addEventListener("click", discard);
    $("in-lock-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pass = $("in-passcode").value;
      if (pass) unlock(pass, $("in-remember").checked);
    });
    $("in-forget").addEventListener("click", function () {
      state.passcode = "";
      sDel(PASS_KEY);
      $("in-passcode").value = "";
      setUnlocked(false);
      status("Locked on this device.", "info");
    });
    window.addEventListener("beforeunload", function (e) {
      if (Object.keys(state.edits).length) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function start() {
    wire();
    if (!API || API.indexOf("PASTE") === 0) {
      $("in-loading").textContent = "Set API_URL in config.js to the Apps Script web app URL to enable data entry.";
      return;
    }
    var saved = sGet(PASS_KEY);
    if (saved) { state.passcode = saved; setUnlocked(true); }
    api(null)
      .then(function (data) { ingest(data); renderAll(); })
      .catch(function (e) {
        $("in-loading").textContent = "Couldn't load the sheet: " + e.message;
      });
  }

  start();
})();
