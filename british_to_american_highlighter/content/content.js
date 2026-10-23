/**
 * British to American Spelling Highlighter
 * Content Script
 */

(function () {
  let isEnabled = true;
  let showHud = true;
  let customDict = {};
  let activeDictionary = {};
  let highlights = [];
  let currentIndex = -1;
  let isProcessing = false;
  let observer = null;

  // Elements strictly to ignore
  const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'CODE', 'PRE', 'KBD', 'SVG',
    'CANVAS', 'AUDIO', 'VIDEO', 'IFRAME', 'OBJECT'
  ]);

  // Preserve casing from British to American
  function matchCase(original, replacement) {
    if (!original || !replacement) return replacement;
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement.toLowerCase();
  }

  // Initialize extension state
  function init() {
    chrome.storage.local.get(['uk2us_enabled', 'uk2us_custom_dict', 'uk2us_show_hud'], (data) => {
      isEnabled = data.uk2us_enabled !== false;
      showHud = data.uk2us_show_hud !== false;
      customDict = data.uk2us_custom_dict || {};
      
      const baseDict = typeof UK_TO_US_DICT !== 'undefined' ? UK_TO_US_DICT : {};
      activeDictionary = Object.assign({}, baseDict, customDict);

      if (isEnabled) {
        runScanner();
        setupObserver();
      }
    });
  }

  function shouldSkipNode(node) {
    let parent = node.parentElement;
    while (parent) {
      if (IGNORED_TAGS.has(parent.tagName)) return true;
      if (parent.classList && (
        parent.classList.contains('uk2us-hud') ||
        parent.classList.contains('uk2us-toast') ||
        parent.classList.contains('uk2us-highlight')
      )) {
        return true;
      }
      if (parent.isContentEditable) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  // Scan document text nodes and wrap British words in <mark>
  function runScanner() {
    if (!isEnabled || isProcessing) return;
    if (!document.body) return;

    isProcessing = true;
    if (observer) observer.disconnect(); // prevent mutation event recursion

    try {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            if (!node.nodeValue || node.nodeValue.trim().length < 3) {
              return NodeFilter.FILTER_SKIP;
            }
            if (shouldSkipNode(node)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const textNodes = [];
      let currentNode;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode);
      }

      const wordRegex = /\b[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g;

      textNodes.forEach((node) => {
        const text = node.nodeValue;
        if (!text) return;

        let match;
        wordRegex.lastIndex = 0;
        let lastIdx = 0;
        const frags = [];
        let hasMatch = false;

        while ((match = wordRegex.exec(text)) !== null) {
          const word = match[0];
          const lower = word.toLowerCase();

          if (Object.prototype.hasOwnProperty.call(activeDictionary, lower)) {
            hasMatch = true;
            const matchStart = match.index;
            if (matchStart > lastIdx) {
              frags.push(document.createTextNode(text.substring(lastIdx, matchStart)));
            }

            const usWord = matchCase(word, activeDictionary[lower]);

            const mark = document.createElement('mark');
            mark.className = 'uk2us-highlight';
            mark.setAttribute('data-uk', word);
            mark.setAttribute('data-us', usWord);
            mark.setAttribute('title', `British: "${word}" ➔ American: "${usWord}" (Click to copy)`);
            mark.textContent = word;

            // Click to copy American replacement
            mark.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              copyToClipboard(usWord);
              showToast(`Copied "${usWord}" to clipboard!`);
            });

            frags.push(mark);
            lastIdx = matchStart + word.length;
          }
        }

        if (hasMatch) {
          if (lastIdx < text.length) {
            frags.push(document.createTextNode(text.substring(lastIdx)));
          }
          const parent = node.parentNode;
          if (parent) {
            const fragContainer = document.createDocumentFragment();
            frags.forEach(f => fragContainer.appendChild(f));
            parent.replaceChild(fragContainer, node);
          }
        }
      });

      highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));
      
      try {
        chrome.runtime.sendMessage({ type: 'UPDATE_COUNT', count: highlights.length }, () => {
          if (chrome.runtime.lastError) { /* ignore connection check */ }
        });
      } catch (e) {}

      updateHud();
    } finally {
      isProcessing = false;
      if (isEnabled) {
        setupObserver();
      }
    }
  }

  // Clipboard copy helper
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  // Floating Toast Notification
  function showToast(message) {
    let toast = document.getElementById('uk2us-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'uk2us-toast';
      toast.className = 'uk2us-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('uk2us-toast-show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('uk2us-toast-show');
    }, 2000);
  }

  // Floating Navigation HUD widget (bottom-right)
  function updateHud() {
    if (!showHud || highlights.length === 0) {
      const existing = document.getElementById('uk2us-hud');
      if (existing) existing.remove();
      return;
    }

    let hud = document.getElementById('uk2us-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'uk2us-hud';
      hud.className = 'uk2us-hud';
      document.body.appendChild(hud);
    }

    const currentDisplay = currentIndex >= 0 ? `${currentIndex + 1}/${highlights.length}` : `${highlights.length}`;

    hud.innerHTML = `
      <div class="uk2us-hud-header">
        <span class="uk2us-hud-title">🇬🇧 ➔ 🇺🇸 <strong>${currentDisplay}</strong> British word${highlights.length === 1 ? '' : 's'}</span>
        <div class="uk2us-hud-actions">
          <button id="uk2us-hud-copy-all" title="Copy list of all American replacements" class="uk2us-hud-btn">📋 Copy</button>
          <button id="uk2us-hud-prev" title="Previous word" class="uk2us-hud-btn">▲</button>
          <button id="uk2us-hud-next" title="Next word" class="uk2us-hud-btn">▼</button>
          <button id="uk2us-hud-close" title="Dismiss HUD" class="uk2us-hud-btn">✕</button>
        </div>
      </div>
    `;

    document.getElementById('uk2us-hud-prev').addEventListener('click', () => navigate(-1));
    document.getElementById('uk2us-hud-next').addEventListener('click', () => navigate(1));
    document.getElementById('uk2us-hud-close').addEventListener('click', () => {
      showHud = false;
      hud.remove();
    });
    document.getElementById('uk2us-hud-copy-all').addEventListener('click', () => {
      copyAllReplacements();
    });
  }

  // Navigate through highlights
  function navigate(direction) {
    highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));
    if (highlights.length === 0) return;

    if (currentIndex >= 0 && currentIndex < highlights.length) {
      highlights[currentIndex].classList.remove('uk2us-active-focus');
    }

    currentIndex += direction;
    if (currentIndex >= highlights.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = highlights.length - 1;

    const target = highlights[currentIndex];
    target.classList.add('uk2us-active-focus');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    updateHud();
  }

  // Copy all unique replacements found on page
  function copyAllReplacements() {
    if (highlights.length === 0) return;

    const counts = {};
    highlights.forEach(h => {
      const uk = h.getAttribute('data-uk').toLowerCase();
      const us = h.getAttribute('data-us');
      if (!counts[uk]) {
        counts[uk] = { us: us, count: 0 };
      }
      counts[uk].count++;
    });

    const lines = Object.entries(counts).map(([uk, data]) => `${uk} ➔ ${data.us} (${data.count}x)`);
    const textToCopy = `British to American Words Found:\n` + lines.join('\n');

    copyToClipboard(textToCopy);
    showToast(`Copied ${Object.keys(counts).length} replacements to clipboard!`);
  }

  // MutationObserver for dynamic websites
  let debounceTimer;
  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (isProcessing) return;
      let shouldScan = false;
      for (const m of mutations) {
        if (m.target && m.target.nodeType === Node.ELEMENT_NODE) {
          const el = m.target;
          if (el.classList && (
            el.classList.contains('uk2us-hud') ||
            el.classList.contains('uk2us-toast') ||
            el.classList.contains('uk2us-highlight')
          )) {
            continue;
          }
        }
        if (m.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }

      if (shouldScan) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          runScanner();
        }, 600);
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Cleanly restore DOM on toggle off
  function removeHighlights() {
    if (observer) observer.disconnect();
    highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));
    highlights.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        const textNode = document.createTextNode(mark.textContent);
        parent.replaceChild(textNode, mark);
        parent.normalize();
      }
    });
    highlights = [];
    currentIndex = -1;
    const hud = document.getElementById('uk2us-hud');
    if (hud) hud.remove();
    try {
      chrome.runtime.sendMessage({ type: 'UPDATE_COUNT', count: 0 }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    } catch (e) {}
  }

  // Communication with extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_DATA') {
      highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));
      const freq = {};
      highlights.forEach((h, index) => {
        const uk = h.getAttribute('data-uk');
        const us = h.getAttribute('data-us');
        const key = uk.toLowerCase();
        if (!freq[key]) {
          freq[key] = { uk, us, count: 0, indices: [] };
        }
        freq[key].count++;
        freq[key].indices.push(index);
      });

      sendResponse({
        isEnabled,
        totalCount: highlights.length,
        words: Object.values(freq)
      });
      return true;
    }

    if (request.action === 'TOGGLE_ENABLED') {
      isEnabled = request.enabled;
      chrome.storage.local.set({ uk2us_enabled: isEnabled });
      if (isEnabled) {
        runScanner();
      } else {
        removeHighlights();
      }
      sendResponse({ status: 'ok', isEnabled });
      return true;
    }

    if (request.action === 'SCROLL_TO_WORD_INDEX') {
      highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));
      if (highlights[request.index]) {
        if (currentIndex >= 0 && currentIndex < highlights.length) {
          highlights[currentIndex].classList.remove('uk2us-active-focus');
        }
        currentIndex = request.index;
        const target = highlights[currentIndex];
        target.classList.add('uk2us-active-focus');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updateHud();
        sendResponse({ status: 'ok' });
      }
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
