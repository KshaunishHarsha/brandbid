import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMemberBrand: vi.fn(),
  update: vi.fn(),
  updateResult: vi.fn(),
  saveLogo: vi.fn(),
  floor: vi.fn(),
}));

vi.mock('@/lib/dashboard', () => ({ getMemberBrand: (...args: unknown[]) => mocks.getMemberBrand(...args) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ update: (values: unknown) => {
    mocks.update(values);
    return { eq: () => ({ select: async () => mocks.updateResult() }) };
  } }) }),
}));
vi.mock('@/lib/logos', () => ({ MAX_LOGO_BYTES: 1024 * 1024, saveLogo: (...args: unknown[]) => mocks.saveLogo(...args) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: (table: string) => table === 'settings'
    ? { select: () => ({ eq: () => ({ maybeSingle: mocks.floor }) }) }
    : { admin: true },
}) }));

import { POST } from './route';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const post = (fields: Record<string, string | Blob>, origin: string | null = 'https://brandbid.wtf') => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://brandbid.wtf/api/brands/acme/edit', { method: 'POST', headers: origin ? { origin } : {}, body: form });
};
const ctx = { params: Promise.resolve({ slug: 'acme' }) };
const notice = (response: Response) => new URL(response.headers.get('location')!).searchParams.get('notice')!;
const GOOD = 'A perfectly good description';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMemberBrand.mockResolvedValue({ brand: { id: 'b1', slug: 'acme' } });
  mocks.updateResult.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
  mocks.saveLogo.mockResolvedValue('b1.png');
  mocks.floor.mockResolvedValue({ data: { value: 10 }, error: null });
});

describe('POST /api/brands/[slug]/edit', () => {
  it('saves the description through the member\'s own session', async () => {
    const response = await POST(post({ description: `  ${GOOD}  ` }), ctx);
    expect(response.status).toBe(303);
    expect(mocks.update).toHaveBeenCalledWith({ description: GOOD });
    expect(notice(response)).toBe('Saved: description updated.');
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });
  it('also uploads a valid logo', async () => {
    const response = await POST(post({ description: GOOD, logo: new File([PNG], 'logo.png', { type: 'image/png' }) }), ctx);
    expect(mocks.saveLogo).toHaveBeenCalledTimes(1);
    expect(notice(response)).toContain('logo updated');
  });
  it('refuses cross-site requests without touching anything', async () => {
    for (const origin of ['https://evil.com', null]) expect((await POST(post({ description: GOOD }, origin), ctx)).status).toBe(403);
    expect(mocks.getMemberBrand).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('answers 404 to non-members and changes nothing', async () => {
    mocks.getMemberBrand.mockResolvedValue(null);
    expect((await POST(post({ description: GOOD }), ctx)).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });
  it.each([['too short', 'short'], ['too long', 'x'.repeat(161)], ['empty', '   ']])('rejects a description that is %s', async (_name, description) => {
    expect(notice(await POST(post({ description }), ctx))).toContain('10 to 160');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects a logo that is not really an image', async () => {
    const fake = new File([new TextEncoder().encode('<script>alert(1)</script>')], 'logo.png', { type: 'image/png' });
    expect(notice(await POST(post({ description: GOOD, logo: fake }), ctx))).toContain('PNG, JPEG or WebP');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });
  it('rejects an oversized logo', async () => {
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    expect(notice(await POST(post({ description: GOOD, logo: big }), ctx))).toContain('under 1 MB');
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });
  it('says nothing was changed when row-level security blocks the write', async () => {
    mocks.updateResult.mockResolvedValue({ data: [], error: null });
    expect(notice(await POST(post({ description: GOOD }), ctx))).toContain('Nothing was changed');
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });
  it('reports a logo upload failure while keeping the saved description', async () => {
    mocks.saveLogo.mockResolvedValue(null);
    const response = await POST(post({ description: GOOD, logo: new File([PNG], 'logo.png') }), ctx);
    expect(notice(response)).toContain('logo could not be uploaded');
    expect(mocks.update).toHaveBeenCalled();
  });
  it('rejects a below-floor rate before attempting a brand update', async () => {
    const response = await POST(post({ rate: '0.09' }), ctx);
    expect(response.status).toBe(303);
    expect(decodeURIComponent(notice(response))).toContain('at least $0.10');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('parses dollars to integer cents and leaves the final floor check to SQL', async () => {
    const response = await POST(post({ rate: '1.25' }), ctx);
    expect(response.status).toBe(303);
    expect(mocks.update).toHaveBeenCalledWith({ rate_cents: 125 });
    expect(notice(response)).toBe('Saved: rate updated.');
  });
  it('shows a refresh notice if the database floor changes between validation and update', async () => {
    mocks.updateResult.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'brand_rate_below_floor' } });
    const response = await POST(post({ rate: '0.10' }), ctx);
    expect(response.status).toBe(303);
    expect(decodeURIComponent(notice(response))).toContain('minimum rate changed');
  });
});
