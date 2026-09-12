# Plan 007: X Article (longform) support

## Context

On an X Article page the extension produced a header plus bare `![image](…)` lines and no
text. `parseTweet` read text only from `div[data-testid="tweetText"]`, which an Article does
not have, while `SELECTORS.photo` still matched the Article's inline images — so the images
survived and the entire body was dropped.

## Reference: Article DOM

Kept because it is expensive to rediscover and invisible in the diff. Measured on
`x.com/MichLieben/status/2098102907308777783`.

An Article renders inside the normal `article[data-testid="tweet"]`.

| testid | role |
|---|---|
| `twitterArticleReadView` | Article container — its presence is the detection |
| `twitter-article-title` | title |
| `longformRichTextComponent` | its `firstElementChild` is the block container; that container's direct children are the blocks |

Direct-child block kinds:

| class | count | meaning |
|---|---|---|
| `longform-unstyled` | 86 | paragraph |
| `css-146c3p1 r-bcqeeo …` | 18 | heading — contains an `h1` (12) or `h2` (6) |
| `public-DraftStyleDefault-ol` | 4 | ordered list, `li` children |
| `public-DraftStyleDefault-ul` | 1 | unordered list |
| `""` | 27 | 10 images, 2 code blocks, 1 table, 14 spacers |

- The cover image is a `[data-testid="tweetPhoto"] img` inside the tweet element but outside
  `longformRichTextComponent`.
- `li` nesting is a `depthN` token in the className.
- Code block: `[data-testid="markdown-code-block"]`, language from `code.className`
  (`language-javascript`), body from `pre code`. The block's own `innerText` prepends the
  language label as a line — do not use it.
- Inline emphasis carries no class names, only computed style: `fontWeight >= 700` is bold,
  headings are 800. Measured cost of `getComputedStyle` over 563 spans: 0.9 ms.
- The full body text (24,536 chars) is in the DOM at load, but the images are not: at first
  paint the article contains zero `img` elements. The slots exist as empty `section > a` ratio
  boxes with real layout height, and X mounts the images only once they scroll into view.
  Reading text needs no scrolling; collecting images does.
- Nothing inside an Article matches `SELECTORS.quotedTweet`, so `own()` does not interfere.

## Output shape

The Article title becomes the document `#`, so the body's H1 shifts to `##` and H2 to `###`
and exactly one H1 remains. The author moves into the meta line. Normal tweets are unchanged.

```markdown
# <article title>

> [@handle](https://x.com/handle) · YYYY-MM-DD · [source](…)

![cover](…)

---

<body>
```

## Implementation

`src/article.js` (new) does the DOM walk and owns the only `getComputedStyle` call. It emits
plain blocks — `para`, `heading`, `list`, `image`, `code`, `table` — whose inline content is an
array of `{text, bold, italic, href}` runs. A pure serializer turns blocks into markdown, and
that serializer is the tested seam: no jsdom, no DOM in tests.

Runs stay unformatted until serialization because X splits one bold phrase across several
spans; merging adjacent same-format runs is impossible once markers are in the string, and
naive wrapping yields `**loop ** runs`, which most parsers render literally.

`article.js` loads **before** `scraper.js` — `scraper.js` destructures its dependencies at load
time, so a later load would leave `extractArticle` undefined and silently produce nothing.
`toOriginalImage` moved to `selectors.js` so `article.js` can use it without depending on
`scraper.js`.

The image-block branch tests `SELECTORS.photo`, not a bare `img`: X renders emoji as `<img>`
inside prose, and a bare `img` test misclassifies any emoji-bearing paragraph.

`parseTweet` keeps only photos outside the article body, so `images` holds the cover alone and
the block walk emits the inline images in their own positions.

`buildMarkdown`'s `\n{3,}` collapse became fence-aware; blank lines inside a code block are
content.

`scrapeThread` now checks the permalink before parsing. It previously re-parsed every visible
tweet on every scroll pass, which on an Article meant re-walking thousands of nodes for nothing.

## Verification

`node --test` from the repo root. Also run against the live page: block counts must match the
page's own element census, and a normal tweet, a 4-photo tweet and a quoted tweet must produce
byte-identical output to before.

Measured on the reference article: 122 blocks (86 para, 18 heading, 10 image, 5 list, 2 code,
1 table), 1 `#` / 12 `##` / 6 `###`, 1 cover and 10 inline images with no duplication, both
fences tagged `javascript` with their internal blank lines and indentation intact, 58 bold
spans with no marker straddling whitespace. On the author's profile, 17 tweets parsed, all with
`article === null` and their photo counts unchanged.

## Known gaps

- `extractText` still does not escape markdown metacharacters. Pre-existing, more visible in
  article prose.
- `SELECTORS.quotedTweet` (`div[role="link"][tabindex]`) is loose, and `own()` uses it as an
  exclusion filter. No match inside an Article today, but a new X wrapper would silently delete
  content.
- A video tweet's poster frame renders under `tweetPhoto`, so such a tweet emits both an
  `![image]` and a `[video]` line. Pre-existing, unrelated to Articles.
