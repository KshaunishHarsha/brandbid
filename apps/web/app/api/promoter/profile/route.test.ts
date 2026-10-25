import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getUser: () => getUser() }));
const canAdvertise = vi.fn();
vi.mock('@/lib/beta', () => ({ canAdvertise: (...args: unknown[]) => canAdvertise(...args) }));
const handleAvailable = vi.fn();
vi.mock('@/lib/promoter', () => ({ handleAvailable: (...args: unknown[]) => handleAvailable(...args) }));
const limit = vi.fn();
vi.mock('@/lib/ratelimit', () => ({ getLimiter: () => ({ limit }) }));
const single = vi.fn();
const select = vi.fn(() => ({ single }));
const eq = vi.fn(() => ({ select }));
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));

import { POST } from './route';

const USER = '11111111-1111-4111-8111-111111111111';
const payload = (overrides: Record<string, unknown> = {}) => ({ handle: 'promoter_1', country: 'US', acceptTerms: true, next: '/b/acme?advertise=1', ...overrides });
const request = (body: Record<string, unknown> = payload(), origin = 'https://brandbid.wtf') => new Request('https://brandbid.wtf/api/promoter/profile', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ id: USER, email: 'promoter@test.dev', email_confirmed_at: '2026-01-01T00:00:00.000Z' });
  canAdvertise.mockReset().mockResolvedValue(true);
  handleAvailable.mockReset().mockResolvedValue(true);
  limit.mockReset().mockResolvedValue({ success: true });
  single.mockReset().mockResolvedValue({ error: null });
  select.mockClear(); eq.mockClear(); update.mockClear(); from.mockClear();
});

describe('promoter profile submission gates', () => {
  it('rejects cross-origin and unverified accounts before writing', async () => {
    expect((await POST(request(payload(), 'https://evil.test'))).status).toBe(403);
    getUser.mockResolvedValueOnce({ id: USER, email: 'promoter@test.dev', email_confirmed_at: null });
    expect((await POST(request())).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('requires the beta allowlist before allowing profile setup', async () => {
    canAdvertise.mockResolvedValueOnce(false);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'beta_closed' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects reserved and taken handles without writing', async () => {
    const reserved = await POST(request(payload({ handle: 'admin' })));
    expect(reserved.status).toBe(400);
    expect(handleAvailable).not.toHaveBeenCalled();

    handleAvailable.mockResolvedValueOnce(false);
    const taken = await POST(request());
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'handle_taken' });
    expect(from).not.toHaveBeenCalled();
  });

  it('saves the accepted profile and returns a safe in-app destination', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: '/b/acme?advertise=1' });
    expect(handleAvailable).toHaveBeenCalledWith('promoter_1', USER);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ handle: 'promoter_1', country: 'US', promoter_terms_accepted_at: expect.any(String) }));
    expect(eq).toHaveBeenCalledWith('id', USER);
  });

  it('maps a concurrent unique-handle collision to the same taken response', async () => {
    single.mockResolvedValueOnce({ error: { code: '23505' } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'handle_taken' });
  });
});
