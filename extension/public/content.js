const PENDING_SELECTION_KEY = 'idiomate_pending_selection';

function storeSelection(text) {
  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text,
      ts: Date.now(),
    },
  });

  chrome.runtime.sendMessage({ type: 'idiomate-selection', text }).catch(() => {});
}

document.addEventListener('mouseup', () => {
  const text = window.getSelection()?.toString().trim();
  if (!text) {
    return;
  }

  storeSelection(text);
});
