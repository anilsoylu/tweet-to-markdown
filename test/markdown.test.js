const test = require('node:test');
const assert = require('node:assert');
const { buildMarkdown } = require('../src/markdown.js');

test('empty thread returns empty string', () => {
  assert.strictEqual(buildMarkdown({ author: 'a', tweets: [] }), '');
  assert.strictEqual(buildMarkdown(null), '');
});

test('single tweet renders header, source and text', () => {
  const md = buildMarkdown({
    author: 'AIVersePlay',
    sourceUrl: 'https://x.com/AIVersePlay/status/1',
    tweets: [{ text: 'Hello world', images: [], hasVideo: false,
               permalink: 'https://x.com/AIVersePlay/status/1', timestamp: '2026-06-22T10:00:00.000Z' }]
  });
  assert.match(md, /# Thread by \[@AIVersePlay\]/);
  assert.match(md, /2026-06-22/);
  assert.match(md, /\[source\]\(https:\/\/x\.com\/AIVersePlay\/status\/1\)/);
  assert.match(md, /Hello world/);
});

test('multi-tweet thread keeps order and separators', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [
      { text: 'first', images: [], hasVideo: false, permalink: 'p1', timestamp: null },
      { text: 'second', images: [], hasVideo: false, permalink: 'p2', timestamp: null }
    ]
  });
  assert.ok(md.indexOf('first') < md.indexOf('second'));
  assert.strictEqual((md.match(/^---$/gm) || []).length, 2);
});

test('images become markdown image links and video becomes a link', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 't', images: ['https://pbs.twimg.com/media/x?name=orig'],
               hasVideo: true, permalink: 'https://x.com/a/status/9', timestamp: null }]
  });
  assert.match(md, /!\[image\]\(https:\/\/pbs\.twimg\.com\/media\/x\?name=orig\)/);
  assert.match(md, /\[video\]\(https:\/\/x\.com\/a\/status\/9\)/);
});

test('no run of 3+ blank lines', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'x', images: [], hasVideo: false, permalink: 'p', timestamp: null }]
  });
  assert.doesNotMatch(md, /\n{3,}/);
});

test('renders card links under a tweet', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'Firecrawl', images: [], hasVideo: false,
               links: [{ text: 'github.com/mendableai/firecrawl', href: 'https://t.co/x' }],
               permalink: 'p', timestamp: null }]
  });
  assert.match(md, /🔗 \[github\.com\/mendableai\/firecrawl\]\(https:\/\/t\.co\/x\)/);
});

test('tweets without links still render and add no link line', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'no links here', images: [], hasVideo: false, permalink: 'p', timestamp: null }]
  });
  assert.match(md, /no links here/);
  assert.doesNotMatch(md, /🔗/);
});
