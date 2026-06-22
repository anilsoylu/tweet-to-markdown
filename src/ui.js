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

  // Helper: make an element with props and children — built via createElement.
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
