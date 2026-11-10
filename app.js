/*
  To add a number, add a row to the Web tab in the Google Sheet with your
  workstream prefix (e.g. ops_), then add <span data-key="ops_yourkey">—</span>
  in your section. No JS changes needed.
*/

(function () {
  var PLACEHOLDER = "—";
  var UNSET_URLS = { "": true, "PASTE_URL_HERE": true };

  var banner = document.getElementById("data-banner");
  var dismiss = document.getElementById("data-banner-dismiss");
  if (dismiss) {
    dismiss.addEventListener("click", function () {
      if (banner) {
        banner.classList.remove("is-visible");
        banner.hidden = true;
      }
    });
  }

  function showBanner() {
    if (banner) {
      banner.hidden = false;
      banner.classList.add("is-visible");
    }
  }

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function stripNumericJunk(raw) {
    return String(raw).replace(/[\s$,%]/g, "");
  }

  function isNumericValue(raw) {
    if (raw == null) return false;
    var trimmed = String(raw).trim();
    if (!trimmed || trimmed === PLACEHOLDER || trimmed === "-") return false;
    var cleaned = stripNumericJunk(trimmed);
    if (!cleaned || cleaned === "-" || cleaned === "+") return false;
    return /^-?\d+(\.\d+)?$/.test(cleaned);
  }

  function formatValue(raw, format) {
    var n = Number(stripNumericJunk(raw));
    if (format === "currency") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }).format(n);
    }
    if (format === "percent") {
      return (
        new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        }).format(n) + "%"
      );
    }
    if (format === "number") {
      return new Intl.NumberFormat("en-US").format(n);
    }
    return String(raw);
  }

  function applySigned(el, format, raw) {
    el.classList.remove("positive", "negative");
    if (format !== "currency" || !el.hasAttribute("data-signed")) return;
    var n = Number(stripNumericJunk(raw));
    if (n > 0) el.classList.add("positive");
    if (n < 0) el.classList.add("negative");
  }

  function fill(map) {
    var nodes = document.querySelectorAll("[data-key]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-key");
      var entry = map[key];
      if (!entry) {
        console.warn("Missing sheet key:", key);
        continue;
      }
      var raw = entry.value;
      var format = entry.format;
      el.classList.remove("warn-badge", "placeholder", "positive", "negative");
      if (raw == null || String(raw).trim() === "" || String(raw).trim() === PLACEHOLDER) {
        el.textContent = PLACEHOLDER;
        el.classList.add("placeholder");
        continue;
      }
      if (!isNumericValue(raw) || format === "text") {
        var text = String(raw).trim();
        el.textContent = text;
        if (!isNumericValue(raw) && /not set|set /i.test(text)) {
          el.classList.add("warn-badge");
        }
        continue;
      }
      el.textContent = formatValue(raw, format);
      applySigned(el, format, raw);
    }
  }

  function rowsToMap(rows) {
    if (!rows.length) return {};
    var header = rows[0].map(function (h) {
      return String(h).trim().toLowerCase();
    });
    var keyIdx = header.indexOf("key");
    var valueIdx = header.indexOf("value");
    var formatIdx = header.indexOf("format");
    var map = {};
    if (keyIdx === -1) return map;
    for (var r = 1; r < rows.length; r++) {
      var cols = rows[r];
      if (!cols.length) continue;
      var key = String(cols[keyIdx] || "").trim();
      if (!key) continue;
      map[key] = {
        value: valueIdx === -1 ? "" : cols[valueIdx],
        format: formatIdx === -1 ? "text" : String(cols[formatIdx] || "text").trim().toLowerCase()
      };
    }
    return map;
  }

  function scheduleMessage(text) {
    var body = document.getElementById("sched-body");
    if (body) body.innerHTML = '<tr><td colspan="6" class="placeholder"></td></tr>';
    if (body) body.querySelector("td").textContent = text;
  }

  /* ---------- Schedule (from the API's "schedule" list) ---------- */
  function renderSchedule(games) {
    var body = document.getElementById("sched-body");
    var weekSel = document.getElementById("sched-week");
    var teamSel = document.getElementById("sched-team");
    var count = document.getElementById("sched-count");
    if (!body || !weekSel || !teamSel) return;
    if (!games.length) {
      body.innerHTML = '<tr><td colspan="6" class="placeholder">No schedule found in the sheet.</td></tr>';
      return;
    }
    var weeks = [], teams = [];
    games.forEach(function (g) {
      if (weeks.indexOf(g.week) === -1) weeks.push(g.week);
      [g.home, g.away].forEach(function (t) { if (t && teams.indexOf(t) === -1) teams.push(t); });
    });
    teams.sort();
    weeks.forEach(function (w) { weekSel.appendChild(new Option("Week " + w, w)); });
    teams.forEach(function (t) { teamSel.appendChild(new Option(t, t)); });

    function cell(text, cls) {
      var td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      return td;
    }

    function draw() {
      var w = weekSel.value, t = teamSel.value;
      var shown = games.filter(function (g) {
        return (!w || String(g.week) === w) && (!t || g.home === t || g.away === t);
      });
      body.innerHTML = "";
      var lastDate = null;
      shown.forEach(function (g) {
        var tr = document.createElement("tr");
        if (g.date !== lastDate) { tr.className = "sched-newday"; lastDate = g.date; }
        tr.appendChild(cell(g.date || ("Week " + g.week + " " + g.day)));
        tr.appendChild(cell(g.time));
        tr.appendChild(cell(g.venue));
        tr.appendChild(cell(g.court));
        tr.appendChild(cell(g.home, t && g.home === t ? "sched-hl" : ""));
        tr.appendChild(cell(g.away, t && g.away === t ? "sched-hl" : ""));
        body.appendChild(tr);
      });
      if (count) count.textContent = shown.length + " game" + (shown.length === 1 ? "" : "s");
    }

    weekSel.addEventListener("change", draw);
    teamSel.addEventListener("change", draw);
    draw();
  }

  function loadFromCsv() {
    var url = typeof SHEET_CSV_URL === "string" ? SHEET_CSV_URL.trim() : "";
    if (UNSET_URLS[url]) {
      showBanner();
      return;
    }
    fetch(url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        fill(rowsToMap(parseCSV(text)));
      })
      .catch(function () {
        showBanner();
      });
  }

  // Prefer the Apps Script API (reflects edits instantly); fall back to the published CSV.
  var api = typeof API_URL === "string" ? API_URL.trim() : "";
  if (api && api.indexOf("PASTE") !== 0) {
    fetch(api + (api.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.ok || !json.outputs) throw new Error((json && json.error) || "bad response");
        if (!json.schedule) scheduleMessage("Schedule not in the API yet — redeploy Apps Script as a New version.");
        fill(json.outputs);
        if (json.schedule) renderSchedule(json.schedule);
      })
      .catch(function (err) {
        console.warn("Apps Script API failed, falling back to CSV:", err);
        scheduleMessage("Schedule unavailable — the Apps Script API didn't respond (" + err.message + ").");
        loadFromCsv();
      });
  } else {
    scheduleMessage("Schedule needs API_URL set in config.js.");
    loadFromCsv();
  }


})();

/* START: Sponsor Pipeline — authenticated requests only */
(function () {
  var rows = [], passcode = '', editing = null, pending = false;
  var byId = function(id) { return document.getElementById(id); };
  if (!byId('sponsor-unlock')) return;
  var form = byId('sponsor-editor'), keys = ['business','contact','communication','stage','followup','notes'];
  function message(text) { byId('sponsor-message').textContent = text; }
  async function request(action, extra) {
    if (typeof API_URL !== 'string' || !API_URL) throw new Error('Dashboard API is not configured.');
    var response = await fetch(API_URL, {method:'POST', body:JSON.stringify(Object.assign({action:action,passcode:passcode},extra || {}))});
    if (!response.ok) throw new Error('Connection failed. Please retry.');
    var result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }
  function draw() {
    var body = byId('sponsor-crm-body'); body.replaceChildren();
    var q = byId('sponsor-search').value.trim().toLowerCase();
    var status = byId('sponsor-status').value, due = byId('sponsor-followups').getAttribute('aria-pressed') === 'true';
    var today = new Date(), iso = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    var shown = rows.filter(function(row) {
      return (!q || keys.map(function(k){return row[k] || '';}).join(' ').toLowerCase().includes(q)) &&
        (!status || row.stage === status) && (!due || (row.followup && row.followup <= iso && !/^(declined|closed|received)$/i.test(row.stage)));
    });
    shown.forEach(function(row) {
      var tr = document.createElement('tr');
      keys.forEach(function(k){ var td=document.createElement('td'); td.textContent=row[k] || '—'; tr.appendChild(td); });
      var td=document.createElement('td'), button=document.createElement('button');
      button.type='button'; button.className='btn'; button.textContent='Edit';
      button.addEventListener('click',function(){openEditor(row);}); td.appendChild(button); tr.appendChild(td); body.appendChild(tr);
    });
    if (!shown.length) {var tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='No sponsors match these filters.';tr.appendChild(td);body.appendChild(tr);}
  }
  function load(result) {
    rows=result.sponsors;
    var statuses = Array.from(new Set(rows.map(function(r){return r.stage;}).filter(Boolean))).sort();
    var select=byId('sponsor-status'); select.replaceChildren(new Option('All statuses',''));
    byId('sponsor-stages').replaceChildren();
    statuses.forEach(function(s){select.appendChild(new Option(s,s));byId('sponsor-stages').appendChild(new Option(s,s));});
    draw();
  }
  function openEditor(row) {
    editing=row || null;
    keys.forEach(function(k){form.elements[k].value=row ? row[k] || '' : '';});
    byId('sponsor-editor-title').textContent=row ? 'Edit sponsor' : 'Add sponsor';
    form.hidden=false;form.elements.business.focus();
  }
  byId('sponsor-unlock').addEventListener('submit',async function(e){
    e.preventDefault(); if(pending)return; pending=true;
    passcode=byId('sponsor-passcode').value; message('Loading tracker…');
    try {load(await request('sponsors_list'));byId('sponsor-private').hidden=false;byId('sponsor-unlock').hidden=true;byId('sponsor-lock').hidden=false;byId('sponsor-passcode').value='';message('Tracker unlocked.');}
    catch(err){passcode='';message(err.message);}finally{pending=false;}
  });
  byId('sponsor-lock').addEventListener('click',function(){
    if(pending)return;passcode='';rows=[];editing=null;form.reset();form.hidden=true;
    byId('sponsor-crm-body').replaceChildren();byId('sponsor-private').hidden=true;byId('sponsor-unlock').hidden=false;byId('sponsor-lock').hidden=true;message('Tracker locked.');
  });
  form.addEventListener('submit',async function(e){
    e.preventDefault();if(pending)return;pending=true;
    var record={};keys.forEach(function(k){record[k]=form.elements[k].value;});
    var buttons=form.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true;});
    try {load(await request('sponsors_save',{record:record,row:editing ? editing.row : null,version:editing ? editing.version : null}));form.hidden=true;editing=null;message('Sponsor saved to Google Sheets.');}
    catch(err){message(err.message);}finally{pending=false;buttons.forEach(function(b){b.disabled=false;});}
  });
  byId('sponsor-add').addEventListener('click',function(){openEditor(null);});
  byId('sponsor-cancel').addEventListener('click',function(){form.hidden=true;});
  byId('sponsor-search').addEventListener('input',draw);
  byId('sponsor-status').addEventListener('change',draw);
  byId('sponsor-followups').addEventListener('click',function(){this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true');draw();});
})();
/* END: Sponsor Pipeline */
