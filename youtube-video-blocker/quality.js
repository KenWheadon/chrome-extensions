// Runs in the page's own JS world ("world": "MAIN" in manifest.json) because
// YouTube's player API (setPlaybackQualityRange etc.) is invisible to normal
// content scripts. It is switched on/off by content.js via <html data-frog-lowq>.
(() => {
  'use strict';

  const ATTR = 'data-frog-lowq';
  // Highest -> lowest, as used by YouTube's player API.
  const RANK = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720',
                'large', 'medium', 'small', 'tiny'];

  let wasEnabled = false;
  let apiAttempts = 0;
  let uiTriedFor = null;

  const isEnabled = () => document.documentElement.hasAttribute(ATTR);
  const getPlayer = () => document.getElementById('movie_player');

  function lowestLevel(player) {
    const levels = (player.getAvailableQualityLevels?.() || [])
      .filter((l) => RANK.includes(l));
    if (!levels.length) return null;
    return levels.reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a));
  }

  function applyLowest(player) {
    const target = lowestLevel(player);
    if (!target) return; // player not ready yet
    if (player.getPlaybackQuality?.() === target) {
      apiAttempts = 0;
      return;
    }
    try {
      player.setPlaybackQualityRange?.(target, target);
      player.setPlaybackQuality?.(target);
    } catch (e) { /* ignore */ }
    apiAttempts++;
    // If the API calls are being ignored, fall back to clicking the menu.
    if (apiAttempts >= 3) uiFallback(player);
  }

  function restoreAuto(player) {
    try {
      player.setPlaybackQualityRange?.('auto', 'auto');
      player.setPlaybackQuality?.('auto');
    } catch (e) { /* ignore */ }
  }

  // Last resort: drive Settings > Quality > lowest option, with the menu hidden.
  function uiFallback(player) {
    const key = location.href;
    if (uiTriedFor === key) return;
    uiTriedFor = key;

    const btn = player.querySelector('.ytp-settings-button');
    if (!btn) return;

    const hide = document.createElement('style');
    hide.textContent = '.ytp-popup.ytp-settings-menu{opacity:0 !important}';
    document.head.appendChild(hide);
    const cleanup = () => setTimeout(() => hide.remove(), 300);

    btn.click();
    setTimeout(() => {
      const items = [...player.querySelectorAll(
        '.ytp-settings-menu .ytp-panel-menu .ytp-menuitem')];
      const qualityItem =
        items.find((i) => /\d{3,4}p/.test(i.textContent)) || items[items.length - 1];
      if (!qualityItem) { btn.click(); return cleanup(); }

      qualityItem.click();
      setTimeout(() => {
        let best = null;
        let bestRes = Infinity;
        player.querySelectorAll('.ytp-quality-menu .ytp-menuitem').forEach((o) => {
          const m = o.textContent.match(/(\d{3,4})p/);
          if (m && Number(m[1]) < bestRes) { bestRes = Number(m[1]); best = o; }
        });
        if (best) best.click(); else btn.click();
        cleanup();
      }, 250);
    }, 250);
  }

  function tick() {
    const player = getPlayer();
    if (!player) return;
    if (isEnabled()) {
      wasEnabled = true;
      if (!player.classList.contains('ad-showing')) applyLowest(player);
    } else if (wasEnabled) {
      wasEnabled = false;
      apiAttempts = 0;
      restoreAuto(player);
    }
  }

  // YouTube resets quality for every new video, so keep re-checking.
  setInterval(tick, 1000);
  document.addEventListener('yt-navigate-finish', () => { apiAttempts = 0; tick(); });
  new MutationObserver(tick).observe(document.documentElement,
    { attributes: true, attributeFilter: [ATTR] });
})();
