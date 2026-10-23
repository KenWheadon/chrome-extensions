// British to American Highlighter - Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_COUNT' && sender.tab && sender.tab.id) {
    const count = message.count || 0;
    if (count > 0) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: count > 999 ? '999+' : count.toString() });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#d97706' });
    } else {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: '' });
    }
    sendResponse({ status: 'ok' });
  }
  return true;
});
