const test = require('node:test');
const assert = require('node:assert');
const { scrapeThread } = require('../src/scraper.js');

// scrapeThread reads document/window/location/MutationObserver as free globals, so the
// fake is installed on globalThis and every replaced key is put back afterwards.
function withFakeDom(over, fn) {
  const state = {
    scrollBy: [],
    scrollTo: [],
    tweetQueries: 0
  };
  const fake = {
    location: { pathname: '/dril/status/9', href: 'https://x.com/dril/status/9' },
    document: {
      body: {},
      documentElement: { scrollHeight: 8000 },
      querySelectorAll: () => { state.tweetQueries++; return []; }
    },
    window: {
      scrollY: 1234,
      innerHeight: 900,
      scrollBy: (x, y) => state.scrollBy.push([x, y]),
      scrollTo: (x, y) => state.scrollTo.push([x, y])
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    }
  };
  Object.assign(fake, over || {});
  const saved = new Map();
  for (const key of Object.keys(fake)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: fake[key], configurable: true, writable: true });
  }
  const restore = () => {
    for (const [key, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  };
  return Promise.resolve(fn(state, fake)).finally(restore);
}

const opts = (extra) => Object.assign({ settleMs: 5, quietMs: 1 }, extra);

test('stopping on the first pass rejects with ABORTED and never scrolls away', () =>
  withFakeDom(null, async (state) => {
    await assert.rejects(scrapeThread(opts({ shouldStop: () => true })), /^Error: ABORTED$/);
    assert.deepStrictEqual(state.scrollBy, []);
    assert.strictEqual(state.tweetQueries, 0);
  }));

test('aborting restores the scroll position the reader started at', () =>
  withFakeDom(null, async (state) => {
    await assert.rejects(scrapeThread(opts({ shouldStop: () => true })));
    assert.deepStrictEqual(state.scrollTo, [[0, 1234]]);
  }));

test('stopping after two passes ends the loop there and skips the post-loop re-parse', () =>
  withFakeDom(null, async (state) => {
    let asked = 0;
    await assert.rejects(scrapeThread(opts({ shouldStop: () => ++asked > 2 })), /^Error: ABORTED$/);
    assert.strictEqual(asked, 3);
    assert.strictEqual(state.tweetQueries, 2);
    assert.strictEqual(state.scrollBy.length, 2);
  }));

test('a page that is not a tweet page throws before any scrolling happens', () =>
  withFakeDom({ location: { pathname: '/home', href: 'https://x.com/home' } }, async (state) => {
    await assert.rejects(scrapeThread(opts()), /^Error: NOT_A_TWEET_PAGE$/);
    assert.deepStrictEqual(state.scrollBy, []);
    assert.deepStrictEqual(state.scrollTo, []);
  }));
