/*
  All game days table: one row per game day so the whole season is visible at a glance.
  Used by the dashboard (index.html, via gamedays.js) and Enter Data (inputs.html, via inputs.js).
  Numbers come straight from the sheet (payload.days); this file only lays them out.

  KLDayTable.render(container, payload, {
    onPick: function (n) {},   // optional: makes rows clickable (Enter Data opens that day)
    selected: 3,               // optional: highlights that day
    edited: function (n) {}    // optional: true if the day has unsaved edits
  });
*/
(function () {
  "use strict";

  function num(v) {
    var s = String(v === null || v === undefined ? "" : v).trim();
    if (!s || s === "–" || s === "—" || s === "-") return 0;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    var n = Number(s.replace(/[^0-9.]/g, ""));
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }
  function money(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return "–";
    var s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));
    return n < 0 ? "(" + s + ")" : s;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function status(d, synced, t) {
    if (Number(d.values && d.values.completed) === 1) return { text: "Done", cls: "dt-done" };
    if (d.iso && d.iso > t) return { text: "Upcoming", cls: "dt-upcoming" };
    if (d.iso === t) return { text: "Today", cls: "dt-today" };
    if (synced) return { text: "From Square", cls: "dt-square" };
    if (num(d.revenue) === 0) return { text: "No sales entered", cls: "dt-missing" };
    return { text: "Entered", cls: "dt-entered" };
  }

  function render(container, payload, opts) {
    opts = opts || {};
    container.textContent = "";
    var days = (payload && payload.days) || [];
    if (!days.length) { container.appendChild(el("p", "muted", "No game days scheduled yet.")); return; }

    var synced = {};
    var sq = payload.square && payload.square.last;
    ((sq && sq.ok !== false && sq.days) || []).forEach(function (x) { if (x.n) synced[x.n] = true; });
    var t = today();

    // Played so far vs remaining, so upcoming days' scheduled costs don't blur the picture.
    var played = { days: 0, rev: 0, cost: 0, net: 0 }, left = 0;
    days.forEach(function (d) {
      var past = Number(d.values && d.values.completed) === 1 || (d.iso && d.iso <= t);
      if (past) { played.days++; played.rev += num(d.revenue); played.cost += num(d.cost); played.net += num(d.net); }
      else left++;
    });
    var chips = el("div", "dt-chips");
    [["Played so far", played.days + " day" + (played.days === 1 ? "" : "s")],
     ["Revenue so far", money(played.rev)],
     ["Costs so far", money(played.cost)],
     ["Net so far", money(played.net), played.net < 0 ? "negative" : played.net > 0 ? "positive" : ""],
     ["Game days left", String(left)]].forEach(function (c) {
      var chip = el("div", "dt-chip");
      chip.appendChild(el("span", "dt-chip-label", c[0]));
      chip.appendChild(el("span", "dt-chip-value num " + (c[2] || ""), c[1]));
      chips.appendChild(chip);
    });
    container.appendChild(chips);

    var wrap = el("div", "table-wrap");
    var table = el("table", "dt-table" + (opts.onPick ? " is-clickable" : ""));
    var thead = el("thead"), hr = el("tr");
    [["Game day", ""], ["Games", "num"], ["Tickets", "num"], ["Admissions", "num"], ["Concessions", "num"],
     ["Revenue", "num"], ["Costs", "num"], ["Net", "num"], ["Status", ""]].forEach(function (h) { hr.appendChild(el("th", h[1], h[0])); });
    thead.appendChild(hr); table.appendChild(thead);

    var tb = el("tbody"), tot = { games: 0, cash: 0, card: 0, adm: 0, conc: 0, rev: 0, cost: 0, net: 0 }, week = null;
    days.forEach(function (d) {
      if (d.week !== week) {
        week = d.week;
        var wr = el("tr", "dt-week");
        var wc = el("td", "", "Week " + week); wc.colSpan = 9;
        wr.appendChild(wc); tb.appendChild(wr);
      }
      var st = status(d, synced[d.n], t);
      var parts = String(d.label || "").split(" · ");
      var cash = Number(d.values && d.values.cash_adm) || 0, card = Number(d.values && d.values.card_adm) || 0;
      var adm = num(d.admissions), conc = num(d.concessions), rev = num(d.revenue), cost = num(d.cost), net = num(d.net);
      tot.games += Number(d.games) || 0; tot.cash += cash; tot.card += card;
      tot.adm += adm || 0; tot.conc += conc || 0; tot.rev += rev || 0; tot.cost += cost || 0; tot.net += net || 0;

      var tr = el("tr", st.cls === "dt-upcoming" ? "dt-row is-upcoming" : "dt-row");
      if (opts.selected === d.n) tr.classList.add("is-selected");
      var first = el("td", "dt-day");
      first.appendChild(el("span", "dt-day-name", (opts.edited && opts.edited(d.n) ? "• " : "") + (d.date || parts[0])));
      first.appendChild(el("span", "dt-day-sub", [parts[0], parts[1]].filter(Boolean).join(" · ")));
      tr.appendChild(first);
      tr.appendChild(el("td", "num", d.games || "–"));
      var tk = el("td", "num", cash + card ? String(cash + card) : "–");
      if (cash + card) tk.title = cash + " cash · " + card + " card";
      if (cash + card) tk.appendChild(el("span", "dt-sub", cash + " cash · " + card + " card"));
      tr.appendChild(tk);
      tr.appendChild(el("td", "num", money(adm)));
      tr.appendChild(el("td", "num", money(conc)));
      tr.appendChild(el("td", "num", money(rev)));
      tr.appendChild(el("td", "num", money(cost)));
      tr.appendChild(el("td", "num " + (net < 0 ? "negative" : net > 0 ? "positive" : ""), money(net)));
      var sc = el("td"); sc.appendChild(el("span", "dt-status " + st.cls, st.text)); tr.appendChild(sc);

      if (opts.onPick) {
        tr.tabIndex = 0;
        tr.setAttribute("role", "button");
        tr.setAttribute("aria-label", "Open " + (d.date || d.label));
        tr.addEventListener("click", function () { opts.onPick(d.n); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onPick(d.n); } });
      }
      tb.appendChild(tr);
    });
    table.appendChild(tb);

    var tf = el("tfoot"), fr = el("tr", "total-row");
    fr.appendChild(el("td", "", "Season (all days)"));
    fr.appendChild(el("td", "num", String(tot.games)));
    var ft = el("td", "num", String(tot.cash + tot.card));
    ft.appendChild(el("span", "dt-sub", tot.cash + " cash · " + tot.card + " card"));
    fr.appendChild(ft);
    [tot.adm, tot.conc, tot.rev, tot.cost].forEach(function (v) { fr.appendChild(el("td", "num", money(v))); });
    fr.appendChild(el("td", "num " + (tot.net < 0 ? "negative" : tot.net > 0 ? "positive" : ""), money(tot.net)));
    fr.appendChild(el("td", ""));
    tf.appendChild(fr); table.appendChild(tf);

    wrap.appendChild(table);
    container.appendChild(wrap);
    container.appendChild(el("p", "dt-note", "Season totals include rent and staff already booked for upcoming days. The \u201cso far\u201d boxes count only days played."));
  }

  window.KLDayTable = { render: render };
})();
