import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureUserByEmail } from './users';

function admin(opts: { create?: { id?: string; error?: string }; lookup?: { id?: string | null; error?: string } }) {
  const createUser = vi.fn(async () =>
    opts.create?.id ? { data: { user: { id: opts.create.id } }, error: null } : { data: { user: null }, error: { message: opts.create?.error ?? 'boom' } },
  );
  const rpc = vi.fn(async () => ({ data: opts.lookup?.id ?? null, error: opts.lookup?.error ? { message: opts.lookup.error } : null }));
  return { client: { auth: { admin: { createUser } }, rpc } as unknown as SupabaseClient<never>, createUser, rpc };
}

describe('ensureUserByEmail', () => {
  it('creates an unconfirmed account for a new email, lowercased and trimmed', async () => {
    const a = admin({ create: { id: 'u-new' } });
    expect(await ensureUserByEmail(a.client as never, '  Alice@Example.COM ')).toEqual({ id: 'u-new', created: true });
    expect(a.createUser).toHaveBeenCalledWith({ email: 'alice@example.com', email_confirm: false });
    expect(a.rpc).not.toHaveBeenCalled();
  });
  it('returns the existing account when the email is already registered', async () => {
    const a = admin({ create: { error: 'A user with this email address has already been registered' }, lookup: { id: 'u-old' } });
    expect(await ensureUserByEmail(a.client as never, 'alice@example.com')).toEqual({ id: 'u-old', created: false });
    expect(a.rpc).toHaveBeenCalledWith('find_user_id_by_email', { p_email: 'alice@example.com' });
  });
  it('throws when it can neither create nor find the account', async () => {
    const a = admin({ create: { error: 'db down' }, lookup: { id: null } });
    await expect(ensureUserByEmail(a.client as never, 'x@y.com')).rejects.toThrow(/db down/);
  });
});
