let isEnabled = false;

function updateVideos() {
  // Target YouTube's player container — the most reliable positioning reference
  const container = document.querySelector('div#player-container') ||
                    document.querySelector('ytd-player#ytd-player');
  const video = document.querySelector('video');

  if (!container || !video) return;

  let overlay = container.querySelector('.frog-video-overlay');

  if (isEnabled) {
    // Hide the video visually but keep it playing audio
    video.style.opacity = '0';

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'frog-video-overlay';

      // Background layer — covers the entire container
      const bg = document.createElement('div');
      Object.assign(bg.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#1c1c1e'
      });

      // Centered content — pinned to exact center with transform
      const content = document.createElement('div');
      const frogEmoji = document.createElement('div');
      frogEmoji.textContent = '🐸';
      Object.assign(frogEmoji.style, {
        fontSize: '72px',
        marginBottom: '10px',
        filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.3))',
        lineHeight: '1',
        cursor: 'pointer'
      });
      frogEmoji.addEventListener('click', () => {
        const vid = document.querySelector('video');
        if (!vid) return;
        if (vid.paused) {
          vid.play();
        } else {
          vid.pause();
        }
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
        lineHeight: '1'
      });

      // Kill button — skull + text pinned to the bottom
      const killBtn = document.createElement('div');
      killBtn.style.cursor = 'pointer';
      killBtn.style.position = 'absolute';
      killBtn.style.bottom = '24px';
      killBtn.style.left = '50%';
      killBtn.style.transform = 'translateX(-50%)';
      killBtn.style.textAlign = 'center';
      killBtn.style.opacity = '0.6';
      killBtn.style.transition = 'opacity 0.2s';
      killBtn.addEventListener('mouseenter', () => { killBtn.style.opacity = '1'; });
      killBtn.addEventListener('mouseleave', () => { killBtn.style.opacity = '0.6'; });

      const skullEmoji = document.createElement('div');
      skullEmoji.textContent = '💀';
      skullEmoji.style.fontSize = '28px';
      skullEmoji.style.lineHeight = '1';
      skullEmoji.style.marginBottom = '4px';

      const killLabel = document.createElement('div');
      killLabel.textContent = 'kill the frog';
      killLabel.style.fontSize = '11px';
      killLabel.style.fontFamily = 'sans-serif';
      killLabel.style.color = '#999';
      killLabel.style.letterSpacing = '0.5px';
      killLabel.style.lineHeight = '1';

      killBtn.appendChild(skullEmoji);
      killBtn.appendChild(killLabel);

      killBtn.addEventListener('click', () => {
        chrome.storage.local.set({ videoBlockEnabled: false });
      });

      content.appendChild(frogEmoji);
      content.appendChild(label);


      Object.assign(content.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center'
      });

      Object.assign(overlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        zIndex: '2147483647',
        pointerEvents: 'auto'
      });

      overlay.appendChild(bg);
      overlay.appendChild(content);
      overlay.appendChild(killBtn);
      container.appendChild(overlay);
    }
  } else {
    // Restore video visibility and remove the frog
    video.style.opacity = '1';
    if (overlay) overlay.remove();
  }
}


// Check initial state on page load
chrome.storage.local.get('videoBlockEnabled', (data) => {
  isEnabled = !!data.videoBlockEnabled;
  updateVideos();
});

// Watch for toggle updates from the popup menu
chrome.storage.onChanged.addListener((changes) => {
  if (changes.videoBlockEnabled) {
    isEnabled = changes.videoBlockEnabled.newValue;
    updateVideos();
  }
});

// Periodically check for dynamically loaded/changed video structures
setInterval(updateVideos, 1000);