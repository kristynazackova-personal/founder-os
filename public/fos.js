/* Founder OS attribution snippet. <5KB, no cookies, anonymous id only.
 * <script async src="https://<founder-os>/fos.js" data-key="fos_xxx"></script>
 * window.fos('signup') | window.fos('activation') | window.fos('purchase', {amount: 19}) */
(function () {
  if (window.__fos) return;
  var s = document.currentScript || (function () { var a = document.getElementsByTagName('script'); return a[a.length - 1]; })();
  var key = s && s.getAttribute('data-key');
  if (!key) return;
  var origin = (function () { try { return new URL(s.src).origin; } catch (e) { return ''; } })();
  var endpoint = origin + '/api/collect';
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  var id = store.get('fos_id');
  if (!id) {
    id = 'a' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    store.set('fos_id', id);
  }
  var q = {};
  try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
  var src = store.get('fos_src');
  var source;
  try { source = src ? JSON.parse(src) : null; } catch (e) { source = null; }
  if (!source) {
    var ref = document.referrer || '';
    var sameHost = false;
    try { sameHost = ref && new URL(ref).hostname === location.hostname; } catch (e) {}
    source = { utmSource: q.utm_source || null, utmMedium: q.utm_medium || null, utmCampaign: q.utm_campaign || null, referrer: sameHost ? null : (ref || null), landingPath: location.pathname };
    store.set('fos_src', JSON.stringify(source));
  }

  function send(event, props) {
    var body = JSON.stringify({ key: key, anonId: id, event: event, source: source, path: location.pathname, props: props || {} });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch(endpoint, { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'text/plain' } }); } catch (e) {}
  }

  var allowed = { signup: 1, activation: 1, checkout_view: 1, purchase: 1 };
  var api = function (event, props) { if (allowed[event]) send(event, props); };
  api.id = id;
  window.fos = api;
  window.__fos = true;

  // Once per session per path: a page view.
  var seenKey = 'fos_pv_' + location.pathname;
  var seen = false;
  try { seen = sessionStorage.getItem(seenKey) === '1'; sessionStorage.setItem(seenKey, '1'); } catch (e) {}
  if (!seen) send('pageview');

  // Checkout links through Founder OS carry the anonymous id so purchases join back.
  function decorate() {
    var links = document.querySelectorAll('a[href*="/pay/"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.__fos) continue;
      try {
        var u = new URL(a.href, location.href);
        if (u.origin !== origin) continue;
        u.searchParams.set('fos', id);
        a.href = u.toString();
        a.__fos = true;
        a.addEventListener('click', function () { send('checkout_view'); });
      } catch (e) {}
    }
  }
  decorate();
  if (window.MutationObserver) new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
})();
