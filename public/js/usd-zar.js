/**
 * Compact USD → ZAR display for the storefront.
 * Prefers same-origin /api/fx-rate (server proxy), then public APIs, then fallback.
 */
(function (global) {
  var CACHE_KEY = 'usd_zar_rate_v2';
  var CACHE_MS = 60 * 60 * 1000;
  /** Approximate USD→ZAR so labels never stay blank if APIs fail. */
  var FALLBACK_RATE = 18.5;
  var rate = null;
  var loading = null;

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.rate || !o.at || Date.now() - o.at > CACHE_MS) return null;
      return Number(o.rate);
    } catch (e) {
      return null;
    }
  }

  function writeCache(r) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ rate: r, at: Date.now() }));
    } catch (e) {}
  }

  function applyRate(r) {
    var n = Number(r);
    if (!isFinite(n) || n <= 0) return null;
    rate = n;
    writeCache(n);
    return n;
  }

  function fetchRate() {
    if (rate != null && isFinite(rate)) return Promise.resolve(rate);
    var cached = readCache();
    if (cached != null) {
      rate = cached;
      return Promise.resolve(rate);
    }
    if (loading) return loading;

    function fromJson(d) {
      var zar = d && (d.rate != null ? d.rate : d.rates && d.rates.ZAR);
      return applyRate(zar);
    }

    loading = fetch('/api/fx-rate')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) {
        var got = fromJson(d);
        if (got == null) throw new Error('no rate');
        return got;
      })
      .catch(function () {
        return fetch('https://api.frankfurter.app/latest?from=USD&to=ZAR')
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var got = fromJson(d);
            if (got == null) throw new Error('no rate');
            return got;
          });
      })
      .catch(function () {
        return fetch('https://open.er-api.com/v6/latest/USD')
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var got = fromJson(d);
            if (got == null) throw new Error('no rate');
            return got;
          });
      })
      .catch(function () {
        return applyRate(FALLBACK_RATE);
      })
      .finally(function () { loading = null; });

    return loading;
  }

  function zarAmount(usd) {
    var n = Number(usd);
    if (!isFinite(n) || n <= 0) return null;
    var r = rate != null && isFinite(rate) ? rate : FALLBACK_RATE;
    return Math.round(n * r);
  }

  function zarLabel(usd) {
    var z = zarAmount(usd);
    if (z == null) return '';
    return '≈ R' + z.toLocaleString('en-US');
  }

  function zarSpan(usd, extraClass) {
    var n = Number(usd);
    if (!isFinite(n) || n <= 0) return '';
    var label = zarLabel(n);
    var cls = 'zar-eq' + (extraClass ? ' ' + extraClass : '');
    return '<span class="' + cls + '" data-usd="' + n + '">' + (label || '') + '</span>';
  }

  function refresh(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-usd]');
    if (!nodes.length) return;
    /* Paint fallback immediately so ZAR never looks "missing" */
    nodes.forEach(function (el) {
      var usd = Number(el.getAttribute('data-usd'));
      var label = zarLabel(usd);
      if (label) el.textContent = label;
    });
    fetchRate().then(function () {
      nodes.forEach(function (el) {
        var usd = Number(el.getAttribute('data-usd'));
        var label = zarLabel(usd);
        if (label) el.textContent = label;
      });
    }).catch(function () {});
  }

  function ensure(usd) {
    return fetchRate().then(function () {
      return zarLabel(usd);
    }).catch(function () { return zarLabel(usd); });
  }

  /* Warm cache as soon as script loads */
  fetchRate().catch(function () {});

  global.UsdZar = {
    fetchRate: fetchRate,
    zarAmount: zarAmount,
    zarLabel: zarLabel,
    zarSpan: zarSpan,
    refresh: refresh,
    ensure: ensure,
  };
})(typeof window !== 'undefined' ? window : globalThis);
