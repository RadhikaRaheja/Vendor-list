// ==========================================================
// API — thin wrapper around fetch() for talking to the Apps Script
// backend. GET is used for reads, POST for writes.
//
// POST bodies are sent with Content-Type "text/plain" on purpose:
// that keeps the request a CORS "simple request" so the browser
// doesn't send a preflight OPTIONS call, which Apps Script web apps
// don't handle. The backend still parses the body as JSON.
// ==========================================================

const Api = (() => {
  function isConfigured() {
    return typeof API_URL === 'string' &&
      API_URL.indexOf('http') === 0 &&
      API_URL.indexOf('PASTE_YOUR') === -1;
  }

  async function get(action, params = {}) {
    if (!isConfigured()) throw new Error('NOT_CONFIGURED');
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });

    let res;
    try {
      res = await fetch(url.toString(), { method: 'GET' });
    } catch (networkErr) {
      throw new Error('NETWORK_ERROR');
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  async function post(action, data = {}) {
    if (!isConfigured()) throw new Error('NOT_CONFIGURED');
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data }),
      });
    } catch (networkErr) {
      throw new Error('NETWORK_ERROR');
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }

  return { get, post, isConfigured };
})();
