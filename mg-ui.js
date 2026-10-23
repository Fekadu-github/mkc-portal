/* Light/dark theme, Ctrl+K people search and the phone bottom bar (look and feel shared with MG Auto). */
(function () {
  var root = document.documentElement, KEY = 'mkc_theme';
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) { /* private mode: this tab only */ }
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'light' ? '#eef2fb' : '#060912');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });
  setTheme(root.getAttribute('data-theme') || 'dark');

  var app = document.getElementById('app'), btm = document.querySelector('.btm');
  function goPeople(focus) {
    var item = document.querySelector('.nav-item[data-view="members"]');
    if (!item || item.classList.contains('hidden')) return;
    item.click();
    if (focus) setTimeout(function () { var f = document.getElementById('memberSearch'); if (f) { f.focus(); f.select(); } }, 60);
  }
  var sbtn = document.getElementById('mgSearch'); if (sbtn) sbtn.addEventListener('click', function () { goPeople(true); });
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (app && app.classList.contains('hidden')) return;
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) { e.preventDefault(); goPeople(true); }
  });

  // bottom bar: only while signed in, only the screens this role may open, the current screen highlighted
  function sync() {
    if (!btm) return;
    btm.style.display = app && app.classList.contains('hidden') ? 'none' : '';
    btm.querySelectorAll('[data-view]').forEach(function (b) {
      var n = document.querySelector('.nav-item[data-view="' + b.dataset.view + '"]');
      b.style.display = n && n.classList.contains('hidden') ? 'none' : '';
      b.classList.toggle('on', !!(n && n.classList.contains('active')));
    });
  }
  var menu = document.getElementById('btmMenu');
  if (menu) menu.addEventListener('click', function () { var m = document.getElementById('mobileMenu'); if (m) m.click(); });
  var nav = document.querySelector('.sidebar nav');
  if (nav) new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  if (app) new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
