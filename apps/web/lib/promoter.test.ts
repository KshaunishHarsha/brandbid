import { beforeEach, describe, expect, it, vi } from 'vitest';

const { profileResult, brandResult, from } = vi.hoisted(() => ({
  profileResult: vi.fn(),
  brandResult: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      from(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => (table === 'profiles' ? profileResult() : brandResult()),
          }),
        }),
      };
    },
  }),
}));

import { handleAvailable } from './promoter';

beforeEach(() => {
  from.mockReset();
  profileResult.mockReset().mockResolvedValue({ data: null, error: null });
  brandResult.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('handleAvailable', () => {
  it('checks both existing profile handles and brand slugs', async () => {
    await expect(handleAvailable('promoter_1')).resolves.toBe(true);

    profileResult.mockResolvedValueOnce({ data: { id: 'someone-else' }, error: null });
    await expect(handleAvailable('promoter_1')).resolves.toBe(false);

    profileResult.mockResolvedValueOnce({ data: null, error: null });
    brandResult.mockResolvedValueOnce({ data: { id: 'brand-1' }, error: null });
    await expect(handleAvailable('promoter_1')).resolves.toBe(false);
  });

  it('allows the current promoter to keep their own handle', async () => {
    profileResult.mockResolvedValueOnce({ data: { id: 'user-1' }, error: null });

    await expect(handleAvailable('promoter_1', 'user-1')).resolves.toBe(true);
  });

  it('rejects invalid and reserved values before querying', async () => {
    await expect(handleAvailable('admin')).resolves.toBe(false);
    await expect(handleAvailable('contains-space')).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed when either availability query errors', async () => {
    profileResult.mockResolvedValueOnce({ data: null, error: new Error('database down') });

    await expect(handleAvailable('promoter_1')).rejects.toThrow('Handle availability unavailable');
  });
});
