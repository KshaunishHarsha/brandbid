import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getUser: () => getUser() }));
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';

const USER = '11111111-1111-4111-8111-111111111111';
const request = (origin = 'https://brandbid.wtf') => new Request('https://brandbid.wtf/api/promoter/withdrawals', { method: 'POST', headers: { origin } });
const notice = (response: Response) => new URL(response.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ id: USER });
  rpc.mockReset().mockResolvedValue({ data: { status: 'review', amount_cents: 2500 }, error: null });
});

describe('promoter withdrawal request', () => {
  it('rejects cross-origin requests', async () => {
    expect((await POST(request('https://evil.test'))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('redirects signed-out users to sign-in', async () => {
    getUser.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/signin');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requests for the signed-in promoter and explains manual review without sending money', async () => {
    const response = await POST(request());
    expect(rpc).toHaveBeenCalledWith('request_withdrawal', { p_promoter_id: USER });
    expect(new URL(response.headers.get('location')!).pathname).toBe('/dash/promoter');
    expect(notice(response)).toContain('admin review');
    expect(notice(response)).toContain('configured provider');
  });

  it('maps verification gates to actionable messages', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'kyc_not_verified' } });
    expect(notice(await POST(request()))).toContain('Complete KYC');
  });
});
