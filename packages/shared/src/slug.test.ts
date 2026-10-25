import { describe, expect, it } from 'vitest';
import { slugCandidates, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Acme', 'acme'],
    ['Acme Inc.', 'acme-inc'],
    ['  Café Ünïcode!  ', 'cafe-unicode'],
    ['Tom & Jerry', 'tom-and-jerry'],
    ['a---b___c', 'a-b-c'],
    ['UPPER lower 123', 'upper-lower-123'],
    ['日本語', 'brand'], // nothing left after stripping: still a valid slug
    ['', 'brand'],
    ['!!!', 'brand'],
    ['admin', 'admin-brand'], // reserved
    ['Support', 'support-brand'],
  ])('%j -> %s', (input, expected) => expect(slugify(input)).toBe(expected));

  it('caps length without leaving a trailing dash', () => {
    const s = slugify('word '.repeat(30));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
  });

  it('always matches the database slug check', () => {
    const re = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const n of ['Acme', '  ', '💥 Boom', 'a/b\\c', 'x'.repeat(100), '-lead', 'trail-', 'Ünï-cödé']) {
      expect(slugify(n)).toMatch(re);
    }
  });
});

describe('slugCandidates', () => {
  it('lists base then numbered variants within the length cap', () => {
    expect(slugCandidates('acme', 4)).toEqual(['acme', 'acme-2', 'acme-3', 'acme-4']);
    const long = 'a'.repeat(40);
    for (const c of slugCandidates(long)) expect(c.length).toBeLessThanOrEqual(40);
  });
});
