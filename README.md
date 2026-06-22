# Tweet to Markdown

A Chrome extension (Manifest V3) that converts an X (Twitter) tweet and the
author's self-reply thread into a single, clean Markdown document — copy it to
your clipboard or download it as a `.md` file.

## What it does

On any tweet page (`x.com/<user>/status/<id>`), a **"📋 Markdown"** button is
injected into the focal tweet's action row. Clicking it scrolls the page to
gather the author's contiguous self-reply chain, then opens an in-page preview
panel containing the generated Markdown with **Copy** and **Download .md**
buttons. The output includes the original tweet and the author's self-replies in
order, embeds images, and links any videos.

## Privacy: 100% client-side

- **No backend.** Nothing is sent to any server.
- **No API.** It reads the page DOM you are already viewing — no X API keys, no
  authentication.
- **No tracking.** No analytics, no telemetry, no third-party requests.
- **No special permissions.** The manifest requests zero permissions: clipboard
  writes happen under your click gesture and downloads use an anchor element.

Everything runs locally in your browser tab.

## Install (load unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this project's root folder.
5. The extension loads with no manifest errors.

## Usage

1. Open any X thread where the author replied to themselves:
   `https://x.com/<someone>/status/<id>`.
2. Click the **"📋 Markdown"** button in the focal tweet's action row.
3. The page scrolls automatically, then a panel opens with the Markdown.
4. Click **Kopyala** (Copy) to copy to the clipboard, or **İndir .md**
   (Download .md) to save a `thread.md` file. **Kapat** closes the panel.

## Known limitations

- **Very long, virtualized threads** may not be captured fully; X virtualizes
  the timeline, so extremely long threads can need a higher `maxScrolls`
  (currently a fixed default in `src/scraper.js`).
- **Interleaved promoted/ad tweets** or **ancestor tweets** (when the focal
  tweet is itself a reply to someone else) can confuse the author-thread
  boundary heuristic, which stops at the first non-author tweet below the author
  run.
- **Videos are linked, not downloaded** — the Markdown contains a link to the
  tweet permalink, not the video file.
- **Selectors break when X changes its UI.** All X-specific selectors are
  centralized in `src/selectors.js` — that is the single place to fix when
  scraping or button placement breaks.

## Maintenance

The brittle, X-dependent surface is **`src/selectors.js`**. If the button stops
appearing or scraping breaks after an X update, fix the selectors there first.
Please keep all X-specific selectors in that one file.

## X Terms of Service note

DOM scraping of X is a gray area with respect to X's Terms of Service. This is a
personal / open-source tool intended for individual use on content you can
already see. Use it responsibly and at your own discretion.

## License

MIT — see [LICENSE](LICENSE).
