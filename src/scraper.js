(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const dep = isNode
    ? Object.assign({}, require('./selectors.js'), require('./article.js'))
    : (root.TTM || {});
  const { SELECTORS, parsePermalink, pageAuthorHandle, isExternalLink, pageStatusId,
          toOriginalImage, extractArticle } = dep;

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
    // An article's inline photos are emitted by the block walk in their own positions;
    // only the cover, which sits outside the body, belongs in `images`.
    const images = own(article, SELECTORS.photo)
      .filter((img) => !img.closest(SELECTORS.articleBody))
      .map((img) => toOriginalImage(img.src));
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
      article: extractArticle(article),
      images,
      links,
      hasVideo: own(article, SELECTORS.videoPlayer).length > 0,
      permalink: 'https://x.com/' + link.handle + '/status/' + link.id,
      timestamp: link.timeEl.getAttribute('datetime')
    };
  }

  // Resolve as soon as the DOM stops changing instead of after a flat wait: X mounts
  // tweets and article images lazily, so most of a fixed wait was idle time.
  function settle(capMs, quietMs) {
    return new Promise((resolve) => {
      let quiet, cap, obs;
      const done = () => { obs.disconnect(); clearTimeout(quiet); clearTimeout(cap); resolve(); };
      const restart = () => { clearTimeout(quiet); quiet = setTimeout(done, quietMs); };
      obs = new MutationObserver(restart);
      obs.observe(document.body, { childList: true, subtree: true });
      cap = setTimeout(done, capMs);
      restart();
    });
  }

  function scrollPercent() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100)));
  }

  // Scroll-and-accumulate to defeat virtualization. Captures the contiguous run
  // of tweets authored by `author`, stopping once a different author's tweet
  // appears below the author run (the thread boundary).
  async function scrapeThread(opts) {
    const o = opts || {};
    const maxScrolls = o.maxScrolls || 60;
    const settleMs = o.settleMs || 700;
    const quietMs = o.quietMs || 150;
    const onProgress = o.onProgress;
    const author = pageAuthorHandle();
    if (!author) throw new Error('NOT_A_TWEET_PAGE');
    const authorLc = author.toLowerCase();

    const byId = new Map();
    let foreignAfterAuthor = false;
    let stable = 0;
    const startY = window.scrollY;

    try {
      for (let i = 0; i < maxScrolls && !foreignAfterAuthor && stable < 3; i++) {
        const before = byId.size;
        for (const art of document.querySelectorAll(SELECTORS.tweet)) {
          // Permalink first: it is cheap, and re-parsing a known tweet every scroll pass
          // would re-walk an article body of thousands of nodes for nothing.
          const link = tweetPermalink(art);
          if (!link) continue;
          if (link.handle.toLowerCase() === authorLc) {       // #4: case-insensitive
            if (byId.has(link.id)) continue;
            byId.set(link.id, { ...parseTweet(art), order: byId.size });
          } else if (byId.size > 0) {
            foreignAfterAuthor = true;                        // #2: stop AT the boundary
            break;                                            //     within this pass too
          }
        }
        const grew = byId.size !== before;
        const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 200);
        stable = (!grew && atBottom) ? stable + 1 : 0;        // #3: only count no-growth at page bottom
        window.scrollBy(0, window.innerHeight * 0.85);
        if (onProgress) onProgress(scrollPercent());
        await settle(settleMs, quietMs);
      }
      // Each tweet keeps its first parse, which on an Article is taken before X has
      // mounted a single one of its lazily loaded images. Re-read what is still mounted.
      for (const art of document.querySelectorAll(SELECTORS.tweet)) {
        const link = tweetPermalink(art);
        const prev = link && byId.get(link.id);
        if (prev) byId.set(link.id, { ...parseTweet(art), order: prev.order });
      }
    } finally {
      window.scrollTo(0, startY);
    }
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
