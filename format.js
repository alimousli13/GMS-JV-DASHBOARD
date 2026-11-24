/*
  One money style for the whole dashboard (dashboard + Enter Data):
  gains "$1,692.50", losses "−$500.00" (true minus sign, shown in red by the page), zero "$0.00".
  The sheet sends display strings in two styles ("-$10,307.50" and "($500.00)"); both parse here.
*/
(function () {
  "use strict";

  function num(v) {
    if (typeof v === "number") return v;
    var s = String(v === null || v === undefined ? "" : v).trim();
    if (!s || s === "–" || s === "—" || s === "-") return 0;
    var neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
    var n = Number(s.replace(/[^0-9.]/g, ""));
    if (!isFinite(n) || /[^\s$,.()0-9%−-]/.test(s)) return NaN;
    return neg ? -n : n;
  }

  function isMoneyText(s) {
    return /^\s*\(?[-−]?\s*\$\s?[\d,]+(\.\d+)?\)?\s*$/.test(String(s || ""));
  }

  var fmtCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  var fmtWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // opts.whole: round to dollars · opts.sign: "+" on gains · opts.dashZero: "–" for 0
  function money(n, opts) {
    opts = opts || {};
    n = num(n);
    if (!isFinite(n)) return "—";
    if (n === 0 && opts.dashZero) return "–";
    var s = (opts.whole ? fmtWhole : fmtCents).format(Math.abs(n));
    if (n < 0) return "−" + s;
    return (opts.sign && n > 0 ? "+" : "") + s;
  }

  function tone(n) { n = num(n); return n < 0 ? "negative" : n > 0 ? "positive" : ""; }

  window.KLFormat = { num: num, money: money, tone: tone, isMoneyText: isMoneyText };
})();
