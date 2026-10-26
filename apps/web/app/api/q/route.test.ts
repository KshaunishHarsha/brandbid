import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  lookupClick: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  updateVisitorEq: vi.fn(),
  limit: vi.fn(),
  hashValue: vi.fn(),
  verifyTurnstile: vi.fn(),
  captureException: vi.fn(),
  cookieValues: new Map<string, string>(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => {
  const value = mocks.cookieValues.get(name);
  return value ? { value } : undefined;
} }) }));
vi.mock('@/lib/ratelimit', () => ({ getLimiter: () => ({ limit: mocks.limit }) }));
vi.mock('@/lib/request', () => ({ getClientIp: () => '198.51.100.5', hashValue: mocks.hashValue }));
vi.mock('@/lib/same-origin', () => ({ isSameOrigin: () => true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: mocks.verifyTurnstile }));

import { POST } from './route';

const body = {
  clickId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  linkCode: 'AbCd1234',
  activeMs: 10_000,
  interactions: 2,
  turnstileToken: 'token',
  fingerprint: 'device-fingerprint',
};

function request(payload: unknown = body, country = 'US') {
  return new Request('https://brandbid.test/api/q', {
    method: 'POST',
    headers: { origin: 'https://brandbid.test', 'cf-connecting-ip': '198.51.100.5', 'cf-ipcountry': country, 'user-agent': 'Browser' },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValues.clear();
  mocks.limit.mockResolvedValue({ success: true });
  mocks.hashValue.mockImplementation(async (value: string) => `hash:${value}`);
  mocks.verifyTurnstile.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ error: null });
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
});

describe('POST /api/q', () => {
  it('always returns 204 and does not call SQL for invalid qualification data', async () => {
    const response = await POST(request({ ...body, activeMs: 9_999 }));
    expect(response.status).toBe(204);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires rate limit and Turnstile to pass before calling the RPC', async () => {
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect((await POST(request())).status).toBe(204);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.limit.mockResolvedValue({ success: true });
    mocks.verifyTurnstile.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(204);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('hashes fingerprint server-side and omits device identifiers without EU consent', async () => {
    mocks.cookieValues.set('bb_vid', '0123456789abcdef0123456789abcdef');
    mocks.cookieValues.set('bb_consent', 'no');
    const response = await POST(request(body, 'DE'));
    expect(response.status).toBe(204);
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalled();
    expect(mocks.verifyTurnstile).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('qualify_visitor', expect.objectContaining({
      p_click_id: body.clickId,
      p_fp_hash: null,
      p_cookie_id: null,
      p_active_ms: 10_000,
      p_interactions: 2,
    }));
    expect(mocks.hashValue).not.toHaveBeenCalledWith(body.fingerprint);
  });

  it('passes consented cookie and HMACed fingerprint to SQL', async () => {
    mocks.lookupClick.mockResolvedValueOnce({ data: { brand_id: 'brand-1', visitor_id: 'visitor-1' }, error: null });
    mocks.cookieValues.set('bb_vid', '0123456789abcdef0123456789abcdef');
    mocks.cookieValues.set('bb_consent', 'yes');
    const response = await POST(request(body, 'GB'));
    expect(response.status).toBe(204);
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('qualify_visitor', expect.objectContaining({
      p_fp_hash: `hash:${body.fingerprint}`,
      p_cookie_id: '0123456789abcdef0123456789abcdef',
    }));
    expect(mocks.upsert).toHaveBeenCalledWith({
      brand_id: 'brand-1',
      key_type: 'cookie',
      key_hash: 'hash:0123456789abcdef0123456789abcdef',
      visitor_id: 'visitor-1',
    }, { onConflict: 'brand_id,key_type,key_hash', ignoreDuplicates: true });
    expect(mocks.update).toHaveBeenCalledWith({ cookie_id: '0123456789abcdef0123456789abcdef' });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', body.clickId);
    expect(mocks.updateVisitorEq).toHaveBeenCalledWith('visitor_id', 'visitor-1');
  });
});
