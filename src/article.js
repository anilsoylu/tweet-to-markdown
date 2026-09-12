(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const dep = isNode ? require('./selectors.js') : (root.TTM || {});
  const { SELECTORS, isExternalLink, toOriginalImage } = dep;

  const BLANK = { bold: false, italic: false, href: null };

  const computedStyle = (el) =>
    (typeof getComputedStyle === 'function' ? getComputedStyle(el) : null);

  function emphasisOf(node, ctx, style) {
    const cs = style(node);
    if (!cs) return ctx;
    return {
      bold: ctx.bold || parseInt(cs.fontWeight, 10) >= 700,
      italic: ctx.italic || cs.fontStyle === 'italic',
      href: ctx.href
    };
  }

  // Formatting is carried as per-run flags rather than markers so the serializer can
  // merge adjacent same-format runs; X splits one bold phrase across several spans.
  function runsFrom(el, style, ctx, out) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3) out.push({ text: node.textContent, ...ctx });
      else if (node.nodeName === 'IMG') out.push({ text: node.getAttribute('alt') || '', ...ctx });
      else if (node.nodeName === 'BR') out.push({ text: '\n', ...ctx });
      else if (node.nodeName === 'A') {
        const href = node.getAttribute('href') || '';
        runsFrom(node, style, { ...ctx, href: isExternalLink(href) ? href : ctx.href }, out);
      } else runsFrom(node, style, emphasisOf(node, ctx, style), out);
    }
    return out;
  }

  const runsOf = (el, style) => runsFrom(el, style, BLANK, []);
  const plainText = (el) => runsOf(el, () => null).map((r) => r.text).join('').trim();

  const listDepth = (li) => {
    const m = String(li.className).match(/depth(\d+)/);
    return m ? Number(m[1]) : 0;
  };

  function codeBlock(el) {
    const code = el.querySelector('pre code') || el.querySelector('pre');
    const lang = code && String(code.className).match(/language-([\w+-]+)/);
    return {
      type: 'code',
      lang: lang ? lang[1] : '',
      text: code ? code.textContent.replace(/\n+$/, '') : ''
    };
  }

  function tableBlock(table, style) {
    const rows = Array.from(table.querySelectorAll('tr'));
    const head = rows.find((tr) => tr.querySelector('th'));
    const cells = (tr) => Array.from(tr.children).map((c) => runsOf(c, style));
    return {
      type: 'table',
      header: head ? cells(head) : [],
      rows: rows.filter((tr) => tr !== head).map(cells)
    };
  }

  function blocksFrom(el, style) {
    const heading = el.querySelector('h1, h2');
    if (heading) {
      return [{ type: 'heading', level: heading.nodeName === 'H1' ? 1 : 2, text: plainText(heading) }];
    }
    const ordered = el.classList.contains('public-DraftStyleDefault-ol');
    if (ordered || el.classList.contains('public-DraftStyleDefault-ul')) {
      const items = Array.from(el.querySelectorAll('li'))
        .map((li) => ({ depth: listDepth(li), runs: runsOf(li, style) }));
      return [{ type: 'list', ordered, items }];
    }
    if (el.querySelector(SELECTORS.articleCodeBlock)) return [codeBlock(el)];
    const table = el.querySelector('table');
    if (table) return [tableBlock(table, style)];
    // Must match the photo selector, not a bare img: X renders emoji as <img> in prose.
    const photos = Array.from(el.querySelectorAll(SELECTORS.photo));
    if (photos.length) return photos.map((img) => ({ type: 'image', url: toOriginalImage(img.src) }));
    const runs = runsOf(el, style);
    return runs.map((r) => r.text).join('').trim() ? [{ type: 'para', runs }] : [];
  }

  function extractArticle(article, style) {
    const view = article.querySelector(SELECTORS.articleReadView);
    if (!view) return null;
    const titleEl = view.querySelector(SELECTORS.articleTitle);
    const body = view.querySelector(SELECTORS.articleBody);
    const container = body && body.firstElementChild;
    const st = style || computedStyle;
    const blocks = [];
    if (container) {
      for (const el of container.children) blocks.push(...blocksFrom(el, st));
    }
    return { title: titleEl ? titleEl.textContent.trim() : '', blocks };
  }

  function mergeRuns(runs) {
    const out = [];
    for (const r of runs || []) {
      if (!r.text) continue;
      const prev = out[out.length - 1];
      if (prev && prev.bold === !!r.bold && prev.italic === !!r.italic && (prev.href || null) === (r.href || null)) {
        prev.text += r.text;
      } else out.push({ text: r.text, bold: !!r.bold, italic: !!r.italic, href: r.href || null });
    }
    return out;
  }

  function renderRun(r) {
    let out = r.text;
    if (r.bold || r.italic) {
      // Whitespace between a marker and its text stops most parsers closing the span.
      const [, lead, core, tail] = out.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (core) {
        let mid = r.italic ? '*' + core + '*' : core;
        if (r.bold) mid = '**' + mid + '**';
        out = lead + mid + tail;
      }
    }
    return r.href ? '[' + out + '](' + r.href + ')' : out;
  }

  const renderRuns = (runs) => mergeRuns(runs).map(renderRun).join('');
  const inlineOneLine = (runs) => renderRuns(runs).replace(/\s*\n+\s*/g, ' ').trim();

  function listLines(block) {
    const counters = [];
    return block.items.map((it) => {
      const depth = it.depth || 0;
      counters.length = depth + 1;
      counters[depth] = (counters[depth] || 0) + 1;
      const marker = block.ordered ? counters[depth] + '.' : '-';
      return '  '.repeat(depth) + marker + ' ' + inlineOneLine(it.runs);
    });
  }

  function tableLines(block) {
    const rows = block.rows || [];
    const width = Math.max(block.header ? block.header.length : 0, ...rows.map((r) => r.length), 0);
    if (!width) return [];
    const line = (cells) => '| ' + Array.from({ length: width },
      (_, i) => inlineOneLine(cells[i] || []).replace(/\|/g, '\\|')).join(' | ') + ' |';
    return [line(block.header || []), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.map(line)];
  }

  function articleToMarkdown(art) {
    if (!art || !Array.isArray(art.blocks) || art.blocks.length === 0) return '';
    const lines = [];
    for (const b of art.blocks) {
      if (b.type === 'heading') lines.push('#'.repeat(b.level + 1) + ' ' + b.text);
      else if (b.type === 'para') lines.push(renderRuns(b.runs));
      else if (b.type === 'image') lines.push('![image](' + b.url + ')');
      else if (b.type === 'code') lines.push('```' + (b.lang || '') + '\n' + b.text + '\n```');
      else if (b.type === 'list') lines.push(listLines(b).join('\n'));
      else if (b.type === 'table') lines.push(tableLines(b).join('\n'));
      else continue;
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  const api = { extractArticle, articleToMarkdown, renderRuns, mergeRuns, blocksFrom };
  if (isNode) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
