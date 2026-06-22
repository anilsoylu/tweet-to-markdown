(function (root) {
  'use strict';

  // thread = { author, sourceUrl, tweets: [{ text, images, links, hasVideo, permalink, timestamp }] }
  function buildMarkdown(thread) {
    if (!thread || !Array.isArray(thread.tweets) || thread.tweets.length === 0) {
      return '';
    }
    const author = thread.author || 'unknown';
    const first = thread.tweets[0];
    const date = first.timestamp ? first.timestamp.slice(0, 10) : '';

    const lines = [];
    lines.push('# Thread by [@' + author + '](https://x.com/' + author + ')');
    lines.push('');
    const meta = ['[source](' + (thread.sourceUrl || first.permalink) + ')'];
    if (date) meta.unshift(date);
    lines.push('> ' + meta.join(' · '));
    lines.push('');

    thread.tweets.forEach((t, i) => {
      lines.push('---');
      lines.push('');
      if (t.text) { lines.push(t.text); lines.push(''); }
      for (const img of (t.images || [])) {
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

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  const api = { buildMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTM = root.TTM || {};
  Object.assign(root.TTM, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
