/*
  Concessions section (dashboard).
  Shows every concession item from the sheet's Concessions tab: price, cost, units sold,
  revenue and profit. All numbers are calculated in the sheet; this file only displays them.
  Listens for the "kl:data" event that app.js fires after loading the API.
*/
(function () {
  "use strict";
  var body = document.getElementById("cx-body");
  if (!body) return;

  function fmtMoney(v) {
    var s = String(v === null || v === undefined ? "" : v).trim();
    if (s === "") return "";
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
    return window.KLFormat ? window.KLFormat.money(Number(s)) : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(s));
  }

  function cell(text, cls) {
    var td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  document.addEventListener("kl:data", function (e) {
    var items = (e.detail && e.detail.concessions) || [];
    var shown = items.filter(function (it) {
      return Number(it.active) === 1 || (Number(String(it.sold).replace(/[^0-9.-]/g, "")) || 0) > 0;
    });
    body.textContent = "";
    if (!shown.length) {
      var tr0 = document.createElement("tr");
      var td0 = cell("No concession items yet. Add them on the Enter Data page.", "placeholder");
      td0.colSpan = 6;
      tr0.appendChild(td0);
      body.appendChild(tr0);
      return;
    }
    // Best sellers first, so the table reads as "what actually sells".
    shown.sort(function (a, b) { return (Number(b.sold) || 0) - (Number(a.sold) || 0); });
    shown.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(it.name));
      // Blank price/cost is normal until an item sells; only flag it when it has sold.
      var price = fmtMoney(it.price), cost = fmtMoney(it.cost);
      tr.appendChild(price ? cell(price, "num") : cell(it.needs === "price" ? "Add price" : "—", it.needs === "price" ? "num cx-missing" : "num"));
      tr.appendChild(cost ? cell(cost, "num") : cell(it.needs === "cost" ? "Add cost" : "—", it.needs === "cost" ? "num cx-missing" : "num"));
      tr.appendChild(cell(it.sold === "" ? "0" : String(it.sold), "num"));
      tr.appendChild(cell(fmtMoney(it.revenue) || "—", "num"));
      var profitTone = window.KLFormat && /^-?\d/.test(String(it.profit)) ? window.KLFormat.tone(it.profit) : "";
      tr.appendChild(cell(fmtMoney(it.profit) || "—", "num " + profitTone));
      body.appendChild(tr);
    });
  });
})();
