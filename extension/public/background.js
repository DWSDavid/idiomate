const PENDING_SELECTION_KEY = 'idiomate_pending_selection';

function normalizeUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 500);
  } catch {
    return '';
  }
}

function storeSelection(text, tab) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return;
  }

  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text: trimmed,
      title: tab?.title || '',
      url: normalizeUrl(tab?.url),
      ts: Date.now(),
    },
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'send-to-idiomate',
      title: 'Send to Idiomate',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'send-to-idiomate' || !info.selectionText) {
    return;
  }

  storeSelection(info.selectionText, tab);

  if (tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});
