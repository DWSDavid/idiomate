const UID_KEY = 'idiomate_uid';
const NAME_KEY = 'idiomate_user_name';

const memoryStore = new Map<string, string>();

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ClientIdentity {
  id: string;
  name: string;
}

function storage(): StorageLike {
  return globalThis.localStorage ?? {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    },
  };
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `idiomate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function askName(): string {
  if (globalThis.navigator?.userAgent.toLowerCase().includes('jsdom')) return 'Guest';
  if (typeof globalThis.prompt !== 'function') return 'Guest';
  return globalThis.prompt('What name should Idiomate use for you?')?.trim() || 'Guest';
}

export function getClientIdentity(): ClientIdentity {
  const store = storage();
  let id = store.getItem(UID_KEY);
  if (!id) {
    id = newId();
    store.setItem(UID_KEY, id);
  }

  let name = store.getItem(NAME_KEY);
  if (!name) {
    name = askName();
    store.setItem(NAME_KEY, name);
  }

  return { id, name };
}

export function setClientIdentity(identity: ClientIdentity) {
  const store = storage();
  store.setItem(UID_KEY, identity.id);
  store.setItem(NAME_KEY, identity.name);
}
