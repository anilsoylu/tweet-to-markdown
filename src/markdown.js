(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const dep = isNode ? require('./article.js') : (root.TTM || {});
  const { articleToMarkdown } = dep;

  // Blank-line runs collapse everywhere except inside a fence, where they are content.
  function collapseBlanks(md) {
    const out = [];
    let inFence = false;
    let blanks = 0;
    for (const line of md.split('\n')) {
      if (line.startsWith('```')) { inFence = !inFence; blanks = 0; }
      else if (!inFence && line === '' && ++blanks > 1) continue;
      else if (!inFence && line !== '') blanks = 0;
      out.push(line);
    }
    return out.join('\n');
  }

  // thread = { author, sourceUrl, tweets: [{ text, article, images, links, hasVideo, permalink, timestamp }] }
  function buildMarkdown(thread) {
    if (!thread || !Array.isArray(thread.tweets) || thread.tweets.length === 0) {
      return '';
    }
    const author = thread.author || 'unknown';
    const first = thread.tweets[0];
    const date = first.timestamp ? first.timestamp.slice(0, 10) : '';

    const handleLink = '[@' + author + '](https://x.com/' + author + ')';
    const article = first.article || null;

    const lines = [];
    // Only the heading falls back on a missing title; the cover and the body still belong
    // to the article, and gating them on the title too would silently drop the cover.
    lines.push(article && article.title ? '# ' + article.title : '# Thread by ' + handleLink);
    lines.push('');
    const meta = ['[source](' + (thread.sourceUrl || first.permalink) + ')'];
    if (date) meta.unshift(date);
    if (article) meta.unshift(handleLink);
    lines.push('> ' + meta.join(' · '));
    lines.push('');
    if (article) {
      for (const img of (first.images || [])) { lines.push('![cover](' + img + ')'); lines.push(''); }
    }

    thread.tweets.forEach((t, i) => {
      lines.push('---');
      lines.push('');
      const body = t.article ? articleToMarkdown(t.article) : t.text;
      if (body) { lines.push(body); lines.push(''); }
      for (const img of (t.article ? [] : t.images || [])) {
        lines.push('![image](' + img + ')');
        lines.push('');
      }
      if (t.hasVideo) {
        lines.push('[video](' + t.permalink + ')');
        lines.push('');
      }
      for (const l of (t.links || [])) {
        lines.push('🔗 [' + (l.text || l.href) + '](' + l.href + ')');
      }
      if (t.links && t.links.length) lines.push('');
    });

    return collapseBlanks(lines.join('\n')).trim() + '\n';
  }

  const api = { buildMarkdown };
  if (isNode) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
