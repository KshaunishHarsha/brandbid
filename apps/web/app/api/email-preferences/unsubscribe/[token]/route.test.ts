import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from './route';

const TOKEN = 'ab'.repeat(32);
const request = (origin = 'https://brandbid.wtf') => new Request(`https://brandbid.wtf/api/email-preferences/unsubscribe/${TOKEN}`, { method: 'POST', headers: { origin } });
const params = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

beforeEach(() => rpc.mockReset().mockResolvedValue({ error: null }));

describe('email unsubscribe confirmation', () => {
  it('rejects cross-origin and malformed tokens', async () => {
    expect((await POST(request('https://evil.test'), params())).status).toBe(403);
    expect((await POST(request(), params('bad'))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('hashes the capability token and asks the database to consume it once', async () => {
    const response = await POST(request(), params());
    expect(rpc).toHaveBeenCalledWith('confirm_email_unsubscribe', { p_token_hash: createHash('sha256').update(TOKEN).digest('hex') });
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe(`/unsubscribe/${TOKEN}`);
    expect(location.searchParams.get('done')).toBe('1');
  });
});
