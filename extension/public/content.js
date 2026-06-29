const PENDING_SELECTION_KEY = 'idiomate_pending_selection';

function storeSelection(text) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return;
  }

  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text: trimmed,
      title: document.title || '',
      url: window.location.href,
      ts: Date.now(),
    },
  });

  chrome.runtime.sendMessage({ type: 'idiomate-selection', text: trimmed }).catch(() => {});
}

document.addEventListener('mouseup', () => {
  const text = window.getSelection()?.toString().trim();
  if (!text) {
    return;
  }

  storeSelection(text);
});
