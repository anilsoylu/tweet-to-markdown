(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const dep = isNode ? require('./article.js') : (root.TTM || {});
  const { articleToMarkdown } = dep;

  // Blank-line runs collapse everywhere except inside a fence, where they are content.
  // Only a run at least as long as the opening fence closes it, so a ``` line inside a
  // longer fence cannot invert the state for the rest of the document.
  function collapseBlanks(md) {
    const out = [];
    let fence = 0;
    let blanks = 0;
    for (const line of md.split('\n')) {
      const ticks = (line.match(/^`+/) || [''])[0].length;
      if (ticks >= 3 && (!fence || ticks >= fence)) { fence = fence ? 0 : ticks; blanks = 0; }
      else if (!fence && line === '' && ++blanks > 1) continue;
      else if (!fence && line !== '') blanks = 0;
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
      // The first article's images are its cover, already emitted above the separator.
      for (const img of (t.article && i === 0 ? [] : t.images || [])) {
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
