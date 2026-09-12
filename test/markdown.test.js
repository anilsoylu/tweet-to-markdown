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

test('an article thread is titled by the article, not by the author', () => {
  const md = buildMarkdown({
    author: 'MichLieben', sourceUrl: 'https://x.com/MichLieben/status/1',
    tweets: [{ text: '', images: ['https://pbs.twimg.com/media/cover?name=orig'], hasVideo: false,
               permalink: 'p', timestamp: '2026-09-10T00:00:00.000Z',
               article: { title: 'Four Plays', blocks: [
                 { type: 'heading', level: 1, text: 'The loop' },
                 { type: 'para', runs: [{ text: 'body text' }] }
               ] } }]
  });
  assert.match(md, /^# Four Plays$/m);
  assert.doesNotMatch(md, /# Thread by/);
  assert.match(md, /^> \[@MichLieben\]\(https:\/\/x\.com\/MichLieben\) · 2026-09-10 · \[source\]/m);
  assert.match(md, /^!\[cover\]\(https:\/\/pbs\.twimg\.com\/media\/cover\?name=orig\)$/m);
  assert.match(md, /^## The loop$/m);
  assert.match(md, /^body text$/m);
});

test('article images are not repeated after the body', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: '', images: ['https://pbs.twimg.com/media/cover?name=orig'], hasVideo: false,
               permalink: 'p', timestamp: null,
               article: { title: 'T', blocks: [{ type: 'image', url: 'https://pbs.twimg.com/media/inline?name=orig' }] } }]
  });
  assert.strictEqual((md.match(/pbs\.twimg\.com\/media\/cover/g) || []).length, 1);
  assert.strictEqual((md.match(/pbs\.twimg\.com\/media\/inline/g) || []).length, 1);
  assert.doesNotMatch(md, /!\[image\]\(https:\/\/pbs\.twimg\.com\/media\/cover/);
});

test('blank lines inside an article code block survive the blank-line collapse', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: '', images: [], hasVideo: false, permalink: 'p', timestamp: null,
               article: { title: 'T', blocks: [{ type: 'code', lang: 'javascript', text: 'first\n\n\nlast' }] } }]
  });
  assert.ok(md.includes('first\n\n\nlast'), md);
});

test('an article without a title keeps its cover and body under the fallback header', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: '', images: ['cover.jpg'], hasVideo: false, permalink: 'p', timestamp: null,
               article: { title: '', blocks: [{ type: 'para', runs: [{ text: 'body text' }] }] } }]
  });
  assert.match(md, /^# Thread by \[@a\]\(https:\/\/x\.com\/a\)$/m);
  assert.ok(md.includes('![cover](cover.jpg)'), md);
  assert.match(md, /^body text$/m);
});

test('a thread without an article keeps the original header shape', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'plain tweet', images: [], hasVideo: false, permalink: 'p', timestamp: '2026-01-02T00:00:00.000Z' }]
  });
  assert.strictEqual(md, '# Thread by [@a](https://x.com/a)\n\n> 2026-01-02 · [source](u)\n\n---\n\nplain tweet\n');
});

test('tweets without links still render and add no link line', () => {
  const md = buildMarkdown({
    author: 'a', sourceUrl: 'u',
    tweets: [{ text: 'no links here', images: [], hasVideo: false, permalink: 'p', timestamp: null }]
  });
  assert.match(md, /no links here/);
  assert.doesNotMatch(md, /🔗/);
});
