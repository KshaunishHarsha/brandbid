import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getUser: () => getUser() }));
const update = vi.fn();
const eq = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update: (...args: unknown[]) => { update(...args); return { eq }; } }) }) }));

import { POST } from './route';

const USER = '11111111-1111-4111-8111-111111111111';
const request = (enabled: string, origin = 'https://brandbid.wtf') => new Request('https://brandbid.wtf/api/account/notifications', { method: 'POST', headers: { origin }, body: new URLSearchParams({ enabled }) });
const notice = (response: Response) => new URL(response.headers.get('location')!).searchParams.get('notice');

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ id: USER });
  update.mockReset();
  eq.mockReset().mockResolvedValue({ error: null });
});

describe('account email preferences', () => {
  it('requires same-origin authenticated requests', async () => {
    expect((await POST(request('false', 'https://evil.test'))).status).toBe(403);
    getUser.mockResolvedValue(null);
    const signedOut = await POST(request('false'));
    expect(new URL(signedOut.headers.get('location')!).pathname).toBe('/signin');
    expect(update).not.toHaveBeenCalled();
  });

  it('lets the user change only their optional product-alert preference', async () => {
    const response = await POST(request('false'));
    expect(update).toHaveBeenCalledWith({ product_emails_enabled: false });
    expect(eq).toHaveBeenCalledWith('id', USER);
    expect(notice(response)).toContain('unsubscribed');
  });

  it('supports resubscribing', async () => {
    const response = await POST(request('true'));
    expect(update).toHaveBeenCalledWith({ product_emails_enabled: true });
    expect(notice(response)).toContain('are on');
  });
});
