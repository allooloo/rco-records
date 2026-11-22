// START_ME_UP_5 §4 check 12 — the one page script by ruling (CEO, Sept 13 2026): it registers this surface's contact form as its one WebMCP tool.
// Nothing else is scripted on any Allooloo surface. No cookies, no storage, no network call of its own; the form still posts to the endpoint of record.
// Surface refurb (Site Book Addendum A §6, CEO Sept 28 2026): the tint and copy functions are folded into this one file. Still no cookies, no storage, no query string, no network call.
// ALLOOLOO-PAGES-01 (CEO, 2026-11-21): the September "no storage" ruling is struck for the day/night choice alone. One value is kept in the browser
// (allooloo-view = day | night); nothing else is stored. view.js applies it before the page paints. Still no cookies and no network call of its own.
(function () {
  // The tint: the header button sets data-theme on <html> and keeps the choice, so it holds on the next page. If the browser refuses storage the page in view still changes.
  var t = document.querySelector('[data-tint]');
  if (t) t.addEventListener('click', function () {
    var r = document.documentElement, cur = r.getAttribute('data-theme');
    var dark = cur ? cur === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    r.setAttribute('data-theme', dark ? 'light' : 'dark'); t.setAttribute('aria-pressed', dark ? 'false' : 'true');
    try { window.localStorage.setItem('allooloo-view', dark ? 'day' : 'night'); } catch (e) {}
  });
  // A link to another Allooloo site carries the choice (a browser keeps storage apart for each site). Only when a choice has been made; only to Allooloo sites.
  var ESTATE = /(^|\.)(allooloo\.(io|ai)|[a-z]{2}-issuer\.ai|eu-issuer\.ai|[a-z]{2}-cm-kg\.(ai|org)|eu-cm-kg\.ai|get[a-z]+\.ai|data-[a-z]+\.ai|agentic-[a-z0-9]+\.ai|agent-[a-z0-9]+\.ai|kyp-model\.(ai|org)|issuerwire\.(ai|org)|cm-record\.org|capitalmarketsknowledgegraph\.ai)$/;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a || a.hash || a.host === location.host || !ESTATE.test(a.hostname)) return;
    var v = null; try { v = window.localStorage.getItem('allooloo-view'); } catch (x) {}
    if (!v) { var c = document.documentElement.getAttribute('data-theme'); v = c === 'dark' ? 'night' : c === 'light' ? 'day' : null; }
    if (v === 'day' || v === 'night') a.hash = 'view=' + v;
  }, true);
  // Copy: a button with data-copy="<id>" copies that element's text to the clipboard.
  var cs = document.querySelectorAll('[data-copy]');
  for (var i = 0; i < cs.length; i++) cs[i].addEventListener('click', function (e) {
    var el = document.getElementById(e.currentTarget.getAttribute('data-copy')); if (!el || !navigator.clipboard) return;
    navigator.clipboard.writeText(el.textContent.trim());
  });
})();
(function () {
  var f = document.getElementById('contact'); if (!f) return;
  var host = location.hostname;
  var tool = {
    name: 'contact_us',
    description: 'Send a message to Allooloo Technologies Corp. through the contact form of record on ' + host + ' (a reply-to email and a message; read and answered by the operator).',
    inputSchema: { type: 'object', properties: { email: { type: 'string', description: 'reply-to email address' }, message: { type: 'string', description: 'the message' } }, required: ['email', 'message'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: function (input) {
      var e = f.querySelector('[name=email]'), m = f.querySelector('[name=message]');
      if (e) e.value = (input && input.email) || ''; if (m) m.value = (input && input.message) || '';
      if (f.requestSubmit) f.requestSubmit(); else f.submit();
      return { status: 'submitted', site: host };
    }
  };
  var mc = navigator.modelContext; if (!mc) return;
  if (typeof mc.registerTool === 'function') mc.registerTool(tool);
  else if (typeof mc.provideContext === 'function') mc.provideContext({ tools: [tool] });
})();
