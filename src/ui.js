(function (root) {
  'use strict';

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

  let host; // single reused Shadow host

  // Helper: make an element with props and children — built via createElement.
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) Object.assign(node, props);
    for (const c of (children || [])) node.appendChild(c);
    return node;
  }

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

  const api = { createButton, showPanel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
