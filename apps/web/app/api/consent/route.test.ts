import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSameOrigin: vi.fn(),
  hashValue: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  lookupClick: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  updateVisitorEq: vi.fn(),
}));

vi.mock('@/lib/same-origin', () => ({ isSameOrigin: mocks.isSameOrigin }));
vi.mock('@/lib/request', () => ({ hashValue: mocks.hashValue }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from './route';

const clickId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const request = (body: unknown, cookie?: string) => new Request('https://brandbid.test/api/consent', {
  method: 'POST',
  headers: { origin: 'https://brandbid.test', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSameOrigin.mockReturnValue(true);
  mocks.hashValue.mockImplementation(async (value: string) => `hash:${value}`);
  mocks.lookupClick.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.updateVisitorEq.mockResolvedValue({ error: null });
  mocks.updateEq.mockReturnValue({ eq: mocks.updateVisitorEq });
  mocks.update.mockReturnValue({ eq: mocks.updateEq });
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.lookupClick }) }),
    upsert: mocks.upsert,
    update: mocks.update,
  }));
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
});

describe('POST /api/consent', () => {
  it('declining saves the choice and clears the visitor cookie without touching visitor data', async () => {
    const response = await POST(request({ choice: 'no', clickId }, 'bb_vid=0123456789abcdef0123456789abcdef'));
    const cookies = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(204);
    expect(cookies).toContain('bb_consent=no');
    expect(cookies).toContain('bb_vid=; Path=/; Max-Age=0');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.hashValue).not.toHaveBeenCalled();
  });

  it('accepting issues a visitor cookie and binds it to the click visitor when available', async () => {
    mocks.lookupClick.mockResolvedValueOnce({ data: { brand_id: 'brand-1', visitor_id: 'visitor-1' }, error: null });

    const response = await POST(request({ choice: 'yes', clickId }));
    const cookies = response.headers.get('set-cookie') ?? '';
    const visitorId = cookies.match(/bb_vid=([a-f0-9]{32})/)?.[1];

    expect(response.status).toBe(204);
    expect(cookies).toContain('bb_consent=yes');
    expect(visitorId).toMatch(/^[a-f0-9]{32}$/);
    expect(mocks.hashValue).toHaveBeenCalledWith(visitorId);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { brand_id: 'brand-1', key_type: 'cookie', key_hash: `hash:${visitorId}`, visitor_id: 'visitor-1' },
      { onConflict: 'brand_id,key_type,key_hash', ignoreDuplicates: true },
    );
    expect(mocks.update).toHaveBeenCalledWith({ cookie_id: visitorId });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', clickId);
    expect(mocks.updateVisitorEq).toHaveBeenCalledWith('visitor_id', 'visitor-1');
  });

  it('rejects a cross-origin consent change', async () => {
    mocks.isSameOrigin.mockReturnValueOnce(false);

    const response = await POST(request({ choice: 'yes' }));

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
