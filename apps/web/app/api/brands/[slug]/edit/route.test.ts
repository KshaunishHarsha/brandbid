import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMemberBrand = vi.fn();
vi.mock('@/lib/dashboard', () => ({ getMemberBrand: (...a: unknown[]) => getMemberBrand(...a) }));
const update = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ update: (v: unknown) => { update(v); return { eq: () => ({ select: async () => updateResult() }) }; } }) }),
}));
const updateResult = vi.fn();
const saveLogo = vi.fn();
vi.mock('@/lib/logos', () => ({ MAX_LOGO_BYTES: 1024 * 1024, saveLogo: (...a: unknown[]) => saveLogo(...a) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }));

import { POST } from './route';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const post = (fields: Record<string, string | Blob>, origin: string | null = 'https://brandbid.wtf') => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('https://brandbid.wtf/api/brands/acme/edit', { method: 'POST', headers: origin ? { origin } : {}, body: form });
};
const ctx = { params: Promise.resolve({ slug: 'acme' }) };
const notice = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('notice')!;
const GOOD = 'A perfectly good description';

beforeEach(() => {
  getMemberBrand.mockReset().mockResolvedValue({ brand: { id: 'b1', slug: 'acme' } });
  update.mockReset();
  updateResult.mockReset().mockResolvedValue({ data: [{ id: 'b1' }], error: null });
  saveLogo.mockReset().mockResolvedValue('b1.png');
});

describe('POST /api/brands/[slug]/edit', () => {
  it('saves the description through the member\'s own session', async () => {
    const res = await POST(post({ description: `  ${GOOD}  ` }), ctx);
    expect(res.status).toBe(303);
    expect(update).toHaveBeenCalledWith({ description: GOOD });
    expect(notice(res)).toBe('Saved.');
    expect(saveLogo).not.toHaveBeenCalled();
  });
  it('also uploads a valid logo', async () => {
    const res = await POST(post({ description: GOOD, logo: new File([PNG], 'logo.png', { type: 'image/png' }) }), ctx);
    expect(saveLogo).toHaveBeenCalledTimes(1);
    expect(notice(res)).toContain('logo updated');
  });
  it('refuses cross-site requests without touching anything', async () => {
    for (const origin of ['https://evil.com', null]) expect((await POST(post({ description: GOOD }, origin), ctx)).status).toBe(403);
    expect(getMemberBrand).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('answers 404 to non-members and changes nothing', async () => {
    getMemberBrand.mockResolvedValue(null);
    expect((await POST(post({ description: GOOD }), ctx)).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
    expect(saveLogo).not.toHaveBeenCalled();
  });
  it.each([['too short', 'short'], ['too long', 'x'.repeat(161)], ['empty', '   ']])('rejects a description that is %s', async (_n, description) => {
    expect(notice(await POST(post({ description }), ctx))).toContain('10 to 160');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects a logo that is not really an image (a renamed text or HTML file)', async () => {
    const fake = new File([new TextEncoder().encode('<script>alert(1)</script>')], 'logo.png', { type: 'image/png' });
    expect(notice(await POST(post({ description: GOOD, logo: fake }), ctx))).toContain('PNG, JPEG or WebP');
    expect(update).not.toHaveBeenCalled();
    expect(saveLogo).not.toHaveBeenCalled();
  });
  it('rejects an oversized logo', async () => {
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    expect(notice(await POST(post({ description: GOOD, logo: big }), ctx))).toContain('under 1 MB');
    expect(saveLogo).not.toHaveBeenCalled();
  });
  it('says nothing was changed when row-level security blocks the write', async () => {
    updateResult.mockResolvedValue({ data: [], error: null });
    expect(notice(await POST(post({ description: GOOD }), ctx))).toContain('Nothing was changed');
    expect(saveLogo).not.toHaveBeenCalled();
  });
  it('reports a logo upload failure honestly while keeping the saved description', async () => {
    saveLogo.mockResolvedValue(null);
    const res = await POST(post({ description: GOOD, logo: new File([PNG], 'logo.png') }), ctx);
    expect(notice(res)).toContain('logo could not be uploaded');
    expect(update).toHaveBeenCalled();
  });
});
