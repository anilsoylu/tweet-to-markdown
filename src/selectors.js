(function (root) {
  'use strict';

  // ── The ONLY place X-specific selectors live. Fix breakage here. ──────────
  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]',
    tweetText: 'div[data-testid="tweetText"]',
    time: 'time',
    photo: 'div[data-testid="tweetPhoto"] img',
    videoPlayer: 'div[data-testid="videoPlayer"], div[data-testid="videoComponent"]',
    actionBar: 'div[role="group"]'
  };

  // Parse "/handle/status/12345" from a permalink href. Returns {handle, id} or null.
  function parsePermalink(href) {
    if (!href) return null;
    const m = href.match(/^\/([^/]+)\/status\/(\d+)/);
    return m ? { handle: m[1], id: m[2] } : null;
  }

  // The author whose self-thread we capture = the handle in the page URL.
  // Tweet page URL is always /<handle>/status/<id>.
  function pageAuthorHandle() {
    const m = location.pathname.match(/^\/([^/]+)\/status\/\d+/);
    return m ? m[1] : null;
  }

  const api = { SELECTORS, parsePermalink, pageAuthorHandle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
