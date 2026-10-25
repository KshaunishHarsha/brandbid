import { describe, expect, it, vi } from 'vitest';
import { createMailer } from './transport';

const mail = { to: 'a@b.co', subject: 'Hi', html: '<p>x</p>', text: 'x' };
const ok = () => vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

describe('createMailer', () => {
  it('sends through Resend when a key is set', async () => {
    const f = ok();
    await createMailer({ resendApiKey: 're_123', from: 'brandbid <noreply@brandbid.wtf>', fetchImpl: f })(mail);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_123');
    expect(JSON.parse(init.body)).toMatchObject({ from: 'brandbid <noreply@brandbid.wtf>', to: ['a@b.co'], subject: 'Hi' });
  });
  it('prefers Resend over Mailpit when both are configured', async () => {
    const f = ok();
    await createMailer({ resendApiKey: 're_1', mailpitUrl: 'http://127.0.0.1:54324', from: 'x@y.z', fetchImpl: f })(mail);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('https://api.resend.com/emails');
  });
  it('sends to Mailpit in development', async () => {
    const f = ok();
    await createMailer({ mailpitUrl: 'http://127.0.0.1:54324/', from: 'brandbid <noreply@brandbid.wtf>', fetchImpl: f })(mail);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:54324/api/v1/send');
    expect(JSON.parse(init.body)).toMatchObject({ From: { Email: 'noreply@brandbid.wtf', Name: 'brandbid' }, To: [{ Email: 'a@b.co' }], Subject: 'Hi' });
  });
  it('fails loudly (never silently drops mail) when the provider rejects it', async () => {
    const bad = vi.fn(async () => new Response('invalid api key', { status: 401 })) as unknown as typeof fetch;
    await expect(createMailer({ resendApiKey: 'x', from: 'a@b.c', fetchImpl: bad })(mail)).rejects.toThrow(/Resend 401/);
    await expect(createMailer({ mailpitUrl: 'http://m', from: 'a@b.c', fetchImpl: bad })(mail)).rejects.toThrow(/Mailpit 401/);
  });
  it('fails loudly when nothing is configured', async () => {
    await expect(createMailer({ from: 'a@b.c' })(mail)).rejects.toThrow(/not configured/);
  });
});
