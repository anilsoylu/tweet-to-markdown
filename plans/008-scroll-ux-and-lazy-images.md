# Plan 008: Collection speed, scroll restoration, lazy article images

## Context

`scrapeThread` scrolls the page to defeat virtualization. On a long Article this took about
21 seconds — the reference article is 21,906 px against an 872 px viewport, so roughly 30
passes at a fixed 700 ms settle each — and the page visibly scrolled behind a 60%-opacity
overlay the whole time. It then called `scrollTo(0, 0)`, dropping the reader at the top of a
page they were halfway through.

## Lazy images

At first paint an Article contains zero `img` elements. The image slots are empty
`section > a` boxes with real layout height, and X mounts each image only when it scrolls
into view. Measured on the reference article: 0 of 11 images without scrolling, 11 after one
pass to the bottom.

The loop caches the first parse of a tweet and skips it on later passes, so the Article was
parsed on pass 1 with no images mounted and never re-parsed. The images were only ever
captured when the user had already scrolled through the article themselves before pressing
the button.

## Changes

1. The fixed 700 ms settle became a `MutationObserver` quiet period — 150 ms of no mutations
   resolves the wait, 700 ms remains the hard cap.
2. `window.scrollY` is captured before the loop and restored in a `finally`, so it survives
   the error paths too.
3. After the loop, every tweet still in the DOM is re-parsed and overwrites its cached entry,
   keeping its original `order`. Tweets virtualization has unmounted keep their earlier parse.
   This is what recovers the article images.
4. `scrapeThread` takes an `onProgress` callback receiving scroll completion as a percentage;
   the panel shows it as its subtitle. The overlay becomes near-opaque while collecting.

## Rejected: reading the URLs from React

The image URLs are reachable without scrolling, on the placeholder node's React props:
`__reactProps$<random>` → `children.props.blockProps.allArticleImages`, a 10-entry array of
`pbs.twimg.com/media/…` URLs present on all 10 slots, with `blockProps.media[k].media_id`
matching the slot's own `href` so each placeholder maps to its image exactly.

Not used. It is React's private internal state rather than the DOM, the key suffix is random
and the shape can change on any X deploy, and reaching it at all requires a `world: "MAIN"`
content script — the mechanism already declined in plan 007's research. The only pure-DOM
handle on an unmounted slot is its `href`, which carries a numeric media id that cannot be
turned into a `pbs.twimg.com` URL.

## Verification

`node --test` covers the parsing and serialization only; the scroll loop, the observer and
the overlay have no unit-test seam in this repo and were verified in the browser against the
reference article, from a freshly loaded page each time.

| | adaptive | fixed 700 ms |
|---|---|---|
| article, 27 passes | 4,333 ms | 17,561 ms |
| normal tweet | 814 ms | 1,406 ms |

The markdown is byte-identical between the two in both cases. Scroll position returned to its
starting value in every run. From a cold page the article yielded 1 cover and 10 inline images,
matching the 11 `tweetPhoto` nodes in the DOM.

`tweetPhoto` count stayed at 11 at every sample from the top of the page to the bottom, so X
does not unmount article photos when they leave the viewport and the re-parse can run at the
foot of the descent rather than after scrolling back.

## Known gap

X occasionally serves a render of the page with no `img` elements at all, avatars included, and
in that state no amount of scrolling mounts them. The text extraction is unaffected but every
image is silently missing. Observed once in four loads. No guard exists for it.
