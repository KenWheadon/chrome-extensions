// British to American Highlighter - Service Worker
let tabCounts = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_COUNT' && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    // Since frames message independently, we aggregate counts per tab
    // We'll reset counts when a tab navigates (handled by onUpdated)
    const isTopFrame = sender.frameId === 0;
    
    if (!tabCounts[tabId]) {
      tabCounts[tabId] = { top: 0, frames: {} };
    }
    
    if (isTopFrame) {
      tabCounts[tabId].top = message.count || 0;
    } else {
      tabCounts[tabId].frames[sender.frameId] = message.count || 0;
    }
    
    // Calculate total
    let total = tabCounts[tabId].top;
    for (let f in tabCounts[tabId].frames) {
      total += tabCounts[tabId].frames[f];
    }
    
    if (total > 0) {
      chrome.action.setBadgeText({ tabId: tabId, text: total > 999 ? '999+' : total.toString() });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#d97706' });
    } else {
      chrome.action.setBadgeText({ tabId: tabId, text: '' });
    }
    
    sendResponse({ status: 'ok', total: total });
  }
  return true;
});

// Reset count logic on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabCounts[tabId] = { top: 0, frames: {} };
    chrome.action.setBadgeText({ tabId: tabId, text: '' });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabCounts[tabId];
});
