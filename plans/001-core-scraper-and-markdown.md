# Plan 001: Core — scaffold, thread scraper, and Markdown builder (unit-tested)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: This is a **greenfield** repo. Run `ls` in the
> project root. If `src/` already contains `.js` files or `manifest.json`
> already exists, STOP — another run may be in progress; report what you find.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (X DOM selectors are inherently brittle; mitigated by centralizing them)
- **Depends on**: none
- **Category**: direction (new feature build)
- **Planned at**: greenfield — no baseline commit (first step initializes git)

## Why this matters

This plan builds the brain of the extension: given the X tweet page DOM, produce
a clean Markdown string for the original tweet plus the author's self-reply
chain. Keeping this logic in pure, side-effect-free modules (`scraper.js`,
`markdown.js`) means the Markdown formatter can be **unit-tested in Node without
a browser**, which is the only automated quality gate available for a Chrome
extension. Plan 002 builds the UI on top of these functions. If the core is
correct and tested, the UI plan becomes a thin, low-risk layer.

## Current state

Empty repository. Working directory: project root (the folder containing this
`plans/` directory). Nothing exists yet except `plans/`.

### Conventions this project will follow (you are establishing them — be consistent)

- **No build step, no npm dependencies for the extension itself.** Content
  scripts are plain classic `.js` files (NOT ES modules) listed in
  `manifest.json`. They share state through a single global namespace object
  `globalThis.TTM`.
- **Dual-environment module pattern** so the same file works as a content script
  *and* can be `require()`d by Node tests. Every `src/*.js` file uses this exact
  wrapper shape:

  ```js
  (function (root) {
    'use strict';
    // ... define functions ...
    const api = { /* functions to expose */ };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node
    root.TTM = root.TTM || {};
    Object.assign(root.TTM, api); // browser content script
  })(typeof globalThis !== 'undefined' ? globalThis : this);
  ```

- **All X DOM selectors live ONLY in `src/selectors.js`.** No other file may
  contain a `data-testid` string or X-specific CSS selector. This is the single
  place a contributor edits when X breaks the UI.
- 2-space indentation, single quotes, semicolons.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Check Node present | `node --version` | prints v18+ (any v18/20/22 is fine) |
| Validate manifest JSON | `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"` | prints `ok`, exit 0 |
| Run unit tests | `node --test` | all tests pass, exit 0 |

There is **no** `npm install` — the extension has zero runtime dependencies and
tests use Node's built-in `node:test` and `node:assert`.

## Scope

**In scope** (create these files):
- `.gitignore`
- `manifest.json`
- `src/selectors.js`
- `src/scraper.js`
- `src/markdown.js`
- `test/markdown.test.js`
- `icons/` — placeholder icon files (16/48/128 px)

**Out of scope** (do NOT create or touch in this plan — they belong to plan 002):
- `src/ui.js`, `src/content.js` — the button and preview panel.
- `README.md`, `LICENSE` — written in plan 002.
- Any actual button injection, clipboard, or DOM-writing behavior.

## Git workflow

- Step 0 initializes git. Branch name: `main` is fine (greenfield).
- Commit per logical step. Message style: short imperative, e.g.
  `scaffold manifest and gitignore`, `add tweet scraper`. Do NOT push.

## Steps

### Step 0: Initialize the repo

Run `git init` in the project root. Create `.gitignore` with:

```
node_modules/
.DS_Store
*.zip
```

**Verify**: `git status` → shows untracked files, exit 0.

### Step 1: Create `manifest.json` (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "Tweet to Markdown",
  "version": "0.1.0",
  "description": "Convert an X tweet and the author's self-reply thread into a single Markdown document.",
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "content_scripts": [
    {
      "matches": ["https://x.com/*", "https://twitter.com/*"],
      "js": ["src/selectors.js", "src/scraper.js", "src/markdown.js", "src/ui.js", "src/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

Note: `src/ui.js` and `src/content.js` are listed here but created in plan 002.
Until then the extension won't fully load — that's expected; this plan is
verified by Node tests, not by loading the extension. The **load order matters**:
selectors → scraper → markdown → ui → content (content.js runs last and uses the
others via `TTM`).

No `permissions` block is needed: `navigator.clipboard.writeText` works from a
content script on an https page under a user gesture, and file download uses an
anchor element — neither requires a manifest permission.

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"` → prints `ok`.

### Step 2: Create placeholder icons

Create `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`. A 1×1
transparent PNG is acceptable as a placeholder. Generate them with:

```
node -e "const fs=require('fs');const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');for(const s of [16,48,128])fs.writeFileSync('icons/icon'+s+'.png',b);console.log('icons written')"
```

**Verify**: `ls icons` → lists `icon16.png icon48.png icon128.png`.

### Step 3: Create `src/selectors.js` — the single brittle surface

This file centralizes every X-specific selector and the small DOM-reading
helpers that depend on X's markup. Use this exact content:

```js
(function (root) {
  'use strict';

  // ── The ONLY place X-specific selectors live. Fix breakage here. ──────────
  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]',
    tweetText: 'div[data-testid="tweetText"]',
    time: 'time',
    photo: 'div[data-testid="tweetPhoto"] img',
    videoPlayer: 'div[data-testid="videoPlayer"], div[data-testid="videoComponent"]'
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
```

**Verify**: `node -e "const s=require('./src/selectors.js'); console.log(s.parsePermalink('/AIVersePlay/status/123').handle)"` → prints `AIVersePlay`.

### Step 4: Create `src/scraper.js` — DOM → structured thread data

This file reads the DOM and returns plain data objects. It depends on
`TTM.SELECTORS`, `TTM.parsePermalink`, `TTM.pageAuthorHandle` (loaded earlier).
Key responsibilities:

1. `parseTweet(articleEl)` → `{ id, handle, text, images:[url], hasVideo:bool, permalink, timestamp }` or `null`.
2. `extractText(tweetTextEl)` → reconstruct text, replacing emoji `<img>` with its
   `alt`, `<br>` with `\n`, and using link anchors' visible text.
3. `toOriginalImage(url)` → upgrade `pbs.twimg.com` thumbnails to full size by
   setting `name=orig`.
4. `scrapeThread()` → **async**; scrolls to defeat virtualization, accumulates the
   author's contiguous self-reply chain, returns `{ author, sourceUrl, tweets:[...] }`.

Use this content (it intentionally inlines a near-complete reference
implementation — adapt only if a verification fails):

```js
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
```

**Verify**: `node -e "const s=require('./src/scraper.js'); console.log(s.toOriginalImage('https://pbs.twimg.com/media/Gabc?format=jpg&name=small'))"`
→ prints a URL containing `name=orig`.

### Step 5: Create `src/markdown.js` — thread data → Markdown string

Pure function, no DOM. This is the file with full unit-test coverage.

```js
(function (root) {
  'use strict';

  // thread = { author, sourceUrl, tweets: [{ text, images, hasVideo, permalink, timestamp }] }
  function buildMarkdown(thread) {
    if (!thread || !Array.isArray(thread.tweets) || thread.tweets.length === 0) {
      return '';
    }
    const author = thread.author || 'unknown';
    const first = thread.tweets[0];
    const date = first.timestamp ? first.timestamp.slice(0, 10) : '';

    const lines = [];
    lines.push('# Thread by [@' + author + '](https://x.com/' + author + ')');
    lines.push('');
    const meta = ['[source](' + (thread.sourceUrl || first.permalink) + ')'];
    if (date) meta.unshift(date);
    lines.push('> ' + meta.join(' · '));
    lines.push('');

    thread.tweets.forEach((t, i) => {
      lines.push('---');
      lines.push('');
      if (t.text) { lines.push(t.text); lines.push(''); }
      for (const img of (t.images || [])) {
        lines.push('![image](' + img + ')');
        lines.push('');
      }
      if (t.hasVideo) {
        lines.push('[video](' + t.permalink + ')');
        lines.push('');
      }
    });

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  const api = { buildMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Verify**: covered by Step 6's tests.

### Step 6: Create `test/markdown.test.js` — automated gate

Use Node's built-in test runner. Cover: empty thread, single tweet, multi-tweet
self-thread, image embedding, video link, and the no-triple-blank-line rule.

```js
const test = require('node:test');
const assert = require('node:assert');
const { buildMarkdown } = require('../src/markdown.js');

test('empty thread returns empty string', () => {
  assert.strictEqual(buildMarkdown({ author: 'a', tweets: [] }), '');
  assert.strictEqual(buildMarkdown(null), '');
});

test('single tweet renders header, source and text', () => {
  const md = buildMarkdown({
    author: 'AIVersePlay',
    sourceUrl: 'https://x.com/AIVersePlay/status/1',
    tweets: [{ text: 'Hello world', images: [], hasVideo: false,
               permalink: 'https://x.com/AIVersePlay/status/1', timestamp: '2026-06-22T10:00:00.000Z' }]
  });
  assert.match(md, /# Thread by \[@AIVersePlay\]/);
  assert.match(md, /2026-06-22/);
  assert.match(md, /\[source\]\(https:\/\/x\.com\/AIVersePlay\/status\/1\)/);
  assert.match(md, /Hello world/);
});

test('multi-tweet thread keeps order and separators', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [
      { text: 'first', images: [], hasVideo: false, permalink: 'p1', timestamp: null },
      { text: 'second', images: [], hasVideo: false, permalink: 'p2', timestamp: null }
    ]
  });
  assert.ok(md.indexOf('first') < md.indexOf('second'));
  assert.strictEqual((md.match(/^---$/gm) || []).length, 2);
});

test('images become markdown image links and video becomes a link', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 't', images: ['https://pbs.twimg.com/media/x?name=orig'],
               hasVideo: true, permalink: 'https://x.com/a/status/9', timestamp: null }]
  });
  assert.match(md, /!\[image\]\(https:\/\/pbs\.twimg\.com\/media\/x\?name=orig\)/);
  assert.match(md, /\[video\]\(https:\/\/x\.com\/a\/status\/9\)/);
});

test('no run of 3+ blank lines', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'x', images: [], hasVideo: false, permalink: 'p', timestamp: null }]
  });
  assert.doesNotMatch(md, /\n{3,}/);
});
```

**Verify**: `node --test` → all 5 tests pass, exit 0.

## Test plan

- New tests: `test/markdown.test.js` — 5 cases listed above (empty, single,
  multi-order, media, blank-line hygiene). This is the structural pattern for
  any future formatter tests.
- The scraper (`scraper.js`) reads live DOM and is **not** unit-tested here; it is
  validated manually in plan 002 against a real thread. Its pure helpers
  (`toOriginalImage`) are spot-checked via the Step 4 verify command.
- Verification gate: `node --test` passes with 5 tests.

## Done criteria

ALL must hold:

- [ ] `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"` prints `ok`
- [ ] `node --test` exits 0 with 5 passing tests
- [ ] `node -e "require('./src/scraper.js'); require('./src/selectors.js'); require('./src/markdown.js'); console.log('require ok')"` prints `require ok` (proves dual-env wrapper works in Node)
- [ ] `grep -rn "data-testid" src/ | grep -v selectors.js` returns **no matches** (selectors are centralized)
- [ ] `ls src` shows exactly: `markdown.js scraper.js selectors.js` (ui.js/content.js are plan 002)
- [ ] No `README.md` or `LICENSE` created (those are plan 002)
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `src/` already contains files at the start (possible concurrent run / drift).
- `node --version` reports below v18 (the built-in test runner / `node:test`
  behaves differently — report so the maintainer can adjust).
- A verify command fails twice after a reasonable fix attempt.
- You find yourself needing a `data-testid` string in any file other than
  `src/selectors.js` — the centralization design is being violated; report instead.

## Maintenance notes

- **The brittle surface is `src/selectors.js`.** When X changes its markup and
  scraping breaks, fixes go there first. A reviewer should scrutinize any PR that
  adds X-specific selectors outside that file.
- The thread-boundary heuristic in `scrapeThread` (stop at the first non-author
  tweet below the author run) is correct for the common case but has known
  limitations handled/noted in plan 002's manual testing: a promoted/ad tweet
  interleaved in the thread, or the focal tweet itself being a reply to someone
  else (ancestors shown above). These are acceptable MVP gaps — document them in
  the README (plan 002), don't silently expand scope here.
- If the project later adds a bundler/TypeScript, the dual-env IIFE wrapper can
  be replaced with real ES modules; until then, keep the wrapper exactly as-is so
  Node tests keep working.
