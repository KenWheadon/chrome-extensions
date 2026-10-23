/**
 * British to American Spelling Highlighter
 * Content Script (D2L Editor, Nested Shadow DOM & Iframe Compatible)
 */

(function () {
  if (window.__UK2US_INITIALIZED__) return;
  window.__UK2US_INITIALIZED__ = true;

  let isEnabled = true;
  let showHud = true;
  let customDict = {};
  let activeDictionary = {};
  let highlights = [];
  let currentIndex = -1;
  let isProcessing = false;

  const activeObservers = new Set();
  const observedRoots = new WeakSet();
  const styledDocuments = new WeakSet();
  const inIframe = window !== window.top;

  // Strict list of tags to ignore. NOTE: contenteditable is now allowed!
  const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'CODE', 'PRE', 'KBD', 'SVG',
    'CANVAS', 'AUDIO', 'VIDEO', 'OBJECT', 'EMBED'
  ]);

  const HIGHLIGHT_CSS = `
    mark.uk2us-highlight {
      background-color: #fef08a !important;
      color: #1e293b !important;
      border-bottom: 2px solid #f59e0b !important;
      border-radius: 3px !important;
      padding: 1px 3px !important;
      margin: 0 1px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      display: inline !important;
      text-decoration: none !important;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
    }
    mark.uk2us-highlight:hover {
      background-color: #fde047 !important;
      border-bottom-color: #d97706 !important;
    }
    mark.uk2us-highlight.uk2us-active-focus {
      background-color: #fed7aa !important;
      outline: 2px solid #ea580c !important;
    }
  `;

  function matchCase(original, replacement) {
    if (!original || !replacement) return replacement;
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement.toLowerCase();
  }

  function init() {
    chrome.storage.local.get(['uk2us_enabled', 'uk2us_custom_dict', 'uk2us_show_hud'], (data) => {
      isEnabled = data.uk2us_enabled !== false;
      showHud = data.uk2us_show_hud !== false;
      customDict = data.uk2us_custom_dict || {};

      const baseDict = typeof UK_TO_US_DICT !== 'undefined' ? UK_TO_US_DICT : {};
      activeDictionary = Object.assign({}, baseDict, customDict);

      if (isEnabled) {
        startScannerAndObservers();
      }
    });
  }

  function ensureStylesInDocument(doc) {
    if (!doc || styledDocuments.has(doc)) return;
    styledDocuments.add(doc);
    try {
      const style = doc.createElement('style');
      style.textContent = HIGHLIGHT_CSS;
      (doc.head || doc.body || doc.documentElement).appendChild(style);
    } catch (e) { }
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
      parent = parent.parentElement;
    }
    return false;
  }

  function isNodeInEditable(node) {
    let p = node.parentElement;
    while (p) {
      if (p.isContentEditable) return true;
      p = p.parentElement;
    }
    return false;
  }

  // Recursively inspect light DOM, shadow DOM, and embedded D2L / TinyMCE iframes
  function collectScanRoots(root, list) {
    if (!root) return;
    list.push(root);

    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let el;
      while ((el = walker.nextNode())) {
        // Traverse D2L custom web component shadow roots
        if (el.shadowRoot && !observedRoots.has(el.shadowRoot)) {
          observeRoot(el.shadowRoot);
          collectScanRoots(el.shadowRoot, list);
        }

        // Traverse D2L / TinyMCE editor iframes
        if (el.tagName === 'IFRAME') {
          try {
            if (el.contentDocument && el.contentDocument.body) {
              ensureStylesInDocument(el.contentDocument);
              if (!el.contentDocument.__uk2us_scanned__) {
                el.contentDocument.__uk2us_scanned__ = true;
                observeRoot(el.contentDocument.body);
                collectScanRoots(el.contentDocument.body, list);
              }
            }
          } catch (e) { }
        }
      }
    } catch (e) { }
  }

  function runScanner() {
    if (!isEnabled || isProcessing) return;
    const startRoot = document.body || document.documentElement;
    if (!startRoot) return;

    isProcessing = true;
    activeObservers.forEach((obs) => obs.takeRecords());

    try {
      const roots = [];
      collectScanRoots(startRoot, roots);

      const wordRegex = /\b[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g;

      roots.forEach((root) => {
        const textNodes = [];
        try {
          const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: function (node) {
                if (!node.nodeValue || node.nodeValue.trim().length < 3) return NodeFilter.FILTER_SKIP;
                if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          let currentNode;
          while ((currentNode = walker.nextNode())) {
            textNodes.push(currentNode);
          }
        } catch (e) {
          return;
        }

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
              const inEditor = isNodeInEditable(node);

              const mark = document.createElement('mark');
              mark.className = 'uk2us-highlight';
              mark.setAttribute('data-uk', word);
              mark.setAttribute('data-us', usWord);
              mark.setAttribute(
                'title',
                inEditor
                  ? `British: "${word}" ➔ Click to replace with "${usWord}"`
                  : `British: "${word}" ➔ American: "${usWord}" (Click to copy)`
              );
              mark.textContent = word;

              // Click handler: Replaces directly in D2L editor or copies to clipboard
              mark.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                copyToClipboard(usWord);

                if (isNodeInEditable(mark)) {
                  const replacementTextNode = document.createTextNode(usWord);
                  const parent = mark.parentNode;
                  if (parent) {
                    parent.replaceChild(replacementTextNode, mark);
                    parent.normalize();
                    // Dispatch input event so D2L editor registers the modification
                    parent.dispatchEvent(new Event('input', { bubbles: true }));
                    parent.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  showToast(`Replaced with "${usWord}"!`);
                } else {
                  showToast(`Copied "${usWord}" to clipboard!`);
                }
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
              frags.forEach((f) => fragContainer.appendChild(f));
              parent.replaceChild(fragContainer, node);
            }
          }
        });
      });

      highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));

      try {
        chrome.runtime.sendMessage({ type: 'UPDATE_COUNT', count: highlights.length }, () => {
          if (chrome.runtime.lastError) { }
        });
      } catch (e) { }

      updateHud();
    } finally {
      activeObservers.forEach((obs) => obs.takeRecords());
      isProcessing = false;
    }
  }

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

  function updateHud() {
    if (!showHud || highlights.length === 0) {
      const existing = document.getElementById('uk2us-hud');
      if (existing) existing.remove();
      return;
    }

    if (inIframe && (window.innerWidth < 320 || window.innerHeight < 220)) {
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
        <span class="uk2us-hud-title">🇬🇧 ➔ 🇺🇸 <strong>${currentDisplay}</strong></span>
        <div class="uk2us-hud-actions">
          <button id="uk2us-hud-copy-all" title="Copy list of all American replacements" class="uk2us-hud-btn">📋</button>
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

  let debounceTimer = null;
  function scheduleScan(delay = 400) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runScanner();
    }, delay);
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);

    const observer = new MutationObserver((mutations) => {
      if (isProcessing) return;

      let shouldTrigger = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];

        if (m.type === 'characterData') {
          const parent = m.target ? m.target.parentElement : null;
          if (!parent || !parent.classList || !parent.classList.contains('uk2us-highlight')) {
            shouldTrigger = true;
            break;
          }
        }

        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const added = m.addedNodes[j];
            if (added.nodeType === Node.ELEMENT_NODE) {
              if (added.classList && (
                added.classList.contains('uk2us-hud') ||
                added.classList.contains('uk2us-toast') ||
                added.classList.contains('uk2us-highlight')
              )) {
                continue;
              }
              if (added.shadowRoot) {
                observeRoot(added.shadowRoot);
              }
              shouldTrigger = true;
              break;
            } else if (added.nodeType === Node.TEXT_NODE) {
              const p = added.parentElement;
              if (!p || !p.classList || !p.classList.contains('uk2us-highlight')) {
                shouldTrigger = true;
                break;
              }
            }
          }
          if (shouldTrigger) break;
        }
      }

      if (shouldTrigger) {
        scheduleScan(400);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });

    activeObservers.add(observer);
  }

  function startScannerAndObservers() {
    const root = document.body || document.documentElement;
    if (root) {
      observeRoot(root);
    }
    runScanner();

    window.addEventListener('popstate', () => scheduleScan(300));
    window.addEventListener('hashchange', () => scheduleScan(300));

    // Watch for dynamically appearing D2L editors
    setInterval(() => {
      if (!isEnabled || isProcessing) return;
      const editor = document.querySelector('d2l-activity-text-editor, d2l-htmleditor, [contenteditable="true"]');
      if (editor) {
        runScanner();
      }
    }, 2500);
  }

  function removeHighlights() {
    activeObservers.forEach((obs) => obs.disconnect());
    activeObservers.clear();

    highlights = Array.from(document.querySelectorAll('mark.uk2us-highlight'));
    highlights.forEach((mark) => {
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
        if (chrome.runtime.lastError) { }
      });
    } catch (e) { }
  }

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
        words: Object.values(freq),
        inIframe: inIframe
      });
      return true;
    }

    if (request.action === 'TOGGLE_ENABLED') {
      isEnabled = request.enabled;
      chrome.storage.local.set({ uk2us_enabled: isEnabled });
      if (isEnabled) {
        startScannerAndObservers();
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