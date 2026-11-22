// view.js — ALLOOLOO-PAGES-01 (CEO, 2026-11-21): the visitor's day or night choice, applied before the page paints.
// One value is kept in the browser: allooloo-view = "day" or "night" (localStorage). Nothing else is stored; no cookie, no network call.
// A first-time visitor has no value and gets the default view (the device setting). If the browser refuses storage, nothing here fails:
// the header switch still changes the page in view (webmcp.js).
// A link from one Allooloo site to another carries the choice as #view=day or #view=night (webmcp.js adds it), because a browser keeps
// storage apart for each site; the page that receives it keeps it and takes it off the address.
(function () {
  var v = null;
  try { v = window.localStorage.getItem('allooloo-view'); } catch (e) {}
  var m = /[#&]view=(day|night)$/.exec(location.hash);
  if (m) {
    v = m[1];
    try { window.localStorage.setItem('allooloo-view', v); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/[#&]view=(day|night)$/, '')); } catch (e) {}
  }
  if (v === 'day' || v === 'night') document.documentElement.setAttribute('data-theme', v === 'night' ? 'dark' : 'light');
})();
