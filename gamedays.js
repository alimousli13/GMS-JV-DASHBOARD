/* Dashboard "Game Days" section: every game day in one table (rendering lives in daytable.js). */
(function () {
  "use strict";
  var box = document.getElementById("gd-table");
  if (!box || !window.KLDayTable) return;
  document.addEventListener("kl:data", function (e) { window.KLDayTable.render(box, e.detail || {}); });
})();
