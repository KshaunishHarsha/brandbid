import { describe, expect, it } from 'vitest';
import { monogram, storyCachePath, type LinkCreative } from './creative';

const creative: LinkCreative = {
  brandId: '11111111-1111-4111-8111-111111111111',
  name: 'Acme Rockets',
  description: 'Building useful things',
  logoPath: '11111111-1111-4111-8111-111111111111.png',
  logoData: 'data:image/png;base64,AAAA',
  rank: 12,
};

describe('story creative helpers', () => {
  it('uses a monogram for missing or blank names', () => {
    expect(monogram('Acme Rockets Ltd')).toBe('AR');
    expect(monogram('   ')).toBe('B');
  });

  it('keeps the cache path stable for the same rendered creative', async () => {
    expect(await storyCachePath(creative)).toBe(await storyCachePath({ ...creative }));
  });

  it.each([
    ['logo content', { logoData: 'data:image/png;base64,BBBB' }],
    ['name', { name: 'Acme Rockets 2' }],
    ['description', { description: 'A changed description' }],
    ['rank', { rank: 13 }],
    ['logo availability', { logoData: null }],
  ])('invalidates the cache when rendered %s changes', async (_field, change) => {
    expect(await storyCachePath(creative)).not.toBe(await storyCachePath({ ...creative, ...change }));
  });
});
