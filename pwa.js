// Registers the service worker and offers "Install app" (Android / desktop Chrome and Edge; a short hint on iPhone / iPad).
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage('SKIP_WAITING'); });
        });
      }).catch(function () {});
    });
  }

  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;                                               // already installed: no button
  var KEY = 'mkc_install_dismissed';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}

  function bar(text, action, label) {
    var d = document.createElement('div');
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Install app');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;max-width:460px;margin:0 auto;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;background:#0f1424;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.35);font:14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif';
    var img = document.createElement('img'); img.src = 'assets/icons/icon-192.png'; img.alt = ''; img.style.cssText = 'width:36px;height:36px;border-radius:50%;flex:none;background:#fff';
    var t = document.createElement('span'); t.textContent = text; t.style.flex = '1';
    d.appendChild(img); d.appendChild(t);
    if (action) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'border:0;border-radius:9px;padding:9px 14px;background:#c0392b;color:#fff;font-weight:700;cursor:pointer'; b.onclick = function () { action(d); }; d.appendChild(b); }
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '\u00d7'; x.setAttribute('aria-label', 'Close');
    x.style.cssText = 'border:0;background:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;opacity:.8';
    x.onclick = function () { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} d.remove(); };
    d.appendChild(x); document.body.appendChild(d); return d;
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    bar('Install MKC Portal on this device', function (d) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; d.remove(); }); }, 'Install');
  });
  window.addEventListener('appinstalled', function () { var r = document.querySelector('[aria-label="Install app"]'); if (r) r.remove(); });

  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios) window.addEventListener('load', function () { setTimeout(function () { bar('To install: tap Share, then \u201cAdd to Home Screen\u201d.'); }, 1500); });
})();
