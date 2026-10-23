document.addEventListener('DOMContentLoaded', () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const totalCountEl = document.getElementById('total-count');
  const wordListEl = document.getElementById('word-list');
  const copySummaryBtn = document.getElementById('copy-summary-btn');
  const addCustomBtn = document.getElementById('add-custom-btn');
  const customUkInput = document.getElementById('custom-uk');
  const customUsInput = document.getElementById('custom-us');

  let currentWords = [];

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].id) {
      wordListEl.innerHTML = '<div class="empty-state">No active browser tab detected.</div>';
      return;
    }
    const tabId = tabs[0].id;
    const tabUrl = tabs[0].url || '';

    if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('about:')) {
      totalCountEl.textContent = '0';
      wordListEl.innerHTML = '<div class="empty-state">Extensions cannot run on internal browser pages. Navigate to a regular website (like bbc.com or a news site).</div>';
      return;
    }

    chrome.tabs.sendMessage(tabId, { action: 'GET_PAGE_DATA' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        totalCountEl.textContent = '0';
        wordListEl.innerHTML = '<div class="empty-state">Reload this page once to activate highlighter.</div>';
        return;
      }

      toggleEnabled.checked = response.isEnabled;
      totalCountEl.textContent = response.totalCount;
      currentWords = response.words;

      if (response.words.length === 0) {
        wordListEl.innerHTML = '<div class="empty-state">No British spellings detected on this page.</div>';
        return;
      }

      wordListEl.innerHTML = '';
      response.words.forEach(item => {
        const row = document.createElement('div');
        row.className = 'word-item';
        row.innerHTML = `
          <div class="word-pair">
            <span class="uk-term">${item.uk}</span>
            <span>➔</span>
            <span class="us-term">${item.us}</span>
            <small style="color:#64748b">(${item.count}x)</small>
          </div>
          <button class="jump-btn" data-index="${item.indices[0]}">Jump</button>
        `;
        wordListEl.appendChild(row);
      });

      document.querySelectorAll('.jump-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.getAttribute('data-index'), 10);
          chrome.tabs.sendMessage(tabId, { action: 'SCROLL_TO_WORD_INDEX', index: idx });
        });
      });
    });

    toggleEnabled.addEventListener('change', () => {
      chrome.tabs.sendMessage(tabId, { action: 'TOGGLE_ENABLED', enabled: toggleEnabled.checked }, (res) => {
        if (res && res.isEnabled) {
          setTimeout(() => location.reload(), 150);
        } else {
          totalCountEl.textContent = '0';
          wordListEl.innerHTML = '<div class="empty-state">Highlighter paused.</div>';
        }
      });
    });

    copySummaryBtn.addEventListener('click', () => {
      if (!currentWords || currentWords.length === 0) return;
      const lines = currentWords.map(w => `${w.uk} ➔ ${w.us} (${w.count}x)`);
      const text = `British to American Words Found:\n` + lines.join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const originalText = copySummaryBtn.textContent;
        copySummaryBtn.textContent = '✓ Copied to Clipboard!';
        setTimeout(() => copySummaryBtn.textContent = originalText, 2000);
      });
    });

    addCustomBtn.addEventListener('click', () => {
      const uk = customUkInput.value.trim().toLowerCase();
      const us = customUsInput.value.trim().toLowerCase();
      if (!uk || !us) return;

      chrome.storage.local.get(['uk2us_custom_dict'], (data) => {
        const dict = data.uk2us_custom_dict || {};
        dict[uk] = us;
        chrome.storage.local.set({ uk2us_custom_dict: dict }, () => {
          customUkInput.value = '';
          customUsInput.value = '';
          addCustomBtn.textContent = '✓ Added';
          setTimeout(() => addCustomBtn.textContent = 'Add', 1500);
          // Trigger re-scan on active tab
          chrome.tabs.sendMessage(tabId, { action: 'TOGGLE_ENABLED', enabled: true });
        });
      });
    });
  });
});
