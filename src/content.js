(function () {
  'use strict';

  function injectIntoFirstTweet() {
    if (!/^\/[^/]+\/status\/\d+/.test(location.pathname)) return; // tweet pages only
    const article = document.querySelector(TTM.SELECTORS.tweet);
    if (!article) return;
    const bar = article.querySelector(TTM.SELECTORS.actionBar);
    if (!bar || bar.querySelector('.ttm-convert-btn')) return; // already injected
    bar.appendChild(TTM.createButton(onConvertClick));
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
