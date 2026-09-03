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
    // Same motif as the toolbar icon. Drawn at 22.5px like X's action glyphs on an
    // opened tweet, whose fill outlines carry the same ~2 unit weight as a stroke.
    bubbleDown: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
                 'M12 6v7', 'm9 10 3 3 3-3'],
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
    btn.appendChild(icon(ICONS.bubbleDown, 22.5));
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

  let host, taEl, subEl, okEl, keyHandler;

  function ensureShadow() {
    if (host) return host.shadowRoot;
    host = document.createElement('div');
    host.id = 'ttm-panel-host';
    document.documentElement.appendChild(host);
    return host.attachShadow({ mode: 'open' });
  }

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
    const card = el('div', { className: pageIsDark() ? 'card ttm-dark' : 'card' }, [header, taEl]);
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
