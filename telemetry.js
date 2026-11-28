/**
 * Inertial web telemetry — cookieless, session-only PostHog capture.
 *
 * Privacy contract (PRD §9 & /privacy/):
 *   - No cookies, no localStorage, no third-party SDK, no cross-site tracking.
 *   - Uses a random per-tab sessionStorage id (`inertial_sid`) that dies when
 *     the tab closes. Never stores or sends email, phone, handle, or GPS.
 *   - Respects Do Not Track (`navigator.doNotTrack === '1'`).
 *   - Silent no-op when `window.INERTIAL_SITE.posthog` is unset (preview
 *     deploys without config.js emit zero network requests).
 *
 * Events emitted:
 *   - `$pageview` on every page load (safe attribution params only)
 *   - `web_cta_clicked` on clicks to /waitlist or /beta
 *   - `web_download_clicked` on clicks to /android, inertial-beta.apk, or TestFlight
 *   - `web_waitlist_submitted` via `window.inertialTrack(...)` from waitlist.html
 */
(function () {
  'use strict';

  var cfg = (window.INERTIAL_SITE && window.INERTIAL_SITE.posthog) || null;
  if (!cfg || !cfg.apiKey) {
    window.inertialTrack = function () {};
    return;
  }

  var dnt =
    (typeof navigator !== 'undefined' &&
      (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes')) ||
    window.doNotTrack === '1';
  if (dnt) {
    window.inertialTrack = function () {};
    return;
  }

  var host = String(cfg.host || 'https://us.i.posthog.com').replace(/\/+$/, '');
  var endpoint = host + '/capture/';

  var SAFE_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'src',
    'ref',
  ];

  function randomId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'web_' + crypto.randomUUID().replace(/-/g, '');
    }
    return 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function sessionId() {
    try {
      var existing = sessionStorage.getItem('inertial_sid');
      if (existing) return existing;
      var fresh = randomId();
      sessionStorage.setItem('inertial_sid', fresh);
      return fresh;
    } catch {
      return randomId();
    }
  }

  var distinctId = sessionId();

  function classifySurface(pathname) {
    var p = String(pathname || '/').replace(/\/+$/, '') || '/';
    if (p === '/') return 'launch';
    if (p === '/waitlist') return 'waitlist';
    if (p === '/beta') return 'beta';
    if (p === '/android' || p === '/ig' || p === '/threads') return 'redirect';
    if (p === '/privacy' || p === '/community' || p === '/delete-account') return 'legal';
    if (
      p === '/blog' ||
      p.indexOf('/blog/') === 0 ||
      p === '/glossary' ||
      p.indexOf('/glossary/') === 0 ||
      p === '/tools' ||
      p.indexOf('/tools/') === 0 ||
      p === '/pace' ||
      p.indexOf('/pace/') === 0 ||
      p === '/method' ||
      p.indexOf('/method/') === 0 ||
      p === '/about'
    ) {
      return 'plain_words';
    }
    return 'other';
  }

  function safeAttribution() {
    var out = {};
    try {
      var params = new URLSearchParams(location.search || '');
      for (var i = 0; i < SAFE_PARAMS.length; i++) {
        var key = SAFE_PARAMS[i];
        var val = params.get(key);
        if (val) out[key] = String(val).slice(0, 64);
      }
    } catch {
      /* ignore malformed query strings */
    }
    return out;
  }

  function cleanUrl() {
    var attr = safeAttribution();
    var keys = Object.keys(attr);
    var base = location.origin + location.pathname;
    if (!keys.length) return base;
    var qs = keys
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(attr[k]);
      })
      .join('&');
    return base + '?' + qs;
  }

  function referrerDomain() {
    if (!document.referrer) return '';
    try {
      return new URL(document.referrer).hostname || '';
    } catch {
      return '';
    }
  }

  function baseProps() {
    var props = {
      $current_url: cleanUrl(),
      $pathname: location.pathname || '/',
      $host: location.host || '',
      $referrer: document.referrer || '',
      $referring_domain: referrerDomain(),
      $lib: 'inertial-web-lite',
      $process_person_profile: false,
      surface: classifySurface(location.pathname),
    };
    var attr = safeAttribution();
    var keys = Object.keys(attr);
    for (var i = 0; i < keys.length; i++) {
      props[keys[i]] = attr[keys[i]];
    }
    return props;
  }

  function send(eventName, extra) {
    if (!eventName) return;
    var props = baseProps();
    if (extra && typeof extra === 'object') {
      var keys = Object.keys(extra);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = extra[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          props[k] = v;
        }
      }
    }
    var payload = JSON.stringify({
      api_key: cfg.apiKey,
      event: eventName,
      distinct_id: distinctId,
      properties: props,
      timestamp: new Date().toISOString(),
    });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        var blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch {
      /* fall through to fetch */
    }
    try {
      if (typeof fetch === 'function') {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(function () {});
      }
    } catch {
      /* silent */
    }
  }

  window.inertialTrack = send;

  if (
    !document.documentElement ||
    !document.documentElement.hasAttribute('data-no-auto-pageview')
  ) {
    send('$pageview');
  }

  document.addEventListener(
    'click',
    function (ev) {
      var el = ev.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el || !el.getAttribute) return;
      var rawHref = el.getAttribute('href') || '';
      if (!rawHref || rawHref.charAt(0) === '#') return;
      var lower = rawHref.toLowerCase();
      if (lower.indexOf('apps.apple.com') !== -1) {
        send('web_download_clicked', { platform: 'ios', target: 'app_store' });
      } else if (lower.indexOf('testflight.apple.com') !== -1) {
        send('web_download_clicked', { platform: 'ios', target: 'testflight' });
      } else if (
        lower === 'android' ||
        lower === '/android' ||
        lower === './android' ||
        lower.indexOf('inertial-beta.apk') !== -1
      ) {
        send('web_download_clicked', { platform: 'android', target: 'apk' });
      } else if (lower.indexOf('/waitlist') !== -1 || lower.indexOf('waitlist') === 0) {
        send('web_cta_clicked', { target: 'waitlist' });
      } else if (lower === '/beta' || lower === 'beta' || lower === './beta') {
        send('web_cta_clicked', { target: 'beta' });
      }
    },
    { passive: true },
  );
})();
