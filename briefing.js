/*
  Dashboard top section ("Where the season stands"): answers the owner's three questions first.
    1. Will the season finish in the black?  → one sentence + a bridge from cash so far to the season floor
    2. How did the last game night go / what's next?
    3. What needs my attention?  → short list, each item links to the exact place to fix it
  Everything is computed from the same payload app.js already fetched (no extra requests, no sheet math here).

  Why "season floor": Season!B6 counts every team fee as collected and the full season's costs,
  but only the game-night money already taken in. More game nights can only add to it.
*/
(function () {
  "use strict";
  var F = window.KLFormat;
  var root = document.getElementById("brief");
  if (!root || !F) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function out(json, key) { var o = json.outputs && json.outputs[key]; return o ? F.num(o.value) : NaN; }
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function venueOf(d) { var parts = String(d.label || "").split(" · "); return parts[1] || ""; }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  /* ---------- 1. Headline sentence ---------- */
  function lede(floor, owed, cash) {
    var p = el("p", "brief-lede");
    if (!isFinite(floor)) { p.textContent = "Season numbers will appear once the sheet loads."; return p; }
    var strong = el("strong", F.tone(floor), F.money(floor, { whole: true, sign: true }));
    if (owed > 0) {
      p.appendChild(document.createTextNode("If every team pays the " + F.money(owed, { whole: true }) + " still owed, the season finishes at "));
      p.appendChild(strong);
      p.appendChild(document.createTextNode(floor >= 0 ? " or better." : " before any more game-night money."));
    } else {
      p.appendChild(document.createTextNode("All team fees are in. The season is on track to finish at "));
      p.appendChild(strong);
      p.appendChild(document.createTextNode(" or better."));
    }
    return p;
  }

  /* ---------- Bridge: cash net so far → + fees still owed → (+ other) → season floor ---------- */
  function wrapWords(text, maxChars) {
    var lines = [], line = "";
    String(text).split(" ").forEach(function (w) {
      if ((line + " " + w).trim().length > maxChars && line) { lines.push(line); line = w; }
      else line = (line + " " + w).trim();
    });
    if (line) lines.push(line);
    return lines;
  }

  // Drawn at the container's real width so text stays at true size on phones.
  function bridge(cash, owed, other, floor, width) {
    var steps = [{ label: "Net on cash collected so far", value: cash, kind: "start" }];
    if (owed) steps.push({ label: "Team fees still owed", value: owed, kind: "step" });
    if (Math.abs(other) >= 1) steps.push({ label: "Other expected items", value: other, kind: "step" });
    steps.push({ label: "Season floor", value: floor, kind: "total" });

    var running = 0, bars = [];
    steps.forEach(function (s) {
      var from, to;
      if (s.kind === "start" || s.kind === "total") { from = 0; to = s.value; running = s.value; }
      else { from = running; to = running + s.value; running = to; }
      bars.push({ s: s, lo: Math.min(from, to), hi: Math.max(from, to), end: running });
    });
    var min = Math.min(0, Math.min.apply(null, bars.map(function (b) { return b.lo; })));
    var max = Math.max(0, Math.max.apply(null, bars.map(function (b) { return b.hi; })));
    if (max === min) max = min + 1;

    var W = Math.max(300, Math.min(640, Math.round(width || 640)));
    var colW = W / bars.length, barW = Math.min(118, colW * 0.6);
    var maxChars = Math.max(9, Math.floor(colW / 7.4));
    var labelLines = bars.map(function (b) { return wrapWords(b.s.label, maxChars); });
    var nLines = Math.max.apply(null, labelLines.map(function (l) { return l.length; }));
    var top = 30, valueRoom = 26, labelRoom = 10 + nLines * 16;
    var H = W < 420 ? 210 : 240;
    var plotH = H - top - valueRoom - labelRoom;
    var y = function (v) { return top + (max - v) / (max - min) * plotH; };
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("class", "brief-bridge");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", steps.map(function (s) { return s.label + " " + F.money(s.value, { whole: true, sign: s.kind === "step" }); }).join(", then ") + ".");
    function add(tag, attrs, text) {
      var n = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text !== undefined) n.textContent = text;
      svg.appendChild(n);
      return n;
    }
    add("line", { x1: 0, x2: W, y1: y(0), y2: y(0), class: "bb-zero" });
    bars.forEach(function (b, i) {
      var x = i * colW + (colW - barW) / 2, cls = "bb-bar bb-" + b.s.kind + " " + (b.s.value < 0 ? "is-neg" : "is-pos");
      add("rect", { x: x, y: y(b.hi), width: barW, height: Math.max(2, y(b.lo) - y(b.hi)), rx: 3, class: cls });
      if (i < bars.length - 1) {
        add("line", { x1: x + barW, x2: (i + 1) * colW + (colW - barW) / 2, y1: y(b.end), y2: y(b.end), class: "bb-link" });
      }
      var above = b.s.value >= 0;
      add("text", { x: x + barW / 2, y: above ? y(b.hi) - 9 : y(b.lo) + 19, class: "bb-value " + (b.s.value < 0 ? "is-neg" : "is-pos") },
          F.money(b.s.value, { whole: true, sign: b.s.kind === "step" }));
      labelLines[i].forEach(function (ln, k) {
        add("text", { x: x + barW / 2, y: H - labelRoom + 14 + k * 16, class: "bb-label" + (b.s.kind === "total" ? " is-total" : "") }, ln);
      });
    });
    return svg;
  }

  /* ---------- 2. Last / next game night ---------- */
  function nightBlock(title, d, kind, games) {
    var box = el("div", "brief-night");
    box.appendChild(el("h3", "", title));
    if (!d) { box.appendChild(el("p", "muted", kind === "last" ? "No game nights played yet." : "No more game nights this season.")); return box; }
    var when = el("p", "brief-when");
    when.appendChild(el("strong", "", d.date || d.label));
    var v = venueOf(d);
    if (v) when.appendChild(document.createTextNode(" · " + v));
    box.appendChild(when);
    if (kind === "last") {
      var rev = F.num(d.revenue), cost = F.num(d.cost), net = F.num(d.net);
      var tickets = (Number(d.values && d.values.cash_adm) || 0) + (Number(d.values && d.values.card_adm) || 0);
      var dl = el("dl", "brief-facts");
      [["Net", F.money(net), F.tone(net)], ["Revenue", F.money(rev)], ["Costs", F.money(cost)], ["Tickets", String(tickets)]].forEach(function (r) {
        var w = el("div");
        w.appendChild(el("dt", "", r[0]));
        w.appendChild(el("dd", "num " + (r[2] || ""), r[1]));
        dl.appendChild(w);
      });
      box.appendChild(dl);
      if (!rev) box.appendChild(el("p", "brief-flag", "No sales recorded for this night."));
    } else {
      var first = (games || []).map(function (g) { return g.time; }).filter(Boolean).sort(function (a, b) { return mins(a) - mins(b); })[0];
      box.appendChild(el("p", "muted", plural(Number(d.games) || 0, "game") + (first ? " · first tip-off " + first : "") +
        (d.hasConcessions === false ? " · no concessions (sports complex)" : "")));
    }
    return box;
  }
  function mins(t) {
    var m = /(\d+):(\d+)\s*(AM|PM)?/i.exec(String(t || ""));
    if (!m) return 9999;
    var h = Number(m[1]) % 12 + (/pm/i.test(m[3] || "") ? 12 : 0);
    return h * 60 + Number(m[2]);
  }

  /* ---------- 3. Needs attention ---------- */
  function attention(json, t, owed) {
    var items = [];
    var needs = (json.concessions || []).filter(function (c) { return c.needs; });
    if (needs.length) items.push({
      text: "Sold without a " + (needs.every(function (c) { return c.needs === "cost"; }) ? "cost" : "price or cost") + ": " +
            needs.slice(0, 3).map(function (c) { return c.name; }).join(", ") + (needs.length > 3 ? " and " + (needs.length - 3) + " more" : "") +
            ". Profit is understated until these are filled in.",
      href: "inputs.html#conc", action: "Add " + (needs.length === 1 ? "it" : "them")
    });
    var empty = (json.days || []).filter(function (d) { return d.iso && d.iso < t && !F.num(d.revenue); });
    if (empty.length) items.push({
      text: "No sales recorded for " + empty.slice(0, 2).map(function (d) { return d.date || d.label; }).join(" and ") +
            (empty.length > 2 ? " and " + (empty.length - 2) + " other night" + (empty.length - 2 === 1 ? "" : "s") : "") + ".",
      href: "inputs.html#day-" + empty[0].n, action: "Check"
    });
    var sq = json.square;
    if (sq && sq.connected) {
      var last = sq.last;
      if (last && last.ok === false) items.push({ text: "Square sync failed (" + last.at + "): " + last.error, href: "inputs.html", action: "Retry", urgent: true });
      else if (!last) items.push({ text: "Square is connected but hasn't synced yet.", href: "inputs.html", action: "Sync now" });
      else if (last.atIso && (Date.now() - new Date(last.atIso).getTime()) > 36 * 3600 * 1000)
        items.push({ text: "Square last synced " + last.at + ". The nightly sync may be off.", href: "inputs.html", action: "Sync now" });
    }
    if (owed > 0) items.push({ text: F.money(owed, { whole: true }) + " in team fees still to collect.", href: "inputs.html#funding", action: "Record payments" });
    return items;
  }

  function render(json) {
    var t = today();
    var floor = out(json, "season_net"), cash = out(json, "net_fees_received"), owed = out(json, "team_fees_to_collect");
    if (!isFinite(owed)) owed = 0;
    var other = isFinite(floor) && isFinite(cash) ? floor - cash - owed : 0;
    var days = json.days || [];
    var past = days.filter(function (d) { return d.iso && d.iso < t; });
    var tonight = days.filter(function (d) { return d.iso === t; })[0];
    var upcoming = days.filter(function (d) { return d.iso && d.iso > t; });
    var last = past[past.length - 1], next = tonight || upcoming[0];

    root.textContent = "";
    var main = el("div", "brief-main");
    main.appendChild(lede(floor, owed, cash));
    var sub = el("p", "brief-sub");
    sub.textContent = "That counts the whole season's costs but only the game-night money already taken in.";
    var withSales = past.filter(function (d) { return F.num(d.revenue) > 0; });
    var left = upcoming.length + (tonight ? 1 : 0);
    if (withSales.length >= 2 && left > 0) {
      var avg = withSales.reduce(function (s, d) { return s + F.num(d.revenue); }, 0) / withSales.length;
      sub.textContent += " Game nights have brought in about " + F.money(avg, { whole: true }) + " each, so the " +
        plural(left, "night") + " left could add roughly " + F.money(avg * left, { whole: true }) + " more in revenue.";
    }
    main.appendChild(sub);
    root.appendChild(main);
    if (isFinite(floor) && isFinite(cash)) {
      var chart = el("div", "brief-chart");
      main.appendChild(chart);
      var draw = function () { chart.textContent = ""; chart.appendChild(bridge(cash, owed, other, floor, chart.clientWidth)); };
      draw();
      lastDraw = draw;
    }

    var side = el("aside", "brief-side card");
    side.setAttribute("aria-label", "Game nights and to-dos");
    var nextGames = next ? (json.schedule || []).filter(function (g) { return g.iso === next.iso; }) : [];
    side.appendChild(nightBlock("Last game night", last, "last"));
    side.appendChild(nightBlock(tonight ? "Tonight" : "Next game night", next, "next", nextGames));
    var att = el("div", "brief-attn");
    att.appendChild(el("h3", "", "Needs attention"));
    var items = attention(json, t, owed);
    if (!items.length) att.appendChild(el("p", "muted", "Nothing right now."));
    else {
      var ul = el("ul");
      items.forEach(function (it) {
        var li = el("li", it.urgent ? "is-urgent" : "");
        li.appendChild(el("span", "", it.text + " "));
        var a = el("a", "", it.action); a.href = it.href;
        li.appendChild(a);
        ul.appendChild(li);
      });
      att.appendChild(ul);
    }
    side.appendChild(att);
    root.appendChild(side);
    root.removeAttribute("aria-busy");
  }

  var lastDraw = null, resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (lastDraw) lastDraw(); }, 150);
  });

  document.addEventListener("kl:data", function (e) { render(e.detail || {}); });
})();
