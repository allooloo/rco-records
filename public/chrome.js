/* chrome.js — the tint switch and the Copy button only. No storage, no network, no third party. */
(function () {
  var r = document.documentElement, b = document.getElementById("gh-theme");
  function cur() { var t = r.getAttribute("data-theme"); if (t) return t; return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  function sync() { if (b) b.setAttribute("aria-pressed", cur() === "light" ? "true" : "false"); }
  if (b) { b.addEventListener("click", function () { r.setAttribute("data-theme", cur() === "light" ? "dark" : "light"); sync(); }); sync(); }
  document.addEventListener("click", function (e) {
    var c = e.target && e.target.closest ? e.target.closest(".copy") : null; if (!c) return;
    var v = c.getAttribute("data-copy"); if (!v || !navigator.clipboard) return;
    navigator.clipboard.writeText(v).then(function () { c.setAttribute("data-done", ""); setTimeout(function () { c.removeAttribute("data-done"); }, 1600); });
  });
})();
