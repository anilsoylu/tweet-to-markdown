# Plan 006: Fix the 6 code-review findings (focal tweet, thread boundary, slow-load, casing, theme, quoted media)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a "STOP condition"
> occurs, stop and report. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `node --test` must pass (7). `grep '"version"'
> manifest.json` must show `0.3.1`. Open `src/selectors.js`, `src/scraper.js`,
> `src/content.js`, `src/ui.js` and confirm the "Current state" excerpts below
> match. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (DOM-dependent logic; main behavior must not regress)
- **Depends on**: plans 001–005 (all DONE)
- **Category**: bug
- **Planned at**: commit `c9186ca`, 2026-06-22

## Why this matters

A recall-biased review surfaced 6 real defects. The two most impactful: the button
is injected into the wrong tweet when the focal tweet is a reply (X renders ancestor
tweets above it), and the thread scraper pulls in author replies that live *below*
another user's comment. The rest fix incomplete long-thread capture on slow loads,
an empty result on handle-casing mismatch, a theme misdetection on transparent
backgrounds, and quoted-tweet images leaking into the main tweet.

## Current state (exact excerpts)

- `manifest.json` — `"version": "0.3.1"`.
- `src/selectors.js` — `SELECTORS` has no `quotedTweet`; exports `SELECTORS,
  parsePermalink, pageAuthorHandle, isExternalLink` (no `pageStatusId`).
- `src/scraper.js`:
  - images (around line 35):
    ```js
    const images = Array.from(article.querySelectorAll(SELECTORS.photo))
      .map((img) => toOriginalImage(img.src));
    ```
  - `scrapeThread` (around lines 53–88): `const author = pageAuthorHandle();`, then
    the scan loop with `if (t.handle === author)` and
    `} else if (byId.size > 0) { foreignAfterAuthor = true; }` (no `break`), and
    `stable = byId.size === before ? stable + 1 : 0;`, returning
    `{ author, sourceUrl, tweets }`.
- `src/content.js` — `injectIntoFirstTweet` starts with
  `const article = document.querySelector(TTM.SELECTORS.tweet);`.
- `src/ui.js` — `pageIsDark()` (lines ~119–126) matches `/\d+/g` on
  `getComputedStyle(document.body).backgroundColor` and ignores alpha.

### Conventions (unchanged — match them)

- Classic content scripts via `globalThis.TTM`, dual-env IIFE wrapper, no build, no deps.
- **All X selectors only in `src/selectors.js`.** No `innerHTML`/`insertAdjacentHTML`.
- 2-space indent, single quotes, semicolons.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `node --test` | 7 pass, exit 0 |
| Syntax check | `node --check src/selectors.js && node --check src/scraper.js && node --check src/content.js && node --check src/ui.js && echo ok` | `ok` |
| Manifest valid | `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'));console.log('ok')"` | `ok` |
| Selectors centralized | `grep -rn "data-testid\|role=\\\"link\\\"" src/ \| grep -v selectors.js` | no matches |
| No innerHTML | `grep -rn "innerHTML\|insertAdjacentHTML" src/` | no matches |

## Scope

**In scope**: `manifest.json`, `src/selectors.js`, `src/scraper.js`,
`src/content.js`, `src/ui.js`.
**Out of scope**: `src/markdown.js`, `test/**`, `SOCIAL.md` (do NOT touch or stage),
the README.

## Steps

### Step 1: Bump version

`manifest.json`: `"version": "0.3.1"` → `"version": "0.4.0"`.

**Verify**: `grep '"version"' manifest.json` → `0.4.0`.

### Step 2: `src/selectors.js` — add `quotedTweet` selector + `pageStatusId`, export it

Add `quotedTweet` to `SELECTORS` (keep the rest):

```js
    cardLink: '[data-testid="card.wrapper"] a[href], a[data-testid="card.wrapper"][href]',
    quotedTweet: 'div[role="link"][tabindex]'
```

Add this helper (next to `pageAuthorHandle`) and export it:

```js
  // The focal tweet's numeric id from the page URL (/<handle>/status/<id>).
  function pageStatusId() {
    const m = location.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return m ? m[1] : null;
  }

  const api = { SELECTORS, parsePermalink, pageAuthorHandle, isExternalLink, pageStatusId };
```

**Verify**: `node -e "console.log(require('./src/selectors.js').SELECTORS.quotedTweet, typeof require('./src/selectors.js').pageStatusId)"` → prints `div[role="link"][tabindex] function`.

### Step 3: `src/scraper.js` — fixes for findings #2, #3, #4, #6

(a) **Finding #6 — exclude quoted-tweet images.** Change the `images` assignment:

```js
    const images = Array.from(article.querySelectorAll(SELECTORS.photo))
      .filter((img) => !img.closest(SELECTORS.quotedTweet))
      .map((img) => toOriginalImage(img.src));
```

(b) **Findings #2/#3/#4 — in `scrapeThread`.** Replace the author setup, the scan
loop body, and the stop heuristic. The function's loop becomes:

```js
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

    const tweets = [...byId.values()].sort((a, b) => a.order - b.order)
      .map(({ order, ...rest }) => rest);
    return {
      author: tweets.length ? tweets[0].handle : author,    // canonical casing from the tweet
      sourceUrl: location.href.split('?')[0],
      tweets
    };
```

**Verify**: `node --check src/scraper.js && echo ok` → `ok`. (DOM behavior verified manually in Step 6.)

### Step 4: `src/content.js` — fix finding #1 (inject into the focal tweet)

Add a `focalArticle()` helper above `injectIntoFirstTweet` and use it instead of
`document.querySelector(TTM.SELECTORS.tweet)`:

```js
  function focalArticle() {
    const id = TTM.pageStatusId();
    const arts = document.querySelectorAll(TTM.SELECTORS.tweet);
    if (id) {
      for (const art of arts) {
        const time = art.querySelector(TTM.SELECTORS.time);
        const anchor = time && time.closest('a');
        const link = TTM.parsePermalink(anchor && anchor.getAttribute('href'));
        if (link && link.id === id) return art;
      }
    }
    return arts[0] || null; // fallback: first tweet
  }

  function injectIntoFirstTweet() {
    if (!/^\/[^/]+\/status\/\d+/.test(location.pathname)) return; // tweet pages only
    const article = focalArticle();
    if (!article) return;
    const bar = article.querySelector(TTM.SELECTORS.actionBar);
    if (!bar || bar.querySelector('.ttm-convert-btn')) return; // already injected
    const sample = bar.firstElementChild;
    const cell = document.createElement('div');
    if (sample) cell.className = sample.className;
    cell.style.display = 'flex';
    cell.style.alignItems = 'center';
    cell.appendChild(TTM.createButton(onConvertClick));
    const share = bar.lastElementChild;
    if (share && share !== sample) bar.insertBefore(cell, share);
    else bar.appendChild(cell);
  }
```

Leave `onConvertClick` and the observer unchanged.

**Verify**: `node --check src/content.js && echo ok` → `ok`.

### Step 5: `src/ui.js` — fix finding #5 (transparent background → wrong theme)

Replace `pageIsDark()` with a version that skips fully-transparent backgrounds and
falls back to `document.documentElement`:

```js
  // Detect X's active theme (Default/Dim/Lights-out are set in-app, independent of
  // the OS color scheme) from the page background luminance. Skips transparent
  // backgrounds and falls back from <body> to <html>.
  function pageIsDark() {
    try {
      for (const node of [document.body, document.documentElement]) {
        if (!node) continue;
        const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
        if (!m) continue;
        const alpha = m.length >= 4 ? parseFloat(m[3]) : 1;
        if (alpha === 0) continue; // transparent → try the next element
        const r = +m[0], g = +m[1], b = +m[2];
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
      }
      return false;
    } catch (e) { return false; }
  }
```

**Verify**: `node --check src/ui.js && echo ok` → `ok`; `grep -c "pageIsDark" src/ui.js` → `2`.

### Step 6: MANDATORY manual re-verification in Chrome

1. Reload the unpacked extension.
2. **#1**: open a tweet that is itself a **reply** to someone (ancestors shown
   above). Confirm the convert button now lands on the **focal** tweet (the one in
   the URL), not the top ancestor.
3. **#2**: open a self-thread where the author also replied under a commenter.
   Convert; confirm those nested author replies are **not** included; only the
   top contiguous self-thread is captured.
4. **#4**: open the same thread via a URL with different handle casing
   (e.g. lowercase). Confirm it still captures the thread (not "Tweet bulunamadı").
5. **#6**: open a tweet that **quotes** another tweet with an image. Confirm the
   quoted tweet's image is **not** added to the main tweet's Markdown.
6. **#5**: confirm the dialog still themes correctly in X light/dim/lights-out.
7. Record which points passed.

## Test plan

- No automated tests change (these are DOM/timing paths; markdown.js untouched).
  Gate: `node --test` still 7 pass. Acceptance = Step 6 manual checklist.

## Done criteria

- [ ] `grep '"version"' manifest.json` → `0.4.0`
- [ ] `node --test` exits 0 with 7 tests
- [ ] `node --check` on selectors/scraper/content/ui → `ok`
- [ ] `node -e "const s=require('./src/scraper.js'); require('./src/selectors.js'); require('./src/markdown.js'); console.log('require ok')"` → `require ok`
- [ ] `grep -rn "innerHTML\|insertAdjacentHTML" src/` → no matches
- [ ] `grep -rn "data-testid" src/ | grep -v selectors.js` → no matches
- [ ] `git diff --name-only` shows only: manifest.json, src/selectors.js, src/scraper.js, src/content.js, src/ui.js, plans/README.md (+ new plan file). **SOCIAL.md must NOT appear.**
- [ ] Step 6 manual checklist completed
- [ ] `plans/README.md` status row for 006 updated to DONE

## STOP conditions

Stop and report if:

- After Step 6, the button still lands on the ancestor tweet — `TTM.pageStatusId()`
  or the per-article permalink match may be wrong; report the URL and the article's
  time-anchor href.
- The quoted-image filter removes a **main** tweet's image (over-filtering) — report
  so `quotedTweet` can be narrowed.
- `node --test` fails (means markdown.js/test was touched) — revert and report.

## Maintenance notes

- `quotedTweet` (`div[role="link"][tabindex]`) is a new brittle selector for X's
  quoted-tweet card; fixes go in `src/selectors.js`.
- The thread stop heuristic now waits until the page bottom before giving up on
  no-growth; if X adds an infinite "Discover more" section below threads, revisit
  the `atBottom` check so it doesn't scroll forever (the `maxScrolls` cap bounds it).
- Project rule: bump `manifest.json` version each change (this plan did 0.3.1 → 0.4.0).
