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

function storeSelection(text) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return;
  }

  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text: trimmed,
      title: document.title || '',
      url: normalizeUrl(window.location.href),
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
