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

  /*
    Sponsor directory — presentation only.
    Rows stay empty until a secure read path exists. Do not fill this list
    from the public GET payload or the published Web CSV. Contact person,
    email, phone, and notes are private and must not be returned publicly.
    Follow-up matching compares dates only. It does not total any money.
  */
  var SPONSOR_ROWS = [];
  var SPONSOR_DIRECTORY_READY = false;

  function sponsorTodayIso() {
    var d = new Date();
    var month = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (month.length < 2) month = "0" + month;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + month + "-" + day;
  }

  function sponsorFollowUpDue(row) {
    var follow = String(row.nextFollowUp || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(follow)) return false;
    var status = String(row.status || "");
    if (status === "Declined" || status === "Received") return false;
    return follow <= sponsorTodayIso();
  }

  function initSponsorDirectory() {
    var body = document.getElementById("sponsor-crm-body");
    var search = document.getElementById("sponsor-search");
    var status = document.getElementById("sponsor-status");
    var followups = document.getElementById("sponsor-followups");
    if (!body || !search || !status || !followups) return;

    var EMPTY_MESSAGE = "No sponsor records are shown on this public page. Names, follow-up dates, and notes stay off the dashboard until a secure Sponsors connection is approved.";
    var FOLLOWUP_MESSAGE = "Follow-Ups Due will list sponsors whose next follow-up is today or earlier. That list is not loaded here, so private contact details stay off the public page.";

    function setMessage(text) {
      body.innerHTML = "";
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 6;
      td.className = "placeholder";
      td.textContent = text;
      tr.appendChild(td);
      body.appendChild(tr);
    }

    function draw() {
      if (!SPONSOR_DIRECTORY_READY) {
        setMessage(followups.getAttribute("aria-pressed") === "true" ? FOLLOWUP_MESSAGE : EMPTY_MESSAGE);
        return;
      }

      var query = search.value.trim().toLowerCase();
      var selected = status.value;
      var dueOnly = followups.getAttribute("aria-pressed") === "true";
      var shown = SPONSOR_ROWS.filter(function (row) {
        if (selected && row.status !== selected) return false;
        if (dueOnly && !sponsorFollowUpDue(row)) return false;
        if (!query) return true;
        var haystack = [row.businessName, row.contactPerson, row.tier, row.status, row.notes].join(" ").toLowerCase();
        return haystack.indexOf(query) !== -1;
      });

      if (!shown.length) {
        setMessage(dueOnly ? "No follow-ups are due for the current filters." : "No sponsors match the current filters.");
        return;
      }

      body.innerHTML = "";
      shown.forEach(function (row) {
        var tr = document.createElement("tr");
        [row.businessName, row.contactPerson, row.tier, row.status, row.nextFollowUp, row.notes].forEach(function (value) {
          var td = document.createElement("td");
          var text = value == null ? "" : String(value).trim();
          td.textContent = text || "—";
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }

    search.addEventListener("input", draw);
    status.addEventListener("change", draw);
    followups.addEventListener("click", function () {
      var pressed = followups.getAttribute("aria-pressed") === "true";
      followups.setAttribute("aria-pressed", pressed ? "false" : "true");
      draw();
    });

    setMessage("Loading sponsor directory…");
    window.setTimeout(function () {
      draw();
    }, 0);
  }

  initSponsorDirectory();
})();
