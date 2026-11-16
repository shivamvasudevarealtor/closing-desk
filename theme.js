/* Sets the saved theme (dark by default) before the page paints, so there is no flash. */
(function () {
  var t = "dark";
  try { var v = localStorage.getItem("cd.theme"); if (v === "light" || v === "dark") t = v; } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "light" ? "#F3F6FB" : "#0B1220");
})();
