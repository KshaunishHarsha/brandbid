export function shareText(draft: string, trackedLinks: readonly string[] = []): string {
  const withoutTrackedLinks = trackedLinks.reduce(
    (text, link) => (link ? text.replaceAll(link, ' ') : text),
    draft,
  );
  const content = withoutTrackedLinks.replace(/\s*#ad\s*/gi, ' ').trim();
  return content ? `${content} #ad` : '#ad';
}

export function safeStorageGet(key: string, getStorage: () => Pick<Storage, 'getItem'> = () => window.localStorage): string | null {
  try { return getStorage().getItem(key); } catch { return null; }
}

export function safeStorageSet(key: string, value: string, getStorage: () => Pick<Storage, 'setItem'> = () => window.localStorage): boolean {
  try { getStorage().setItem(key, value); return true; } catch { return false; }
}
