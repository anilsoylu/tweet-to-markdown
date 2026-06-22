# Plan 005: Fix dialog dark-mode contrast by detecting X's actual theme

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a "STOP condition"
> occurs, stop and report. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `node --test` must pass (7). `grep '"version"'
> manifest.json` must show `0.3.0`. Open `src/ui.js`; the `PANEL_CSS` template and
> `showPanel` must match the "Current state" excerpts below. On mismatch, STOP.

## Status

- **Priority**: P1 (text is unreadable in X dark mode — a real visual bug)
- **Effort**: S
- **Risk**: LOW (CSS + a small JS theme-detect; self-contained in the dialog)
- **Depends on**: plan 004 (DONE)
- **Category**: bug
- **Planned at**: commit `e9656b2`, 2026-06-22

## Why this matters

In X's dark theme the dialog's Markdown text is nearly invisible (dark text on a
dark card). Two causes: (1) a CSS **ordering bug** — the unconditional
`textarea{color:#0f1419}` rule is declared *after* the dark-mode override, so it
always wins regardless of the media query; (2) more fundamentally, **X's theme is
set in-app (Default / Dim / Lights-out) independent of the OS `prefers-color-scheme`**,
so keying the dialog off the OS media query is unreliable. The fix detects X's
actual theme from the page background and drives colors with CSS variables, so the
dialog always matches whatever theme the user has active in X.

## Current state

- `manifest.json` — `"version": "0.3.0"`.
- `src/ui.js` — `PANEL_CSS` keys dark styling off `@media (prefers-color-scheme:
  dark)` and has the unconditional `textarea{...color:#0f1419;...}` rule declared
  **after** that media block (the ordering bug). `showPanel` builds the card with
  `const card = el('div', { className: 'card' }, [header, taEl]);`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `node --test` | 7 pass, exit 0 |
| Syntax check | `node --check src/ui.js && echo ok` | `ok` |
| Manifest valid | `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'));console.log('ok')"` | `ok` |
| No innerHTML | `grep -rn "innerHTML\|insertAdjacentHTML" src/` | no matches |
| Media query removed | `grep -c "prefers-color-scheme" src/ui.js` | `0` |

## Scope

**In scope**: `manifest.json` (version), `src/ui.js` (`PANEL_CSS` + `showPanel`).
**Out of scope**: everything else — `src/content.js`, `src/scraper.js`,
`src/markdown.js`, `src/selectors.js`, `test/**`, `createButton` (the action-bar
button inherits X's `color` via `color: inherit`, so it's already theme-correct).

## Steps

### Step 1: Bump version

`manifest.json`: `"version": "0.3.0"` → `"version": "0.3.1"`.

**Verify**: `grep '"version"' manifest.json` → `0.3.1`.

### Step 2: Replace the `PANEL_CSS` template in `src/ui.js`

Replace the **entire** `const PANEL_CSS = \`...\`;` block with this (colors now come
from CSS variables; a `.card.ttm-dark` class supplies the dark palette; the
`prefers-color-scheme` media query is removed; `prefers-reduced-motion` is kept):

```js
  const PANEL_CSS = `
    *{box-sizing:border-box;}
    @keyframes ttm-ov-in{from{opacity:0}to{opacity:1}}
    @keyframes ttm-card-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;
        display:flex;align-items:center;justify-content:center;padding:24px;
        animation:ttm-ov-in .18s ease-out;}
    .card{--bg:#fff;--fg:#0f1419;--border:rgba(0,0,0,.12);--xhover:rgba(15,20,25,.1);
          background:var(--bg);color:var(--fg);width:min(720px,94vw);max-height:88vh;
          display:flex;flex-direction:column;border-radius:16px;overflow:hidden;
          box-shadow:0 24px 64px rgba(0,0,0,.45);
          font:14px/1.5 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          animation:ttm-card-in .2s cubic-bezier(.2,.8,.2,1);}
    .card.ttm-dark{--bg:#15202b;--fg:#e7e9ea;--border:rgba(255,255,255,.14);--xhover:rgba(239,243,244,.1);}
    @media (prefers-reduced-motion: reduce){.ov,.card{animation:none;}}
    header{display:flex;gap:12px;align-items:center;justify-content:space-between;
           padding:14px 16px;border-bottom:1px solid var(--border);}
    .titles{display:flex;flex-direction:column;gap:1px;min-width:0;}
    .titles strong{font-size:16px;font-weight:700;}
    .titles span{font-size:13px;opacity:.6;}
    .row{display:flex;gap:8px;align-items:center;}
    textarea{flex:1;min-height:340px;border:0;outline:0;resize:none;padding:18px;
             background:transparent;color:var(--fg);tab-size:2;
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
    .ttm-x:hover{background:var(--xhover);}
    .ok{display:inline-flex;align-items:center;gap:4px;color:#00ba7c;font-size:13px;font-weight:600;}`;
```

### Step 3: Add `pageIsDark()` and apply the theme class in `src/ui.js`

Immediately **above** the `function showPanel(` declaration, add this helper:

```js
  // Detect X's active theme (Default/Dim/Lights-out are set in-app, independent of
  // the OS color scheme) from the page background luminance.
  function pageIsDark() {
    try {
      const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
      if (!m) return false;
      const r = +m[0], g = +m[1], b = +m[2];
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
    } catch (e) { return false; }
  }
```

Then, inside `showPanel`, change the card creation line:

```js
    const card = el('div', { className: 'card' }, [header, taEl]);
```

to:

```js
    const card = el('div', { className: pageIsDark() ? 'card ttm-dark' : 'card' }, [header, taEl]);
```

Leave the rest of `showPanel` unchanged.

**Verify**:
- `node --check src/ui.js && echo ok` → `ok`
- `grep -c "prefers-color-scheme" src/ui.js` → `0`
- `grep -c "pageIsDark" src/ui.js` → `2` (definition + call)

### Step 4: MANDATORY manual re-verification in Chrome

1. Reload the unpacked extension.
2. In X, set theme to **Default (light)** → open the dialog → Markdown text is dark
   on a white card, clearly readable.
3. Switch X theme to **Dim** and to **Lights out** → reopen the dialog → text is
   light on a dark card, clearly readable in both. Header, buttons, borders all legible.
4. Confirm this holds **regardless of the OS light/dark setting** (the dialog should
   follow X's theme, not the OS).
5. Record which points passed.

## Test plan

- No automated tests change. Gate: `node --test` still 7 pass (proves non-UI files
  untouched). Acceptance = Step 4 manual checklist across all three X themes.

## Done criteria

- [ ] `grep '"version"' manifest.json` → `0.3.1`
- [ ] `node --test` exits 0 with 7 tests
- [ ] `node --check src/ui.js && echo ok` → `ok`
- [ ] `grep -c "prefers-color-scheme" src/ui.js` → `0`
- [ ] `grep -c "pageIsDark" src/ui.js` → `2`
- [ ] `grep -rn "innerHTML\|insertAdjacentHTML" src/` → no matches
- [ ] `git diff --name-only` shows only: manifest.json, src/ui.js, plans/README.md (+ new plan file)
- [ ] Step 4 manual checklist completed (all three X themes legible)
- [ ] `plans/README.md` status row for 005 updated to DONE

## STOP conditions

Stop and report if:

- After Step 4, text is still low-contrast in any X theme — report the X theme and
  the computed `document.body` background color so the luminance threshold or the
  detection target can be adjusted.
- `getComputedStyle(document.body)` returns no usable color (e.g. transparent) — the
  detection target may need to be a different element (e.g. a known X surface).
- `node --test` fails (means a non-UI file was touched) — revert and report.

## Maintenance notes

- The dialog now follows **X's** theme, detected at open time from `document.body`
  background luminance, not the OS `prefers-color-scheme`. If X restructures so the
  body background is transparent, revisit the detection target.
- Add new dialog colors as CSS variables on `.card` (+ a `.card.ttm-dark` value) so
  both themes stay in sync — do not reintroduce a `prefers-color-scheme` media query.
- Project rule: bump `manifest.json` version each change (this plan did 0.3.0 → 0.3.1).
