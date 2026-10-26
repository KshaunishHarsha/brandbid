import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { getBrandPage, getUser, canAdvertise, createClient, getShareLinks, membershipQuery, profileQuery } = vi.hoisted(() => ({
  getBrandPage: vi.fn(),
  getUser: vi.fn(),
  canAdvertise: vi.fn(),
  createClient: vi.fn(),
  getShareLinks: vi.fn(),
  membershipQuery: vi.fn(),
  profileQuery: vi.fn(),
}));

vi.mock('@/lib/brand', () => ({ getBrandPage: (...args: unknown[]) => getBrandPage(...args) }));
vi.mock('@/lib/auth', () => ({
  getUser: (...args: unknown[]) => getUser(...args),
  signInUrl: (next: string) => `/signin?next=${encodeURIComponent(next)}`,
}));
vi.mock('@/lib/beta', () => ({ canAdvertise: (...args: unknown[]) => canAdvertise(...args) }));
vi.mock('@/lib/share-links', () => ({ getShareLinks: (...args: unknown[]) => getShareLinks(...args) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

import Advertise from './page';

const brand = { id: 'brand-1', slug: 'acme', name: 'Acme', description: 'A product' };
const user = { id: 'user-1', email: 'promoter@example.test', email_confirmed_at: '2026-10-26T00:00:00Z' };

beforeEach(() => {
  getBrandPage.mockReset().mockResolvedValue(brand);
  getUser.mockReset().mockResolvedValue(user);
  canAdvertise.mockReset().mockResolvedValue(true);
  getShareLinks.mockReset();
  profileQuery.mockReset().mockResolvedValue({ data: { handle: 'promoter_1', promoter_terms_accepted_at: '2026-10-26T00:00:00Z' } });
  membershipQuery.mockReset().mockResolvedValue({ data: null });
  createClient.mockReset().mockResolvedValue({
    from: (table: string) => ({
      select: () => ({
        eq: () => table === 'profiles'
          ? { single: () => profileQuery() }
          : { eq: () => ({ maybeSingle: () => membershipQuery() }) },
      }),
    }),
  });
});

async function pageText() {
  const page = await Advertise({ params: Promise.resolve({ slug: 'acme' }) });
  return renderToStaticMarkup(page);
}

describe('promoter member gate', () => {
  it('shows the self-promotion explanation before rendering share links for a brand member', async () => {
    membershipQuery.mockResolvedValueOnce({ data: { role: 'owner' } });

    const html = await pageText();

    expect(html).toContain('You can&#x27;t promote a brand you&#x27;re part of.');
    expect(html).toContain('You&#x27;re part of its team.');
    expect(getShareLinks).not.toHaveBeenCalled();
  });

  it('shows the same explanation when the database self-promotion guard rejects link creation', async () => {
    getShareLinks.mockRejectedValueOnce(new Error('self_promotion'));

    const html = await pageText();

    expect(html).toContain('You can&#x27;t promote a brand you&#x27;re part of.');
  });
});
