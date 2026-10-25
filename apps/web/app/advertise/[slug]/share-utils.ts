export function shareText(draft: string): string {
  const content = draft.replace(/\s*#ad\s*/gi, ' ').trim();
  return content ? `${content} #ad` : '#ad';
}

export function safeStorageGet(key: string, getStorage: () => Pick<Storage, 'getItem'> = () => window.localStorage): string | null {
  try { return getStorage().getItem(key); } catch { return null; }
}

export function safeStorageSet(key: string, value: string, getStorage: () => Pick<Storage, 'setItem'> = () => window.localStorage): boolean {
  try { getStorage().setItem(key, value); return true; } catch { return false; }
}
