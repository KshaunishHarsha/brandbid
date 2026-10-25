import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCreative = vi.hoisted(() => vi.fn());
vi.mock('@/lib/creative', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/creative')>()),
  getLinkCreative: (...args: unknown[]) => getCreative(...args),
}));

import { GET } from './route';
import type { LinkCreative } from '@/lib/creative';

const longName: LinkCreative = {
  brandId: '11111111-1111-4111-8111-111111111111',
  name: 'A Very Long Brand Name That Needs To Fit Into The Social Preview Card Without Overflowing Its Layout',
  description: 'An intentionally long description that should be clipped to the card bounds while the renderer still completes.',
  logoPath: null,
  logoData: null,
  rank: 123,
};
const transparentLogo: LinkCreative = {
  ...longName,
  name: 'Transparent Logo Co',
  logoPath: 'transparent.png',
  logoData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/jXcAAAAASUVORK5CYII=',
};

async function png(response: Response, width: number, height: number) {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('image/png');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(16)).toBe(width);
  expect(view.getUint32(20)).toBe(height);
  expect(bytes.length).toBeGreaterThan(1000);
}

beforeEach(() => getCreative.mockReset());

describe('Open Graph image route', () => {
  it('renders a PNG for a long brand name with the monogram fallback', async () => {
    getCreative.mockResolvedValue(longName);
    await png(await GET(new Request('https://brandbid.wtf/api/og/LongName'), { params: Promise.resolve({ code: 'LongName' }) }), 1200, 630);
  });

  it('renders a PNG with a transparent logo', async () => {
    getCreative.mockResolvedValue(transparentLogo);
    await png(await GET(new Request('https://brandbid.wtf/api/og/TransPNG'), { params: Promise.resolve({ code: 'TransPNG' }) }), 1200, 630);
  });

  it('returns 404 when the link has no public creative', async () => {
    getCreative.mockResolvedValue(null);
    expect((await GET(new Request('https://brandbid.wtf/api/og/Missing1'), { params: Promise.resolve({ code: 'Missing1' }) })).status).toBe(404);
  });
});
