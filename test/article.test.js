const test = require('node:test');
const assert = require('node:assert');
const { articleToMarkdown, renderRuns, blocksFrom } = require('../src/article.js');
const { SELECTORS } = require('../src/selectors.js');

const md = (blocks) => articleToMarkdown({ title: 't', blocks });
const run = (text, extra) => Object.assign({ text }, extra);
// Interiors of the ** spans; a parser refuses to close one padded with whitespace.
const boldSpans = (s) => s.split('**').filter((_, i) => i % 2 === 1);

test('loading the content scripts in manifest order does not throw', () => {
  assert.doesNotThrow(() => require('../src/scraper.js'));
  assert.doesNotThrow(() => require('../src/markdown.js'));
});

test('empty article renders nothing', () => {
  assert.strictEqual(articleToMarkdown({ title: 't', blocks: [] }), '');
  assert.strictEqual(articleToMarkdown(null), '');
});

test('paragraph renders bold, italic and links inline', () => {
  const out = md([{ type: 'para', runs: [
    run('plain '), run('strong', { bold: true }), run(' and '), run('slanted', { italic: true }),
    run(' and '), run('site', { href: 'https://example.com' })
  ] }]);
  assert.match(out, /\*\*strong\*\*/);
  assert.match(out, /(?<!\*)\*slanted\*(?!\*)/);
  assert.match(out, /\[site\]\(https:\/\/example\.com\)/);
});

test('adjacent runs of the same format merge into one emphasis span', () => {
  const out = md([{ type: 'para', runs: [
    run('The '), run('loop ', { bold: true }), run('runs', { bold: true }), run(' here')
  ] }]);
  assert.strictEqual(out, 'The **loop runs** here');
  assert.deepStrictEqual(boldSpans(out), ['loop runs']);
});

test('whitespace never lands between a marker and its text', () => {
  const out = md([{ type: 'para', runs: [run('lead'), run(' bolded ', { bold: true }), run('tail')] }]);
  assert.strictEqual(out, 'lead **bolded** tail');
  for (const span of boldSpans(out)) assert.doesNotMatch(span, /^\s|\s$/);
});

test('a whitespace-only run gets no markers', () => {
  assert.strictEqual(renderRuns([run('a'), run('   ', { bold: true }), run('b')]), 'a   b');
});

test('article headings shift one level down and carry no emphasis', () => {
  const out = md([
    { type: 'heading', level: 1, text: 'Top' },
    { type: 'heading', level: 2, text: 'Sub' }
  ]);
  assert.match(out, /^## Top$/m);
  assert.match(out, /^### Sub$/m);
  assert.doesNotMatch(out, /\*/);
});

test('ordered list numbers sequentially and indents by depth', () => {
  const out = md([{ type: 'list', ordered: true, items: [
    { depth: 0, runs: [run('one')] },
    { depth: 1, runs: [run('nested')] },
    { depth: 0, runs: [run('two')] }
  ] }]);
  assert.match(out, /^1\. one$/m);
  assert.match(out, /^ {2}1\. nested$/m);
  assert.match(out, /^2\. two$/m);
});

test('unordered list uses dashes', () => {
  const out = md([{ type: 'list', ordered: false, items: [{ depth: 0, runs: [run('a')] }] }]);
  assert.match(out, /^- a$/m);
});

test('code block fences with its language and keeps interior blank lines', () => {
  const out = md([{ type: 'code', lang: 'javascript', text: 'a\n\n\nb' }]);
  assert.match(out, /^```javascript$/m);
  assert.ok(out.includes('a\n\n\nb'), out);
  assert.match(out, /^```$/m);
});

test('table renders a header, a separator and its rows', () => {
  const out = md([{ type: 'table',
    header: [[run('h1')], [run('h2')]],
    rows: [[[run('a')], [run('b|c')]]] }]);
  assert.match(out, /^\| h1 \| h2 \|$/m);
  assert.match(out, /^\| --- \| --- \|$/m);
  assert.match(out, /^\| a \| b\\\|c \|$/m);
});

test('image block renders a markdown image', () => {
  assert.strictEqual(md([{ type: 'image', url: 'https://pbs.twimg.com/media/x?name=orig' }]),
    '![image](https://pbs.twimg.com/media/x?name=orig)');
});

// A fake element that answers only the selectors it was given and fails loudly on any
// other, so a branch querying the wrong selector cannot pass silently.
function fakeEl(spec) {
  const matches = spec.matches || {};
  const find = (sel) => {
    if (!(sel in matches)) throw new Error('unexpected selector: ' + sel);
    return matches[sel];
  };
  return {
    nodeType: 1,
    nodeName: spec.nodeName || 'DIV',
    className: spec.className || '',
    classList: { contains: (c) => (spec.className || '').split(/\s+/).includes(c) },
    childNodes: spec.childNodes || [],
    children: spec.children || [],
    querySelector: (sel) => find(sel)[0] || null,
    querySelectorAll: (sel) => find(sel),
    getAttribute: (a) => (spec.attrs || {})[a] || null
  };
}

test('an emoji img in prose stays a paragraph and is not read as an image block', () => {
  const emoji = fakeEl({ nodeName: 'IMG', attrs: { alt: '🚷' }, matches: {} });
  const block = fakeEl({
    className: 'longform-unstyled',
    childNodes: [{ nodeType: 3, textContent: 'warning ' }, emoji],
    matches: { 'h1, h2': [], [SELECTORS.articleCodeBlock]: [], table: [], [SELECTORS.photo]: [] }
  });
  const out = blocksFrom(block, () => null);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'para');
  assert.strictEqual(articleToMarkdown({ blocks: out }), 'warning 🚷');
});

test('a block holding a real tweet photo becomes an image block', () => {
  const photo = { src: 'https://pbs.twimg.com/media/abc?format=jpg&name=small' };
  const block = fakeEl({
    className: '',
    matches: { 'h1, h2': [], [SELECTORS.articleCodeBlock]: [], table: [], [SELECTORS.photo]: [photo] }
  });
  const out = blocksFrom(block, () => null);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'image');
  assert.match(out[0].url, /name=orig/);
});
