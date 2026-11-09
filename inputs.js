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
    passcode: ""
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
        state.meta[key] = { key: key, label: f.label, type: f.type, group: f.group };
      });
    });
    $("in-server-time").textContent = data.serverTime || "—";
    if (state.dayN === null || !findDay(state.dayN)) state.dayN = pickStartDay(data.days);
  }

  // Sheet display values usually arrive formatted ("$75.00"); format bare numbers the same way.
  function money(v) {
    var s = String(v === null || v === undefined ? "" : v).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(s));
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
    if (key.indexOf("day") === 0) refreshDayOptions();
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
      lab.appendChild(document.createTextNode(" " + meta.label));
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
        input.inputMode = meta.type === "int" ? "numeric" : "decimal";
        input.autocomplete = "off";
        input.placeholder = meta.type === "int" ? "0" : "0.00";
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

    var metas = state.data.dailyFields.map(function (f) { return state.meta["day" + d.n + "_" + f.field]; });
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

  function renderAll() {
    $("in-loading").hidden = true;
    renderDays();
    renderGroups($("in-prices-fields"), state.data.fields.filter(function (f) { return f.panel === "prices"; }).map(function (f) { return state.meta[f.key]; }));
    renderGroups($("in-funding-fields"), state.data.fields.filter(function (f) { return f.panel === "funding"; }).map(function (f) { return state.meta[f.key]; }));
    renderRentals();
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
    renderAll();
    status("Changes discarded.", "info");
  }

  /* ---------- wiring ---------- */
  function wire() {
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
