let isEnabled = false;

// ─── Inject the frog toggle button into YouTube's player controls bar ───────

function injectFrogButton() {
  // Only inject once
  if (document.getElementById('frog-toggle-btn')) return;

  // YouTube's right-side controls panel inside the player
  const rightControls =
    document.querySelector('.ytp-right-controls') ||
    document.querySelector('.ytp-chrome-controls');

  if (!rightControls) return;

  const btn = document.createElement('button');
  btn.id = 'frog-toggle-btn';
  btn.title = 'Froggy Focus – toggle video block';
  btn.textContent = '🐸';

  Object.assign(btn.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: '1',
    padding: '0 6px',
    verticalAlign: 'middle',
    opacity: isEnabled ? '1' : '0.45',
    transition: 'opacity 0.2s, transform 0.15s',
    // Sit alongside native YouTube controls without breaking layout
    display: 'inline-flex',
    alignItems: 'center',
    height: '100%',
    filter: isEnabled ? 'none' : 'grayscale(80%)',
  });

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.2)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
  });

  btn.addEventListener('click', () => {
    const next = !isEnabled;
    chrome.storage.local.set({ videoBlockEnabled: next });
  });

  // Insert as the first child so it appears on the far-left of right-controls
  rightControls.insertBefore(btn, rightControls.firstChild);
}

function updateFrogButton() {
  const btn = document.getElementById('frog-toggle-btn');
  if (!btn) return;
  btn.style.opacity = isEnabled ? '1' : '0.45';
  btn.style.filter = isEnabled ? 'none' : 'grayscale(80%)';
  btn.title = isEnabled
    ? 'Froggy Focus – ON (click to disable)'
    : 'Froggy Focus – OFF (click to enable)';
}

// ─── Frog overlay (covers the video when enabled) ────────────────────────────

function updateVideos() {
  // Use .html5-video-player — this is YouTube's actual stacking-context root.
  // All YouTube UI layers (controls ~z51, popups ~z63+) live inside it, so
  // our overlay z-index is relative to those layers rather than fighting them.
  const container =
    document.querySelector('.html5-video-player') ||
    document.querySelector('div#player-container') ||
    document.querySelector('ytd-player#ytd-player');
  const video = document.querySelector('video');

  // Always try to inject the button into the controls bar
  injectFrogButton();

  if (!container || !video) return;

  let overlay = container.querySelector('.frog-video-overlay');

  if (isEnabled) {
    // Hide the video visually but keep it playing audio
    video.style.opacity = '0';

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'frog-video-overlay';

      // Background layer
      const bg = document.createElement('div');
      Object.assign(bg.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#1c1c1e',
      });

      // Centred content
      const content = document.createElement('div');

      const frogEmoji = document.createElement('div');
      frogEmoji.textContent = '🐸';
      Object.assign(frogEmoji.style, {
        fontSize: '72px',
        marginBottom: '10px',
        filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.3))',
        lineHeight: '1',
        cursor: 'pointer',
      });
      frogEmoji.title = 'Click to play/pause';
      frogEmoji.addEventListener('click', () => {
        const vid = document.querySelector('video');
        if (!vid) return;
        if (vid.paused) vid.play();
        else vid.pause();
      });

      const label = document.createElement('div');
      label.textContent = 'back to work!';
      Object.assign(label.style, {
        fontSize: '24px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
        fontWeight: 'bold',
        textTransform: 'lowercase',
        letterSpacing: '1px',
        lineHeight: '1',
      });

      Object.assign(content.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      });

      content.appendChild(frogEmoji);
      content.appendChild(label);

      Object.assign(overlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        // Leave the bottom ~48 px free so YouTube's native controls bar
        // (which contains our injected 🐸 button) stays fully accessible.
        height: 'calc(100% - 48px)',
        // z-index 50: above the video element (~0) but below YouTube's
        // controls bar (~51) and all popup panels (~63+), so settings /
        // quality / caption menus render on top of our overlay.
        zIndex: '50',
        pointerEvents: 'auto',
      });

      overlay.appendChild(bg);
      overlay.appendChild(content);
      container.appendChild(overlay);
    }
  } else {
    // Restore video visibility and remove the frog overlay
    video.style.opacity = '1';
    if (overlay) overlay.remove();
  }

  updateFrogButton();
}

// ─── Initialise ──────────────────────────────────────────────────────────────

chrome.storage.local.get('videoBlockEnabled', (data) => {
  isEnabled = !!data.videoBlockEnabled;
  updateVideos();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.videoBlockEnabled) {
    isEnabled = changes.videoBlockEnabled.newValue;
    updateVideos();
  }
});

// Periodically re-check for dynamically loaded video/player structures
setInterval(updateVideos, 1000);