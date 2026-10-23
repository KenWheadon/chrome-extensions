document.addEventListener('DOMContentLoaded', () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const totalCountEl = document.getElementById('total-count');
  const wordListEl = document.getElementById('word-list');
  const copySummaryBtn = document.getElementById('copy-summary-btn');
  const addCustomBtn = document.getElementById('add-custom-btn');
  const customUkInput = document.getElementById('custom-uk');
  const customUsInput = document.getElementById('custom-us');

  let aggregatedWords = {};
  let totalHighlights = 0;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].id) {
      wordListEl.innerHTML = '<div class="empty-state">No active browser tab detected.</div>';
      return;
    }
    const tabId = tabs[0].id;
    const tabUrl = tabs[0].url || '';

    if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('about:')) {
      totalCountEl.textContent = '0';
      wordListEl.innerHTML = '<div class="empty-state">Extensions cannot run on internal browser pages. Navigate to a regular website.</div>';
      return;
    }

    // Collect highlights across all frames and shadow roots
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      func: () => {
        const marks = [];
        function collect(root) {
          if (!root) return;
          try {
            const found = root.querySelectorAll('mark.uk2us-highlight');
            found.forEach(m => marks.push(m));
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
            let el;
            while ((el = walker.nextNode())) {
              if (el.shadowRoot) collect(el.shadowRoot);
            }
          } catch (e) {}
        }
        collect(document.body || document.documentElement);

        const f = {};
        marks.forEach((mark) => {
          const uk = mark.getAttribute('data-uk') || mark.textContent;
          const us = mark.getAttribute('data-us') || '';
          const key = uk.toLowerCase();
          if (!f[key]) f[key] = { uk: uk, us: us, count: 0 };
          f[key].count++;
        });
        return { count: marks.length, words: f };
      }
    }, (results) => {
      if (chrome.runtime.lastError || !results) {
        wordListEl.innerHTML = '<div class="empty-state">Reload this page once to activate highlighter.</div>';
        return;
      }
      
      results.forEach(res => {
        if (res.result) {
          totalHighlights += res.result.count;
          const w = res.result.words;
          for (let key in w) {
            if (!aggregatedWords[key]) {
              aggregatedWords[key] = w[key];
            } else {
              aggregatedWords[key].count += w[key].count;
            }
          }
        }
      });
      
      totalCountEl.textContent = totalHighlights;
      
      const finalWords = Object.values(aggregatedWords);
      if (finalWords.length === 0) {
        wordListEl.innerHTML = '<div class="empty-state">No British spellings detected on this page.</div>';
      } else {
        wordListEl.innerHTML = '';
        finalWords.forEach(item => {
          const row = document.createElement('div');
          row.className = 'word-item';
          row.innerHTML = `
            <div class="word-pair">
              <span class="uk-term">${item.uk}</span>
              <span>➔</span>
              <span class="us-term">${item.us}</span>
              <small style="color:#64748b">(${item.count}x)</small>
            </div>
          `;
          wordListEl.appendChild(row);
        });
      }
    });

    chrome.storage.local.get(['uk2us_enabled'], (data) => {
      toggleEnabled.checked = data.uk2us_enabled !== false;
    });

    toggleEnabled.addEventListener('change', () => {
      const isEnabled = toggleEnabled.checked;
      chrome.storage.local.set({ uk2us_enabled: isEnabled }, () => {
        chrome.tabs.sendMessage(tabId, { action: 'TOGGLE_ENABLED', enabled: isEnabled });
        setTimeout(() => location.reload(), 150);
      });
    });

    copySummaryBtn.addEventListener('click', () => {
      const finalWords = Object.values(aggregatedWords);
      if (finalWords.length === 0) return;
      const lines = finalWords.map(w => `${w.uk} ➔ ${w.us} (${w.count}x)`);
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
          
          chrome.tabs.sendMessage(tabId, { action: 'TOGGLE_ENABLED', enabled: true });
        });
      });
    });
  });
});
