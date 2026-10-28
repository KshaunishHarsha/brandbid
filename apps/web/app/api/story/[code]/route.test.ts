import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCreative, download, upload } = vi.hoisted(() => ({
  getCreative: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/lib/creative', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/creative')>()),
  getLinkCreative: (...args: unknown[]) => getCreative(...args),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ download, upload }) } }) }));
const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { GET } from './route';
import type { LinkCreative } from '@/lib/creative';

const creative: LinkCreative = {
  brandId: '11111111-1111-4111-8111-111111111111',
  name: 'Acme', description: 'A great product', logoPath: null, logoData: null, rank: null,
};

beforeEach(() => {
  getCreative.mockReset().mockResolvedValue(creative);
  download.mockReset().mockResolvedValue({ data: null, error: new Error('bucket unavailable') });
  upload.mockReset().mockResolvedValue({ error: new Error('bucket unavailable') });
  captureException.mockReset();
});

describe('story image route', () => {
  it('serves a valid story PNG when the cache bucket is unavailable', async () => {
    const response = await GET(new Request('https://brandbid.wtf/api/story/Story001'), { params: Promise.resolve({ code: 'Story001' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(1080);
    expect(view.getUint32(20)).toBe(1920);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);
  });

  it('still serves the generated image when cache download throws', async () => {
    download.mockRejectedValueOnce(new Error('storage connection failed'));

    const response = await GET(new Request('https://brandbid.wtf/api/story/Story003'), { params: Promise.resolve({ code: 'Story003' }) });

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { route: 'story', stage: 'cache_read' } });
  });

  it('still serves the generated image when cache upload throws', async () => {
    upload.mockRejectedValueOnce(new Error('storage connection failed'));

    const response = await GET(new Request('https://brandbid.wtf/api/story/Story004'), { params: Promise.resolve({ code: 'Story004' }) });

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { route: 'story', stage: 'cache_write' } });
  });

  it('serves the cached PNG when available without rerendering or uploading', async () => {
    const cached = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    download.mockResolvedValueOnce({ data: cached, error: null });
    const response = await GET(new Request('https://brandbid.wtf/api/story/Story002'), { params: Promise.resolve({ code: 'Story002' }) });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(upload).not.toHaveBeenCalled();
  });
});
