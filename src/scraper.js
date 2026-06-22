(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const dep = isNode ? require('./selectors.js') : (root.TTM || {});
  const { SELECTORS, parsePermalink, pageAuthorHandle } = dep;

  function toOriginalImage(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'pbs.twimg.com') u.searchParams.set('name', 'orig');
      return u.toString();
    } catch { return url; }
  }

  // Reconstruct tweet text from the tweetText node, preserving emoji and newlines.
  function extractText(el) {
    if (!el) return '';
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3 /* TEXT_NODE */) out += node.textContent;
      else if (node.nodeName === 'IMG') out += node.getAttribute('alt') || '';
      else if (node.nodeName === 'BR') out += '\n';
      else if (node.nodeName === 'A') out += node.textContent;
      else out += extractText(node); // SPAN/DIV/etc.
    }
    return out;
  }

  function parseTweet(article) {
    const timeEl = article.querySelector(SELECTORS.time);
    const anchor = timeEl && timeEl.closest('a');
    const link = parsePermalink(anchor && anchor.getAttribute('href'));
    if (!link) return null; // tweets without a parseable permalink are skipped
    const textEl = article.querySelector(SELECTORS.tweetText);
    const images = Array.from(article.querySelectorAll(SELECTORS.photo))
      .map((img) => toOriginalImage(img.src));
    return {
      id: link.id,
      handle: link.handle,
      text: extractText(textEl).trim(),
      images,
      hasVideo: !!article.querySelector(SELECTORS.videoPlayer),
      permalink: 'https://x.com/' + link.handle + '/status/' + link.id,
      timestamp: (timeEl && timeEl.getAttribute('datetime')) || null
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Scroll-and-accumulate to defeat virtualization. Captures the contiguous run
  // of tweets authored by `author`, stopping once a different author's tweet
  // appears below the author run (the thread boundary).
  async function scrapeThread(opts) {
    const o = opts || {};
    const maxScrolls = o.maxScrolls || 60;
    const settleMs = o.settleMs || 700;
    const author = pageAuthorHandle();
    if (!author) throw new Error('NOT_A_TWEET_PAGE');

    const byId = new Map();
    let foreignAfterAuthor = false;
    let stable = 0;

    for (let i = 0; i < maxScrolls && !foreignAfterAuthor && stable < 3; i++) {
      const before = byId.size;
      for (const art of document.querySelectorAll(SELECTORS.tweet)) {
        const t = parseTweet(art);
        if (!t) continue;
        if (t.handle === author) {
          if (!byId.has(t.id)) byId.set(t.id, { ...t, order: byId.size });
        } else if (byId.size > 0) {
          foreignAfterAuthor = true; // a non-author tweet below the author run = end
        }
      }
      stable = byId.size === before ? stable + 1 : 0;
      window.scrollBy(0, window.innerHeight * 0.85);
      await sleep(settleMs);
    }
    window.scrollTo(0, 0);

    const tweets = [...byId.values()].sort((a, b) => a.order - b.order)
      .map(({ order, ...rest }) => rest);
    return {
      author,
      sourceUrl: location.href.split('?')[0],
      tweets
    };
  }

  const api = { toOriginalImage, extractText, parseTweet, scrapeThread };
  if (isNode) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
