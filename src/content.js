(function () {
  'use strict';

  function focalArticle() {
    const id = TTM.pageStatusId();
    const arts = document.querySelectorAll(TTM.SELECTORS.tweet);
    if (id) {
      for (const art of arts) {
        const time = art.querySelector(TTM.SELECTORS.time);
        const anchor = time && time.closest('a');
        const link = TTM.parsePermalink(anchor && anchor.getAttribute('href'));
        if (link && link.id === id) return art;
      }
    }
    return arts[0] || null; // fallback: first tweet
  }

  function injectIntoFirstTweet() {
    if (!/^\/[^/]+\/status\/\d+/.test(location.pathname)) return; // tweet pages only
    const article = focalArticle();
    if (!article) return;
    const bar = article.querySelector(TTM.SELECTORS.actionBar);
    if (!bar || bar.querySelector('.ttm-convert-btn')) return; // already injected
    const sample = bar.firstElementChild;   // X's reply cell — mirror its layout classes
    const cell = document.createElement('div');
    if (sample) cell.className = sample.className;
    cell.style.display = 'flex';
    cell.style.alignItems = 'center';
    cell.appendChild(TTM.createButton(onConvertClick));
    const share = bar.lastElementChild;     // X's share button wrapper is last
    if (share && share !== sample) bar.insertBefore(cell, share);
    else bar.appendChild(cell);
  }

  async function onConvertClick() {
    TTM.showPanel('Thread toplanıyor… (sayfa otomatik kayacak, lütfen bekleyin)');
    try {
      const thread = await TTM.scrapeThread();
      if (!thread.tweets.length) {
        TTM.showPanel('Tweet bulunamadı. Bir tweet sayfasında olduğundan emin ol.');
        return;
      }
      TTM.showPanel(TTM.buildMarkdown(thread));
    } catch (err) {
      TTM.showPanel('Hata: ' + (err && err.message ? err.message : String(err)) +
        '\n\nBir tweet sayfasında (x.com/<kullanıcı>/status/<id>) olduğundan emin ol.');
    }
  }

  // Debounced observer: X is a SPA, the tweet re-renders on navigation.
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(injectIntoFirstTweet, 400); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
