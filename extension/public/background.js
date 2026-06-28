const PENDING_SELECTION_KEY = 'idiomate_pending_selection';

function storeSelection(text) {
  if (!text?.trim()) {
    return;
  }

  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text: text.trim(),
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

  storeSelection(info.selectionText);

  if (tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});
