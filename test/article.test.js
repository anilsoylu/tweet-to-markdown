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

// Blocks are classified by branch order in blocksFrom, so each kind is checked against a
// fake that answers every selector the branches ahead of it consult.
const nothing = { 'h1, h2': [], [SELECTORS.articleCodeBlock]: [], table: [], [SELECTORS.photo]: [] };

test('a block containing an h1 becomes a heading before any later branch runs', () => {
  const h1 = fakeEl({ nodeName: 'H1', childNodes: [{ nodeType: 3, textContent: 'Top' }] });
  const out = blocksFrom(fakeEl({ matches: { ...nothing, 'h1, h2': [h1] } }), () => null);
  assert.deepStrictEqual(out, [{ type: 'heading', level: 1, text: 'Top' }]);
});

test('an ordered list block reads its items and their depth', () => {
  const li = (text, className) =>
    fakeEl({ nodeName: 'LI', className, childNodes: [{ nodeType: 3, textContent: text }] });
  const block = fakeEl({
    className: 'public-DraftStyleDefault-ol',
    matches: { ...nothing, li: [li('one', 'depth0'), li('two', 'depth1')] }
  });
  const out = blocksFrom(block, () => null);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'list');
  assert.strictEqual(out[0].ordered, true);
  assert.deepStrictEqual(out[0].items.map((i) => i.depth), [0, 1]);
  assert.match(articleToMarkdown({ blocks: out }), /^ {2}1\. two$/m);
});

test('a code block wins over the table and photo branches', () => {
  const code = fakeEl({ nodeName: 'CODE', className: 'language-python' });
  code.textContent = 'print(1)\n\n';
  const block = fakeEl({
    matches: { ...nothing, [SELECTORS.articleCodeBlock]: [{}], 'pre code': [code] }
  });
  const out = blocksFrom(block, () => null);
  assert.deepStrictEqual(out, [{ type: 'code', lang: 'python', text: 'print(1)' }]);
});

test('a table block reads its header row and its body rows', () => {
  const cell = (text, nodeName) =>
    fakeEl({ nodeName, childNodes: [{ nodeType: 3, textContent: text }] });
  const tr = (cells, hasTh) =>
    fakeEl({ nodeName: 'TR', children: cells, matches: { th: hasTh ? [cells[0]] : [] } });
  const head = tr([cell('h', 'TH')], true);
  const body = tr([cell('v', 'TD')], false);
  const table = fakeEl({ nodeName: 'TABLE', matches: { tr: [head, body] } });
  const block = fakeEl({ matches: { ...nothing, table: [table] } });
  const out = blocksFrom(block, () => null);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'table');
  assert.match(articleToMarkdown({ blocks: out }), /^\| h \|\n\| --- \|\n\| v \|$/m);
});

test('a code body holding its own fence is wrapped in a longer one', () => {
  const out = md([{ type: 'code', lang: '', text: 'before\n```\nafter' }]);
  assert.match(out, /^````$/m);
  assert.ok(out.includes('```\nafter'), out);
  assert.strictEqual(out.split('\n')[0], '````');
  assert.strictEqual(out.split('\n').pop(), '````');
});

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
