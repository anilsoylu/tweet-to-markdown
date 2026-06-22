# Plan 004: SVG icons, polished/accessible dialog, native button placement, version bump

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a "STOP condition"
> occurs, stop and report — do not improvise. When done, update the status row for
> this plan in `plans/README.md`.
>
> **Drift check (run first)**: `node --test` must pass (7 tests). `grep '"version"'
> manifest.json` must show `0.2.0`. Open `src/ui.js` and `src/content.js` and
> confirm they match the "Current state" excerpts below; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (button placement depends on X action-bar DOM; dialog is self-contained)
- **Depends on**: plans 001, 002, 003 (all DONE)
- **Category**: dx/polish + bug (button placement)
- **Planned at**: commit `81b8ff1`, 2026-06-22

## Why this matters

Three design problems flagged after live use:

1. **Button placement is broken.** X's action bar is a flex row where reply /
   repost / like / bookmark cells `flex-grow` to spread evenly while the share
   button sits at the right. We append a **bare** button with no grow, so it lands
   alone at the far right with an awkward gap before it. It must instead join the
   row's rhythm.
2. **Emoji used as icons** (`📋`, `✕`) — the single biggest "looks unprofessional"
   signal per design review. Replace with inline **SVG** icons (consistent 2px
   stroke, Lucide-style).
3. **Dialog is unpolished and not accessible** — no enter animation, no focus
   management, no Escape-to-close, no focus rings, and it re-renders (flashes) when
   switching from the "loading" state to the result.

This plan fixes all three and bumps the version (project rule: every update bumps
`manifest.json`).

## Current state

- `manifest.json` — `"version": "0.2.0"`.
- `src/content.js` — `injectIntoFirstTweet()` currently does:
  ```js
    const bar = article.querySelector(TTM.SELECTORS.actionBar);
    if (!bar || bar.querySelector('.ttm-convert-btn')) return; // already injected
    bar.appendChild(TTM.createButton(onConvertClick));
  ```
  The `bar.appendChild(...)` is the placement bug.
- `src/ui.js` — `createButton` renders `📋` text; `showPanel` uses `✕` text, rebuilds
  the whole panel each call (flash), no animation, no a11y. (Full file is replaced in
  Step 3.)
- The real X action bar (confirmed from live DOM) is `div[role="group"]` whose direct
  children are: 4 grow-wrapper `div`s (reply/retweet/like/bookmark, each
  `class="css-175oi2r r-18u37iz r-1h0z5md r-13awgt0"`) and a final share wrapper `div`.
  The grow class on the first four is what produces the even spacing.

### Conventions (unchanged — match them)

- Classic content scripts via `globalThis.TTM`, dual-env IIFE wrapper. No build, no deps.
- **No `innerHTML` / `insertAdjacentHTML`.** Build DOM with `createElement` /
  `createElementNS` (SVG needs the namespaced version) + `textContent`.
- All X selectors live in `src/selectors.js` (no new selector is needed here; we reuse
  the existing `actionBar` and X's own child classes by copying them at runtime).
- 2-space indent, single quotes, semicolons.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `node --test` | 7 pass, exit 0 |
| Syntax check | `node --check src/ui.js && node --check src/content.js && echo ok` | `ok` |
| Manifest valid | `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'));console.log('ok')"` | `ok` |
| No innerHTML | `grep -rn "innerHTML\|insertAdjacentHTML" src/` | no matches |
| No emoji-as-icon left | `grep -n "📋\|✕\|🔗" src/ui.js` | no matches in ui.js |

## Scope

**In scope** (edit only these):
- `manifest.json` — version `0.2.0` → `0.3.0`.
- `src/content.js` — fix `injectIntoFirstTweet` placement only.
- `src/ui.js` — full replacement (SVG icons + animated, accessible, no-flash dialog).

**Out of scope** (do NOT touch):
- `src/scraper.js`, `src/markdown.js`, `src/selectors.js`, `test/**`.
- The `🔗` prefix in `src/markdown.js` — that lives in the **generated document text**
  (content the user copies), not UI chrome, and renders fine on GitHub. Leave it.

## Steps

### Step 1: Bump version in `manifest.json`

`"version": "0.2.0"` → `"version": "0.3.0"`. Nothing else.

**Verify**: `grep '"version"' manifest.json` → `0.3.0`; manifest still parses.

### Step 2: Fix button placement in `src/content.js`

Replace the body of `injectIntoFirstTweet` so the button is wrapped in a cell that
**reuses X's own action-cell classes** (matching the grow/spacing rhythm) and is
inserted **before the share wrapper** (the action bar's last child):

```js
  function injectIntoFirstTweet() {
    if (!/^\/[^/]+\/status\/\d+/.test(location.pathname)) return; // tweet pages only
    const article = document.querySelector(TTM.SELECTORS.tweet);
    if (!article) return;
    const bar = article.querySelector(TTM.SELECTORS.actionBar);
    if (!bar || bar.querySelector('.ttm-convert-btn')) return; // already injected
    const sample = bar.firstElementChild;   // X's reply cell — mirror its layout classes
    const cell = document.createElement('div');
    if (sample) cell.className = sample.className;
    cell.style.display = 'flex';
    cell.style.alignItems = 'center';
    cell.appendChild(TTM.createButton(onConvertClick));
    const share = bar.lastElementChild;     // X's share button wrapper is last
    if (share && share !== sample) bar.insertBefore(cell, share);
    else bar.appendChild(cell);
  }
```

Leave the rest of `content.js` (`onConvertClick`, the observer) unchanged.

**Verify**: `node --check src/content.js && echo ok` → `ok`. (Visual placement is checked in Step 4.)

### Step 3: Replace `src/ui.js` entirely

Write this exact file content (SVG icons; animated, accessible, no-flash dialog):

```js
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Inline SVG icon from Lucide-style stroke path data (24x24 viewBox).
  function icon(paths, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 20));
    svg.setAttribute('height', String(size || 20));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }

  const ICONS = {
    clipboard: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
                'M15 2H9a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z'],
    copy: ['M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
           'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    check: ['M20 6 9 17l-5-5'],
    close: ['M18 6 6 18', 'm6 6 12 12']
  };

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) Object.assign(node, props);
    for (const c of (children || [])) node.appendChild(c);
    return node;
  }

  function labeledButton(variant, label, iconPaths) {
    const b = el('button', variant ? { className: variant } : null);
    b.type = 'button';
    if (iconPaths) b.appendChild(icon(iconPaths, 16));
    b.appendChild(el('span', { textContent: label }));
    return b;
  }

  function createButton(onClick) {
    const btn = el('button', { className: 'ttm-convert-btn', type: 'button' });
    btn.setAttribute('aria-label', "Markdown'a çevir");
    btn.title = "Bu thread'i Markdown'a çevir";
    Object.assign(btn.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '34px', height: '34px', padding: '0', borderRadius: '9999px',
      border: '0', background: 'transparent', color: 'inherit', cursor: 'pointer',
      outline: '0', transition: 'background-color .15s, box-shadow .15s, color .15s'
    });
    btn.appendChild(icon(ICONS.clipboard, 18));
    btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = 'rgba(29,155,240,.12)'; btn.style.color = '#1d9bf0'; });
    btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = 'transparent'; btn.style.color = 'inherit'; });
    btn.addEventListener('focus', () => { btn.style.boxShadow = '0 0 0 2px rgba(29,155,240,.7)'; });
    btn.addEventListener('blur', () => { btn.style.boxShadow = 'none'; });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }

  const PANEL_CSS = `
    *{box-sizing:border-box;}
    @keyframes ttm-ov-in{from{opacity:0}to{opacity:1}}
    @keyframes ttm-card-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;
        display:flex;align-items:center;justify-content:center;padding:24px;
        animation:ttm-ov-in .18s ease-out;}
    .card{background:#fff;color:#0f1419;width:min(720px,94vw);max-height:88vh;
           display:flex;flex-direction:column;border-radius:16px;overflow:hidden;
           box-shadow:0 24px 64px rgba(0,0,0,.45);
           font:14px/1.5 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
           animation:ttm-card-in .2s cubic-bezier(.2,.8,.2,1);}
    @media (prefers-reduced-motion: reduce){.ov,.card{animation:none;}}
    @media (prefers-color-scheme: dark){
      .card{background:#15202b;color:#e7e9ea;}
      textarea{color:#e7e9ea;}
      .ttm-x:hover{background:rgba(239,243,244,.1);}}
    header{display:flex;gap:12px;align-items:center;justify-content:space-between;
           padding:14px 16px;border-bottom:1px solid rgba(127,127,127,.2);}
    .titles{display:flex;flex-direction:column;gap:1px;min-width:0;}
    .titles strong{font-size:16px;font-weight:700;}
    .titles span{font-size:13px;opacity:.6;}
    .row{display:flex;gap:8px;align-items:center;}
    textarea{flex:1;min-height:340px;border:0;outline:0;resize:none;padding:18px;
             background:transparent;color:#0f1419;tab-size:2;
             white-space:pre-wrap;word-break:break-word;
             font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
    button{display:inline-flex;align-items:center;gap:6px;
           padding:8px 14px;border-radius:9999px;border:1px solid rgba(127,127,127,.4);
           background:transparent;color:inherit;cursor:pointer;
           font:600 14px/1 inherit;transition:opacity .15s,background-color .15s,box-shadow .15s;}
    button:hover{opacity:.85;}
    button:focus-visible{outline:0;box-shadow:0 0 0 2px #1d9bf0;}
    button.primary{background:#1d9bf0;color:#fff;border-color:#1d9bf0;}
    button svg{display:block;}
    .ttm-x{width:36px;height:36px;padding:0;border:0;border-radius:9999px;justify-content:center;}
    .ttm-x:hover{background:rgba(15,20,25,.1);}
    .ok{display:inline-flex;align-items:center;gap:4px;color:#00ba7c;font-size:13px;font-weight:600;}`;

  let host, taEl, subEl, okEl, keyHandler;

  function ensureShadow() {
    if (host) return host.shadowRoot;
    host = document.createElement('div');
    host.id = 'ttm-panel-host';
    document.documentElement.appendChild(host);
    return host.attachShadow({ mode: 'open' });
  }

  function showPanel(markdown, subtitle) {
    const sh = ensureShadow();
    if (sh.childElementCount > 0) {            // already open → update in place (no flash)
      if (taEl) taEl.value = markdown;
      if (subEl) subEl.textContent = subtitle || '';
      return;
    }
    const style = el('style'); style.textContent = PANEL_CSS;

    okEl = el('span', { className: 'ok' });
    const copyBtn = labeledButton('primary', 'Kopyala', ICONS.copy);
    const dlBtn = labeledButton('', 'İndir .md', ICONS.download);
    const closeBtn = el('button', { className: 'ttm-x', type: 'button' });
    closeBtn.setAttribute('aria-label', 'Kapat');
    closeBtn.appendChild(icon(ICONS.close, 18));
    taEl = el('textarea', { spellcheck: false, value: markdown });
    taEl.setAttribute('aria-label', 'Markdown çıktısı');
    subEl = el('span', { textContent: subtitle || '' });

    const titles = el('div', { className: 'titles' }, [
      el('strong', { textContent: 'Tweet → Markdown' }), subEl
    ]);
    const header = el('header', null, [
      titles, el('div', { className: 'row' }, [okEl, copyBtn, dlBtn, closeBtn])
    ]);
    const card = el('div', { className: 'card' }, [header, taEl]);
    const ov = el('div', { className: 'ov' }, [card]);
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Tweet → Markdown');

    const close = () => {
      sh.replaceChildren();
      if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
    };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    closeBtn.addEventListener('click', close);
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(taEl.value); }
      catch { taEl.select(); document.execCommand('copy'); }
      okEl.replaceChildren(icon(ICONS.check, 16), document.createTextNode(' Kopyalandı'));
      setTimeout(() => okEl.replaceChildren(), 1600);
    });
    dlBtn.addEventListener('click', () => {
      const blob = new Blob([taEl.value], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'thread.md'; a.click();
      URL.revokeObjectURL(a.href);
    });
    keyHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', keyHandler, true);

    sh.append(style, ov);
    closeBtn.focus();
  }

  const api = { createButton, showPanel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Verify**: `node --check src/ui.js && echo ok` → `ok`; `grep -n "📋\|✕" src/ui.js` → no matches; `grep -rn "innerHTML\|insertAdjacentHTML" src/` → no matches.

### Step 4: MANDATORY manual re-verification in Chrome

1. `chrome://extensions` → reload the unpacked extension.
2. Open a tweet/thread page. Confirm the convert button is now a **clean SVG
   clipboard icon** sitting **in the action row's rhythm** (evenly spaced with the
   other icons, immediately before the share icon — no lonely far-right gap).
3. Hover the button → light blue circular highlight; Tab to it → visible focus ring.
4. Click it → dialog **animates in** (fade + slight scale), no flash when it swaps
   from "Thread toplanıyor…" to the result.
5. In the dialog: SVG icons on Kopyala / İndir / close; **Kopyala** shows a check +
   "Kopyalandı"; **Esc** closes; clicking the dark backdrop closes; focus ring
   visible when tabbing the buttons.
6. Toggle OS dark/light mode → dialog stays legible in both.
7. Record which points passed.

## Test plan

- No automated tests change (UI isn't unit-tested). Gate: `node --test` still 7 pass
  (proves scraper/markdown untouched).
- Acceptance = Step 4 manual checklist.

## Done criteria

ALL must hold:

- [ ] `grep '"version"' manifest.json` shows `0.3.0`
- [ ] `node --test` exits 0 with 7 tests
- [ ] `node --check src/ui.js && node --check src/content.js && echo ok` prints `ok`
- [ ] `grep -n "📋\|✕" src/ui.js` → no matches (no emoji icons in UI chrome)
- [ ] `grep -rn "innerHTML\|insertAdjacentHTML" src/` → no matches
- [ ] `grep -rn "data-testid" src/ | grep -v selectors.js` → no matches
- [ ] `git diff --name-only` shows only: manifest.json, src/content.js, src/ui.js, plans/README.md (+ the new plan file)
- [ ] Step 4 manual checklist completed; record which points passed
- [ ] `plans/README.md` status row for 004 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- After Step 4 the button is still misplaced (e.g. lands at far right with a gap, or
  stacks vertically). Report the action-bar structure you observed; the fix may need
  a different insertion target than "before `bar.lastElementChild`".
- SVG icons render as empty/blank — likely the icon was built with `createElement`
  instead of `createElementNS`; confirm the namespaced helper is used.
- `node --test` fails (means a non-UI file was touched) — revert and report.

## Maintenance notes

- Button placement reuses X's own action-cell class names at runtime
  (`sample.className`) instead of hardcoding obfuscated classes, so it adapts when X
  reshuffles class hashes — but if X restructures the action bar's child layout, the
  "insert before last child" assumption may need revisiting (covered by a STOP cond.).
- Dialog is fully self-contained in a Shadow DOM with SVG icons; new controls should
  follow the same `icon()` / `labeledButton()` helpers and keep `:focus-visible`
  rings + reduced-motion handling.
- `showPanel(markdown, subtitle)` updates in place when already open (no re-animation)
  — keep that branch so the loading→result swap stays flash-free.
- Project rule: bump `manifest.json` version on every change (this plan did 0.2.0 → 0.3.0).
