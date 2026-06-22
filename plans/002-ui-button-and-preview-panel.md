# Plan 002: UI — injected button, preview panel, copy/download, and README

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: Confirm plan 001 is DONE. Run `ls src` — it must
> show `markdown.js scraper.js selectors.js`. Run `node --test` — it must pass.
> If either fails, STOP: plan 001 must land first (this plan calls
> `TTM.scrapeThread()` and `TTM.buildMarkdown()` which 001 creates).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (button placement depends on X DOM; isolated via Shadow DOM and a single selector)
- **Depends on**: plans/001-core-scraper-and-markdown.md
- **Category**: direction (new feature build)
- **Planned at**: greenfield — built directly on plan 001's output

## Why this matters

Plan 001 produced tested logic with no user-facing surface; loading the
extension currently does nothing because `src/ui.js` and `src/content.js` are
referenced by the manifest but don't exist. This plan adds the only parts the
user sees: a **"📋 Markdown" button** injected near the tweet's action bar, and
an **in-page preview panel** (Shadow DOM, so X's CSS can't disturb it) showing
the generated Markdown with **Copy** and **Download .md** buttons. After this
plan, the extension is a usable MVP that a user can load unpacked and run on any
tweet page.

## Current state

After plan 001 the repo contains:

- `manifest.json` — already lists `src/ui.js` and `src/content.js` in
  `content_scripts.js` in load order: `selectors → scraper → markdown → ui → content`.
- `src/selectors.js` — exposes `TTM.SELECTORS`, `TTM.parsePermalink`, `TTM.pageAuthorHandle`.
- `src/scraper.js` — exposes `TTM.scrapeThread()` (async) returning
  `{ author, sourceUrl, tweets: [{ text, images, hasVideo, permalink, timestamp }] }`.
- `src/markdown.js` — exposes `TTM.buildMarkdown(thread)` → Markdown string.

### Conventions to follow (established in plan 001 — match them exactly)

- Plain classic content scripts, NO ES modules, NO npm dependencies.
- Files use the dual-env IIFE wrapper and attach to `globalThis.TTM`. `ui.js`
  uses the same wrapper. `content.js` is the entry point and runs last; it does
  **not** export anything but must be wrapped in an IIFE to avoid leaking globals.
- **All X DOM selectors live ONLY in `src/selectors.js`.** The action-bar
  selector this plan needs is added there, not in `ui.js`.
- 2-space indentation, single quotes, semicolons.
- The preview panel is rendered inside a **Shadow DOM** root so X page styles
  cannot affect it and our styles cannot leak into X.
- **Do NOT use `innerHTML` / `insertAdjacentHTML` anywhere.** Build DOM with
  `document.createElement` and set text with `textContent`. (This keeps the
  extension XSS-safe and passes Chrome Web Store review. The only place raw text
  is injected is `textarea.value`, which never parses HTML.)

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Validate manifest JSON | `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"` | prints `ok` |
| Re-run core tests | `node --test` | still passes (you must not break 001) |
| Lint UI syntax (no run) | `node --check src/ui.js && node --check src/content.js && echo ok` | prints `ok` |
| Assert no innerHTML | `! grep -rn "innerHTML\|insertAdjacentHTML" src/ && echo clean` | prints `clean` |

There is no automated test for DOM injection; this plan has a **mandatory manual
verification** section (load unpacked in Chrome). Do it and record the result.

## Scope

**In scope**:
- `src/ui.js` (create) — Shadow-DOM panel + button factory.
- `src/content.js` (create) — entry point: observe the page, inject the button, wire the click.
- `src/selectors.js` (edit) — add ONE selector for the tweet action bar (see Step 1).
- `README.md` (create)
- `LICENSE` (create — MIT)

**Out of scope** (do NOT touch):
- `src/scraper.js`, `src/markdown.js`, `test/` — plan 001's tested core. If you
  think you need to change them, that's a STOP condition.
- `manifest.json` — already correct from plan 001; do not edit it.

## Git workflow

- Commit per logical step. Message style: short imperative, e.g.
  `add shadow-dom preview panel`, `inject convert button`, `add README and LICENSE`.
  Do NOT push.

## Steps

### Step 1: Add the action-bar selector to `src/selectors.js`

X renders each tweet's reply/retweet/like row inside a `[role="group"]` element
within the `article`. Add `actionBar` to the `SELECTORS` object **without
changing anything else** in the file:

```js
  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]',
    tweetText: 'div[data-testid="tweetText"]',
    time: 'time',
    photo: 'div[data-testid="tweetPhoto"] img',
    videoPlayer: 'div[data-testid="videoPlayer"], div[data-testid="videoComponent"]',
    actionBar: 'div[role="group"]'
  };
```

**Verify**: `node -e "console.log(require('./src/selectors.js').SELECTORS.actionBar)"` → prints `div[role="group"]`.

### Step 2: Create `src/ui.js` — button factory and Shadow-DOM panel

This file builds DOM but performs no scraping. It exposes
`TTM.createButton(onClick)` and `TTM.showPanel(markdownString)`. Panel DOM is
built with `createElement` (no `innerHTML`). Use this content:

```js
(function (root) {
  'use strict';

  function createButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'ttm-convert-btn';
    btn.type = 'button';
    btn.textContent = '📋 Markdown';
    btn.title = "Bu thread'i Markdown'a çevir";
    Object.assign(btn.style, {
      marginLeft: '8px', padding: '2px 10px', borderRadius: '9999px',
      border: '1px solid currentColor', background: 'transparent',
      color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: '13px'
    });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }

  const PANEL_CSS = `
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;
        display:flex;align-items:center;justify-content:center;}
    .card{background:#fff;color:#0f1419;width:min(680px,92vw);max-height:86vh;
           display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
           font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;}
    @media (prefers-color-scheme: dark){.card{background:#15202b;color:#e7e9ea;}}
    header{display:flex;gap:8px;align-items:center;justify-content:space-between;
           padding:12px 16px;border-bottom:1px solid rgba(127,127,127,.25);}
    header strong{font-size:15px;}
    textarea{flex:1;min-height:320px;border:0;outline:0;resize:none;padding:16px;
             background:transparent;color:inherit;font:13px/1.5 ui-monospace,Menlo,monospace;}
    .row{display:flex;gap:8px;align-items:center;}
    button{padding:7px 14px;border-radius:9999px;border:1px solid rgba(127,127,127,.4);
           background:transparent;color:inherit;cursor:pointer;font:inherit;}
    button.primary{background:#1d9bf0;color:#fff;border-color:#1d9bf0;}
    .ok{color:#00ba7c;font-size:13px;min-width:70px;}`;

  let host; // single reused Shadow host

  // Helper: make an element with props and children — avoids innerHTML.
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) Object.assign(node, props);
    for (const c of (children || [])) node.appendChild(c);
    return node;
  }

  function showPanel(markdown) {
    if (!host) {
      host = document.createElement('div');
      host.id = 'ttm-panel-host';
      document.documentElement.appendChild(host);
      host.attachShadow({ mode: 'open' });
    }
    const sh = host.shadowRoot;
    sh.replaceChildren(); // clear previous panel

    const style = el('style'); style.textContent = PANEL_CSS;

    const ok = el('span', { className: 'ok' });
    const copyBtn = el('button', { className: 'primary', textContent: 'Kopyala' });
    const dlBtn = el('button', { textContent: 'İndir .md' });
    const closeBtn = el('button', { textContent: 'Kapat' });
    const ta = el('textarea', { spellcheck: false, value: markdown });

    const header = el('header', null, [
      el('strong', { textContent: 'Tweet → Markdown' }),
      el('div', { className: 'row' }, [ok, copyBtn, dlBtn, closeBtn])
    ]);
    const card = el('div', { className: 'card' }, [header, ta]);
    const ov = el('div', { className: 'ov' }, [card]);

    const close = () => sh.replaceChildren();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    closeBtn.addEventListener('click', close);
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(markdown); }
      catch { ta.select(); document.execCommand('copy'); }
      ok.textContent = 'Kopyalandı';
      setTimeout(() => { ok.textContent = ''; }, 1500);
    });
    dlBtn.addEventListener('click', () => {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'thread.md';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    sh.append(style, ov);
  }

  const api = { createButton, showPanel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Verify**: `node --check src/ui.js && echo ok` → prints `ok`.

### Step 3: Create `src/content.js` — entry point that injects the button

Responsibilities:
1. On tweet pages only, find the **focal** tweet (the first `article` on the
   page) and inject the convert button into its action bar once.
2. Re-inject after X's SPA navigation / re-renders (use a `MutationObserver`,
   debounced, guarded against duplicate buttons).
3. On click: show a "loading" panel, run `TTM.scrapeThread()`, build Markdown via
   `TTM.buildMarkdown()`, show the result. Handle errors gracefully.

```js
(function () {
  'use strict';

  function injectIntoFirstTweet() {
    if (!/^\/[^/]+\/status\/\d+/.test(location.pathname)) return; // tweet pages only
    const article = document.querySelector(TTM.SELECTORS.tweet);
    if (!article) return;
    const bar = article.querySelector(TTM.SELECTORS.actionBar);
    if (!bar || bar.querySelector('.ttm-convert-btn')) return; // already injected
    bar.appendChild(TTM.createButton(onConvertClick));
  }

  async function onConvertClick() {
    TTM.showPanel('Thread toplanıyor… (sayfa otomatik kayacak, lütfen bekleyin)');
    try {
      const thread = await TTM.scrapeThread();
      if (!thread.tweets.length) {
        TTM.showPanel('Tweet bulunamadı. Bir tweet sayfasında olduğundan emin ol.');
        return;
      }
      TTM.showPanel(TTM.buildMarkdown(thread));
    } catch (err) {
      TTM.showPanel('Hata: ' + (err && err.message ? err.message : String(err)) +
        '\n\nBir tweet sayfasında (x.com/<kullanıcı>/status/<id>) olduğundan emin ol.');
    }
  }

  // Debounced observer: X is a SPA, the tweet re-renders on navigation.
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(injectIntoFirstTweet, 400); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
```

**Verify**: `node --check src/content.js && echo ok` → prints `ok`.

### Step 4: MANDATORY manual verification in Chrome

This is the real acceptance test — do it and record the outcome in your report.

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   select this project root. The extension loads with no manifest errors.
2. Open any real X thread where the author replied to themselves (a multi-tweet
   thread): `https://x.com/<someone>/status/<id>`.
3. Confirm a **"📋 Markdown"** button appears in the focal tweet's action row.
4. Click it. The page scrolls automatically, then a panel opens with Markdown:
   - starts with `# Thread by [@<author>]`,
   - contains the original tweet and the author's self-replies **in order**,
   - excludes other users' replies,
   - images appear as `![image](https://pbs.twimg.com/...)`.
5. Click **Kopyala** → "Kopyalandı" appears; paste elsewhere to confirm clipboard.
6. Click **İndir .md** → a `thread.md` file downloads with the same content.
7. Navigate to a different tweet (SPA nav) and confirm the button re-appears.

**Expected**: all 7 hold. If the button doesn't appear, the `actionBar` selector
likely drifted — see STOP conditions. Record exactly which steps passed.

### Step 5: Create `README.md` and `LICENSE`

`README.md` must include: what it does; the **client-side / no-backend / no-API /
no-tracking** guarantee; load-unpacked install instructions; usage; the **known
limitations** (very long virtualized threads may need a higher `maxScrolls`;
interleaved promoted tweets or ancestor tweets can confuse the author-thread
boundary; videos are linked, not downloaded; selectors break when X changes its
UI — fixes go in `src/selectors.js`); and an **X ToS note** (DOM scraping is a
gray area; this is a personal/OSS tool, use responsibly). State the project is
MIT-licensed.

`LICENSE`: standard MIT license text, copyright holder `Tweet to Markdown
contributors`, year `2026` (do not invent a personal name).

**Verify**: `test -f README.md && test -f LICENSE && echo ok` → prints `ok`.

## Test plan

- No new automated tests (DOM injection isn't unit-testable without a browser
  harness, out of scope for the MVP). The automated gate is that plan 001's
  `node --test` **still passes** — proof you didn't break the core.
- The acceptance test is Step 4's 7-point manual checklist in Chrome.

## Done criteria

ALL must hold:

- [ ] `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"` prints `ok`
- [ ] `node --test` still exits 0 (plan 001 core unbroken)
- [ ] `node --check src/ui.js && node --check src/content.js && echo ok` prints `ok`
- [ ] `grep -rn "data-testid" src/ | grep -v selectors.js` returns **no matches**
- [ ] `grep -rn "innerHTML\|insertAdjacentHTML" src/` returns **no matches**
- [ ] `ls src` shows: `content.js markdown.js scraper.js selectors.js ui.js`
- [ ] `test -f README.md && test -f LICENSE && echo ok` prints `ok`
- [ ] Step 4 manual checklist completed; record which of the 7 points passed
- [ ] `plans/README.md` status row for 002 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- Plan 001 is not DONE / `node --test` fails at the start.
- The convert button never appears in Step 4 even though the extension loaded
  without errors — the `div[role="group"]` action-bar selector has likely drifted.
  Report this; the fix is a `src/selectors.js` change, but confirm the new
  selector against the live DOM before changing it (do not guess repeatedly).
- Scraping returns other users' replies mixed in, or stops after one tweet on a
  genuine multi-tweet self-thread — report the thread URL and observed output so
  the boundary heuristic in `scraper.js` can be revisited (that file is plan
  001's; do not edit it here).
- You find you need to edit `src/scraper.js`, `src/markdown.js`, or
  `manifest.json` — outside this plan's scope; report instead.

## Maintenance notes

- The two brittle X-dependent points are the `actionBar` selector (button
  placement) and the `tweet`/`tweetText` selectors (scraping) — all in
  `src/selectors.js`. A reviewer should check that no PR scatters selectors
  elsewhere.
- The panel uses Shadow DOM so X's stylesheet can't break it and ours can't leak;
  keep new panel styles inside `PANEL_CSS`, and keep building DOM with
  `createElement` (no `innerHTML`).
- `document.execCommand('copy')` is a deprecated clipboard fallback kept only for
  environments where `navigator.clipboard` is unavailable; the primary path is
  `navigator.clipboard.writeText`.
- Deferred out of this MVP (note in README, don't build now): quoted-tweet
  inclusion, ancestor-tweet handling when the focal tweet is itself a reply, and
  a configurable `maxScrolls` for extremely long threads.
