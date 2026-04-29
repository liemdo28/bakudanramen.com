'use strict';
/**
 * site-config.js — Runtime config loader
 *
 * Fetches /data/site-config.json (single source of truth for all business links)
 * and does two things:
 *
 *   1. Updates every [data-config-link] element's href attribute.
 *      The attribute value is a dot-notation path into the config object.
 *      Example: data-config-link="locations.the-rim.toast_order_url"
 *
 *   2. Patches window.STORES if present (used by the geo-order page in
 *      links/bakudan-temp/order/). Since geolocation permission is async,
 *      the patch arrives before the user grants access in practice.
 *
 * Exposes window.__siteConfig for other scripts that need config values.
 */
(function () {
  var CONFIG_URL = '/data/site-config.json';

  /** Traverse a dot-notation path like "locations.the-rim.toast_order_url" */
  function deepGet(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o != null && Object.prototype.hasOwnProperty.call(o, k)) ? o[k] : null;
    }, obj);
  }

  function applyConfig(config) {
    // ── 1. Resolve [data-config-link] attributes ─────────────────────────
    var els = document.querySelectorAll('[data-config-link]');
    for (var i = 0; i < els.length; i++) {
      var el  = els[i];
      var val = deepGet(config, el.getAttribute('data-config-link'));
      if (val) {
        el.href = val;
      }
    }

    // ── 2. Patch window.STORES if present (geo-order page) ───────────────
    if (window.STORES && Array.isArray(window.STORES)) {
      var keyMap = {
        'rim':       'locations.the-rim.toast_order_url',
        'stone-oak': 'locations.stone-oak.toast_order_url',
        'bandera':   'locations.bandera.toast_order_url'
      };
      for (var j = 0; j < window.STORES.length; j++) {
        var s    = window.STORES[j];
        var path = keyMap[s.key];
        if (path) {
          var url = deepGet(config, path);
          if (url) s.url = url;
        }
      }
    }
  }

  function load() {
    fetch(CONFIG_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (config) {
        applyConfig(config);
        window.__siteConfig = config;
      })
      .catch(function (e) {
        console.warn('[site-config] Could not load config:', e.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
