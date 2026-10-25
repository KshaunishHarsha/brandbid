import { describe, expect, it, vi } from 'vitest';
import { safeStorageGet, safeStorageSet, shareText } from './share-utils';

describe('share sheet helpers', () => {
  it('always appends one clear #ad disclosure, even if the draft already has one', () => {
    expect(shareText('Check this out #ad')).toBe('Check this out #ad');
    expect(shareText('Check this out #AD #ad')).toBe('Check this out #ad');
    expect(shareText('  Check this out  ')).toBe('Check this out #ad');
    expect(shareText('')).toBe('#ad');
  });

  it('treats unavailable local storage as optional and keeps sharing usable', () => {
    const denied = () => { throw new Error('storage blocked'); };
    expect(safeStorageGet('consent', denied)).toBeNull();
    expect(safeStorageSet('story-guide', 'yes', denied)).toBe(false);
  });

  it('reads and writes when storage is available', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
    expect(safeStorageGet('consent', () => storage)).toBeNull();
    expect(safeStorageSet('story-guide', 'yes', () => storage)).toBe(true);
    expect(safeStorageGet('story-guide', () => storage)).toBe('yes');
  });
});
