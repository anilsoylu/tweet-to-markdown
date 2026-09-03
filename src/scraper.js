(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const dep = isNode ? require('./selectors.js') : (root.TTM || {});
  const { SELECTORS, parsePermalink, pageAuthorHandle, isExternalLink, pageStatusId } = dep;

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
      else if (node.nodeName === 'A') {
        const href = node.getAttribute('href') || '';
        const text = node.textContent;
        out += isExternalLink(href) ? '[' + text + '](' + href + ')' : text;
      } else out += extractText(node); // SPAN/DIV/etc.
    }
    return out;
  }

  // Elements of this tweet only — a quoted tweet embeds a full copy of every selector.
  const own = (article, selector) => Array.from(article.querySelectorAll(selector))
    .filter((el) => !el.closest(SELECTORS.quotedTweet));

  // A tweet's own timestamp is the one wrapped in its permalink anchor; the others
  // (relative "· 11h" labels, cards) sit outside any anchor.
  function tweetPermalink(article) {
    for (const timeEl of own(article, SELECTORS.time)) {
      const anchor = timeEl.closest('a');
      const link = parsePermalink(anchor && anchor.getAttribute('href'));
      if (link) return { ...link, timeEl };
    }
    return null;
  }

  function parseTweet(article) {
    const link = tweetPermalink(article);
    if (!link) return null; // tweets without a parseable permalink are skipped
    const textEl = own(article, SELECTORS.tweetText)[0];
    const images = own(article, SELECTORS.photo).map((img) => toOriginalImage(img.src));
    const links = [];
    const seenHref = new Set();
    for (const a of own(article, SELECTORS.cardLink)) {
      const href = a.href; // absolute
      if (!isExternalLink(href) || seenHref.has(href)) continue;
      seenHref.add(href);
      const label = (a.getAttribute('aria-label') || a.textContent || href).trim();
      links.push({ text: label || href, href });
    }
    return {
      id: link.id,
      handle: link.handle,
      text: extractText(textEl).trim(),
      images,
      links,
      hasVideo: own(article, SELECTORS.videoPlayer).length > 0,
      permalink: 'https://x.com/' + link.handle + '/status/' + link.id,
      timestamp: link.timeEl.getAttribute('datetime')
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
    const authorLc = author.toLowerCase();

    const byId = new Map();
    let foreignAfterAuthor = false;
    let stable = 0;

    for (let i = 0; i < maxScrolls && !foreignAfterAuthor && stable < 3; i++) {
      const before = byId.size;
      for (const art of document.querySelectorAll(SELECTORS.tweet)) {
        const t = parseTweet(art);
        if (!t) continue;
        if (t.handle.toLowerCase() === authorLc) {          // #4: case-insensitive
          if (!byId.has(t.id)) byId.set(t.id, { ...t, order: byId.size });
        } else if (byId.size > 0) {
          foreignAfterAuthor = true;                        // #2: stop AT the boundary
          break;                                            //     within this pass too
        }
      }
      const grew = byId.size !== before;
      const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 200);
      stable = (!grew && atBottom) ? stable + 1 : 0;        // #3: only count no-growth at page bottom
      window.scrollBy(0, window.innerHeight * 0.85);
      await sleep(settleMs);
    }
    window.scrollTo(0, 0);
    // Missing the tweet the URL points at means we latched onto the wrong run of
    // tweets — a plausible-looking wrong thread is worse than an error.
    if (!byId.has(pageStatusId())) throw new Error('FOCAL_TWEET_NOT_FOUND');

    const tweets = [...byId.values()].sort((a, b) => a.order - b.order)
      .map(({ order, ...rest }) => rest);
    return {
      author: tweets[0].handle,                             // canonical casing from the tweet
      sourceUrl: location.href.split('?')[0],
      tweets
    };
  }

  const api = { toOriginalImage, extractText, tweetPermalink, parseTweet, scrapeThread };
  if (isNode) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
