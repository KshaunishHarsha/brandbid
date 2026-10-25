import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile';

const reply = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

describe('verifyTurnstile', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('accepts a successful verification and sends secret, token and ip', async () => {
    const f = reply({ success: true });
    expect(await verifyTurnstile('tok', '1.2.3.4', f)).toBe(true);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });
  it('rejects failures, missing tokens, bad responses and network errors', async () => {
    expect(await verifyTurnstile('tok', undefined, reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile('', undefined, reply({ success: true }))).toBe(false);
    expect(await verifyTurnstile(undefined, undefined, reply({ success: true }))).toBe(false);
    expect(await verifyTurnstile('tok', undefined, reply({}, false))).toBe(false);
    expect(await verifyTurnstile('tok', undefined, vi.fn(async () => { throw new Error('down'); }) as unknown as typeof fetch)).toBe(false);
  });
  it('without a secret: allows in dev, fails closed in production', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.stubEnv('NODE_ENV', 'development');
    expect(await verifyTurnstile('x')).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(await verifyTurnstile('x')).toBe(false);
    vi.unstubAllEnvs();
  });
});
