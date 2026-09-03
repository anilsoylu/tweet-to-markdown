(function () {
  'use strict';

  const ERRORS = {
    NOT_A_TWEET_PAGE: 'Bir tweet sayfasında (x.com/<kullanıcı>/status/<id>) olduğundan emin ol.',
    FOCAL_TWEET_NOT_FOUND: 'Bu sayfadaki tweet okunamadı. Sayfayı yenileyip tekrar dene; adres eski bir kullanıcı adı içeriyorsa güncel linkle dene.'
  };

  function focalArticle() {
    const id = TTM.pageStatusId();
    const arts = document.querySelectorAll(TTM.SELECTORS.tweet);
    if (id) {
      for (const art of arts) {
        const link = TTM.tweetPermalink(art);
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
    // X colours each action glyph on the icon itself, not on the bar, and the grey
    // differs per theme — copy it from a neighbour instead of hardcoding one.
    const ref = sample && sample.querySelector('svg');
    if (ref) cell.style.color = getComputedStyle(ref).fill;
    cell.appendChild(TTM.createButton(onConvertClick));
    const share = bar.lastElementChild;     // X's share button wrapper is last
    if (share && share !== sample) bar.insertBefore(cell, share);
    else bar.appendChild(cell);
  }

  async function onConvertClick() {
    TTM.showPanel('Thread toplanıyor… (sayfa otomatik kayacak, lütfen bekleyin)');
    try {
      TTM.showPanel(TTM.buildMarkdown(await TTM.scrapeThread()));
    } catch (err) {
      const code = (err && err.message) || String(err);
      TTM.showPanel(ERRORS[code] || ('Hata: ' + code));
    }
  }

  // Debounced observer: X is a SPA, the tweet re-renders on navigation.
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(injectIntoFirstTweet, 400); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
