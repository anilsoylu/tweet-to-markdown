# Plan 003: Capture links, Twitter-native button, polished dialog, version bump

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP condition" occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: Run `node --test` — plans 001/002 must currently
> pass (5 tests). Run `grep -n '"version"' manifest.json` — it must show
> `0.1.0`. If either differs, read the current files before editing and treat
> mismatches against the "Current state" excerpts below as a STOP condition.

## Status

- **Priority**: P1 (the missing-links issue is a real correctness bug users hit)
- **Effort**: M
- **Risk**: MED (link extraction depends on X DOM; button/dialog are CSS-only)
- **Depends on**: plans 001 and 002 (both DONE)
- **Category**: bug + dx/polish
- **Planned at**: commit `a45546a` (initial), 2026-06-22

## Why this matters

A real thread converted fine **except every in-tweet link (e.g. the GitHub repo
URLs) was dropped** — the scraper never collects link/card anchors, so the most
valuable payload of a "here are 10 repos" thread is lost. This plan fixes link
capture, then polishes two rough edges the user flagged: the convert button
should look native to X's action row (not a bordered pill), and the preview
dialog should look more finished. Finally, bump the extension version (project
rule: **every update bumps `manifest.json` version**).

## Current state

The repo is a working MV3 extension (plans 001/002 DONE). Relevant files and the
exact code being changed:

- `manifest.json` — currently `"version": "0.1.0"`.
- `src/selectors.js` — `SELECTORS` object (lines 5–12). No selector for link cards.
- `src/scraper.js` — `extractText` (lines 16–27) and `parseTweet` (lines 29–46).
  `parseTweet` returns `{ id, handle, text, images, hasVideo, permalink, timestamp }`
  with **no `links` field**. `extractText` currently does
  `else if (node.nodeName === 'A') out += node.textContent;` — it keeps the
  visible display URL as plain text but never as a clickable link, and tweets
  whose link is a **card below the text** (the common case) contribute nothing.
- `src/markdown.js` — `buildMarkdown` (lines 5–36) renders text, images, video.
  It does **not** render links.
- `test/markdown.test.js` — 5 tests; none cover links.
- `src/ui.js` — `createButton` (lines 4–17) renders a bordered pill; `PANEL_CSS`
  (lines 19–35) and `showPanel` (lines 47–91) render a basic dialog.

### Conventions (unchanged — match them)

- No build step, no npm deps. Classic content scripts via `globalThis.TTM`, dual-env
  IIFE wrapper, Node-`require`able. 2-space indent, single quotes, semicolons.
- **All X selectors ONLY in `src/selectors.js`.** No `data-testid` elsewhere.
- **No `innerHTML` / `insertAdjacentHTML`.** Build DOM with `createElement`,
  set text with `textContent`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Run tests | `node --test` | all pass, exit 0 |
| Manifest valid | `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"` | `ok` |
| Syntax check | `node --check src/ui.js && node --check src/scraper.js && node --check src/markdown.js && echo ok` | `ok` |
| No innerHTML | `grep -rn "innerHTML\|insertAdjacentHTML" src/` | no matches |
| Selectors centralized | `grep -rn "data-testid" src/ \| grep -v selectors.js` | no matches |

## Scope

**In scope** (edit only these):
- `manifest.json` — version bump only.
- `src/selectors.js` — add `cardLink` selector + an `EXTERNAL_LINK` helper.
- `src/scraper.js` — collect links in `parseTweet`; make in-text links clickable.
- `src/markdown.js` — render a tweet's `links`.
- `test/markdown.test.js` — add link-rendering tests.
- `src/ui.js` — restyle button + dialog.

**Out of scope** (do NOT touch):
- `src/content.js` — button is created via `TTM.createButton`; placement stays the same.
- `plans/**` except the status row update.
- The thread-boundary/scroll logic in `scrapeThread`.

## Steps

### Step 1: Bump the version in `manifest.json`

Change `"version": "0.1.0"` to `"version": "0.2.0"`. Nothing else.

**Verify**: `grep '"version"' manifest.json` → shows `0.2.0`; manifest still parses (`node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'));console.log('ok')"` → `ok`).

### Step 2: Add the card-link selector and an external-link helper to `src/selectors.js`

In the `SELECTORS` object add one entry (keep the rest unchanged):

```js
    actionBar: 'div[role="group"]',
    cardLink: '[data-testid="card.wrapper"] a[href], a[data-testid="card.wrapper"][href]'
```

Then add this helper function and export it (alongside `parsePermalink`):

```js
  // True for off-platform links (the ones worth capturing: github.com, t.co, …).
  // Excludes x.com / twitter.com internal links (mentions, hashtags, permalinks).
  function isExternalLink(href) {
    return /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?(x|twitter|mobile\.twitter)\.com\//i.test(href);
  }

  const api = { SELECTORS, parsePermalink, pageAuthorHandle, isExternalLink };
```

**Verify**: `node -e "const s=require('./src/selectors.js'); console.log(s.isExternalLink('https://t.co/x'), s.isExternalLink('https://x.com/a'))"` → prints `true false`.

### Step 3: Collect links in `src/scraper.js`

Two changes. (a) Make in-text external links clickable in `extractText`; (b) add a
`links` array to `parseTweet` that merges in-text external links and card links,
deduped by URL.

Replace the `extractText` `<a>` branch (currently `out += node.textContent;`) so the
function reads:

```js
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
```

Add `isExternalLink` to the destructured deps at the top of the file:

```js
  const { SELECTORS, parsePermalink, pageAuthorHandle, isExternalLink } = dep;
```

In `parseTweet`, after computing `images`, add link collection and include `links`
in the returned object:

```js
    const links = [];
    const seenHref = new Set();
    for (const a of article.querySelectorAll(SELECTORS.cardLink)) {
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
      hasVideo: !!article.querySelector(SELECTORS.videoPlayer),
      permalink: 'https://x.com/' + link.handle + '/status/' + link.id,
      timestamp: (timeEl && timeEl.getAttribute('datetime')) || null
    };
```

Note: in-text links are already inlined into `text` by `extractText`; `links`
holds **card** links (the unfurled previews below the text), which is exactly the
case that was being lost. Duplication is avoided because card links live outside
`tweetText` and are deduped by href among themselves.

**Verify**: `node --check src/scraper.js && echo ok` → `ok`. (DOM behavior is verified manually in Step 7.)

### Step 4: Render links in `src/markdown.js`

Update the data-shape comment and render `links` after images/video, before the
next separator:

```js
  // thread = { author, sourceUrl, tweets: [{ text, images, links, hasVideo, permalink, timestamp }] }
```

Inside the `forEach`, after the `hasVideo` block, add:

```js
      for (const l of (t.links || [])) {
        lines.push('🔗 [' + (l.text || l.href) + '](' + l.href + ')');
      }
      if (t.links && t.links.length) lines.push('');
```

**Verify**: covered by Step 5 tests.

### Step 5: Add link tests to `test/markdown.test.js`

Append:

```js
test('renders card links under a tweet', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'Firecrawl', images: [], hasVideo: false,
               links: [{ text: 'github.com/mendableai/firecrawl', href: 'https://t.co/x' }],
               permalink: 'p', timestamp: null }]
  });
  assert.match(md, /🔗 \[github\.com\/mendableai\/firecrawl\]\(https:\/\/t\.co\/x\)/);
});

test('tweets without links still render and add no link line', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'no links here', images: [], hasVideo: false, permalink: 'p', timestamp: null }]
  });
  assert.match(md, /no links here/);
  assert.doesNotMatch(md, /🔗/);
});
```

**Verify**: `node --test` → all 7 tests pass (5 existing + 2 new), exit 0.

### Step 6: Restyle the button and dialog in `src/ui.js`

**Button** — replace `createButton` so it looks native to X's action row (icon +
hover circle, no permanent border). Keep the class `ttm-convert-btn` (content.js
depends on it) and keep returning a `<button>`:

```js
  function createButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'ttm-convert-btn';
    btn.type = 'button';
    btn.textContent = '📋';
    btn.setAttribute('aria-label', "Markdown'a çevir");
    btn.title = "Bu thread'i Markdown'a çevir";
    Object.assign(btn.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '34px', height: '34px', marginLeft: '4px', padding: '0',
      borderRadius: '9999px', border: '0', background: 'transparent',
      color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: '16px',
      lineHeight: '1', transition: 'background-color .15s'
    });
    btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = 'rgba(29,155,240,.12)'; });
    btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = 'transparent'; });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }
```

**Dialog** — replace `PANEL_CSS` with a more finished look and update `showPanel`
to accept an optional subtitle (tweet count). Replace `PANEL_CSS`:

```js
  const PANEL_CSS = `
    *{box-sizing:border-box;}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;
        display:flex;align-items:center;justify-content:center;padding:24px;}
    .card{background:#fff;color:#0f1419;width:min(720px,94vw);max-height:88vh;
           display:flex;flex-direction:column;border-radius:16px;overflow:hidden;
           box-shadow:0 24px 64px rgba(0,0,0,.4);
           font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;}
    @media (prefers-color-scheme: dark){
      .card{background:#15202b;color:#e7e9ea;}
      .ttm-x:hover{background:rgba(239,243,244,.1);}}
    header{display:flex;gap:12px;align-items:center;justify-content:space-between;
           padding:14px 16px;border-bottom:1px solid rgba(127,127,127,.2);}
    .titles{display:flex;flex-direction:column;gap:2px;min-width:0;}
    .titles strong{font-size:16px;}
    .titles span{font-size:13px;opacity:.6;}
    .row{display:flex;gap:8px;align-items:center;}
    textarea{flex:1;min-height:340px;border:0;outline:0;resize:none;padding:18px;
             background:transparent;color:inherit;
             font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;}
    button{padding:8px 16px;border-radius:9999px;border:1px solid rgba(127,127,127,.4);
           background:transparent;color:inherit;cursor:pointer;font:600 14px/1 inherit;
           transition:opacity .15s,background-color .15s;}
    button:hover{opacity:.85;}
    button.primary{background:#1d9bf0;color:#fff;border-color:#1d9bf0;}
    .ttm-x{width:34px;height:34px;padding:0;border:0;border-radius:9999px;font-size:18px;
           display:inline-flex;align-items:center;justify-content:center;}
    .ttm-x:hover{background:rgba(15,20,25,.1);}
    .ok{color:#00ba7c;font-size:13px;min-width:64px;text-align:right;}`;
```

Replace the body of `showPanel` (keep its signature `showPanel(markdown, subtitle)`):

```js
  function showPanel(markdown, subtitle) {
    if (!host) {
      host = document.createElement('div');
      host.id = 'ttm-panel-host';
      document.documentElement.appendChild(host);
      host.attachShadow({ mode: 'open' });
    }
    const sh = host.shadowRoot;
    sh.replaceChildren();

    const style = el('style'); style.textContent = PANEL_CSS;

    const ok = el('span', { className: 'ok' });
    const copyBtn = el('button', { className: 'primary', textContent: 'Kopyala' });
    const dlBtn = el('button', { textContent: 'İndir .md' });
    const closeBtn = el('button', { className: 'ttm-x', textContent: '✕' });
    closeBtn.setAttribute('aria-label', 'Kapat');
    const ta = el('textarea', { spellcheck: false, value: markdown });

    const titles = el('div', { className: 'titles' }, [
      el('strong', { textContent: 'Tweet → Markdown' }),
      el('span', { textContent: subtitle || '' })
    ]);
    const header = el('header', null, [
      titles,
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
      ok.textContent = 'Kopyalandı'; setTimeout(() => { ok.textContent = ''; }, 1500);
    });
    dlBtn.addEventListener('click', () => {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'thread.md'; a.click();
      URL.revokeObjectURL(a.href);
    });

    sh.append(style, ov);
  }
```

Then update `src/content.js`'s success call to pass a subtitle **only if you must** —
NO: `content.js` is out of scope. `showPanel`'s second arg is optional, so the
existing single-arg calls keep working. Leave `content.js` untouched.

**Verify**: `node --check src/ui.js && echo ok` → `ok`; `grep -rn "innerHTML\|insertAdjacentHTML" src/` → no matches.

### Step 7: MANDATORY manual re-verification in Chrome

1. `chrome://extensions` → reload the unpacked extension (or remove + load again).
2. Open the same kind of thread that has repo links per tweet.
3. Confirm the button is now an **icon button** with a circular hover highlight,
   sitting in the action row.
4. Click it. In the output, confirm **each tweet's GitHub/repo link now appears**
   as a `🔗 [..](..)` line (for card links) and/or inline `[text](url)` (for
   in-text links). This is the core fix — if links are still missing, see STOP.
5. Confirm the dialog looks polished: rounded card, shadow, header with title,
   working **Kopyala / İndir .md / ✕** controls.
6. Record which points passed.

## Test plan

- 2 new tests in `test/markdown.test.js` (card link rendered; no-link tweet adds
  no `🔗` line). Total 7 tests.
- DOM link collection (`parseTweet` card links, `extractText` inline links) is
  validated by the Step 7 manual test against a real link-bearing thread.
- Gate: `node --test` → 7 pass.

## Done criteria

ALL must hold:

- [ ] `grep '"version"' manifest.json` shows `0.2.0`
- [ ] `node --test` exits 0 with 7 passing tests
- [ ] `node --check src/ui.js && node --check src/scraper.js && node --check src/markdown.js && echo ok` prints `ok`
- [ ] `node -e "const s=require('./src/selectors.js'); console.log(s.isExternalLink('https://t.co/x'), s.isExternalLink('https://x.com/a'))"` prints `true false`
- [ ] `grep -rn "innerHTML\|insertAdjacentHTML" src/` → no matches
- [ ] `grep -rn "data-testid" src/ | grep -v selectors.js` → no matches
- [ ] `git diff --name-only` shows only: manifest.json, src/selectors.js, src/scraper.js, src/markdown.js, test/markdown.test.js, src/ui.js, plans/README.md
- [ ] Step 7 manual checklist completed; record which points passed
- [ ] `plans/README.md` status row for 003 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- After Step 7, repo links are **still missing** from the output. This means X
  renders these links by a structure neither `tweetText` anchors nor
  `[data-testid="card.wrapper"]` covers. Report the thread URL and one tweet's
  link HTML so the `cardLink` selector can be corrected in `src/selectors.js`
  (do not guess new selectors repeatedly).
- `node --test` fails after the markdown change and a reasonable fix attempt.
- A change appears to require editing `src/content.js` or `scrapeThread`.

## Maintenance notes

- `cardLink` is a new brittle selector — when X changes card markup, links break;
  fix it in `src/selectors.js` only.
- `showPanel(markdown, subtitle)` gained an optional 2nd arg; a future content.js
  change can pass a "N tweet" subtitle without breaking current callers.
- **Project rule**: bump `manifest.json` version on every future change (this plan
  did 0.1.0 → 0.2.0).
- Deferred: expanding t.co → real URL (we keep t.co hrefs, which still redirect
  correctly); per-tweet link de-dup across in-text vs card (not an issue today
  because in-text and card links don't co-occur for the same URL).
