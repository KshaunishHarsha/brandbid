import { decideListing, safeFetch } from '@brandbid/shared';
import type { Pool } from '../db.js';
import { resolveCheck } from '../dns-guard.js';

// BUILD section 8 step 5 / PHASES P1.6. For each freshly paid listing (pending_review, not yet checked):
//   - approve it (status -> active), or
//   - hold it for an admin with the reasons recorded in review_reason.
// The row stays locked while we probe the site, so two workers never check the same brand.

export type CheckDeps = { probe: (url: string) => Promise<{ ok: boolean }> };

/** A site "resolves" if a server answers over https without a server error or a missing page. */
export async function probeUrl(url: string): Promise<{ ok: boolean }> {
  try {
    const res = await safeFetch(url, { resolveCheck, timeoutMs: 8000, maxBytes: 64 * 1024, headers: { Accept: 'text/html,*/*' } });
    // 401/403/429 mean a real server is there but blocks bots; 404/410/5xx do not count as a working site.
    const ok = (res.status >= 200 && res.status < 400) || [401, 403, 429].includes(res.status);
    return { ok };
  } catch {
    return { ok: false };
  }
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export async function runCheckListing(
  pool: Pool,
  deps: CheckDeps = { probe: probeUrl },
  batch = 5,
): Promise<{ checked: number; approved: number; held: number }> {
  const result = { checked: 0, approved: 0, held: 0 };
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: settingRows } = await client.query(
      `select key, value from public.settings where key in ('blocked_domains', 'banned_words')`,
    );
    const settings = {
      blockedDomains: asStrings(settingRows.find((r) => r.key === 'blocked_domains')?.value),
      bannedWords: asStrings(settingRows.find((r) => r.key === 'banned_words')?.value),
    };

    const { rows: brands } = await client.query(
      `select b.id, b.slug, b.name, b.description, b.url, b.owner_id, coalesce(c.requires_review, false) as requires_review
         from public.brands b
         left join public.categories c on c.id = b.category_id
        where b.status = 'pending_review' and b.checked_at is null
        order by b.created_at
        limit $1
        for update of b skip locked`,
      [batch],
    );

    for (const b of brands) {
      const probe = await deps.probe(b.url);
      const decision = decideListing(
        { name: b.name, description: b.description, url: b.url, categoryRequiresReview: b.requires_review },
        settings,
        probe,
      );
      result.checked++;

      if (decision.outcome === 'approve') {
        await client.query(
          `update public.brands set status = 'active', checked_at = now(), review_reason = null where id = $1`,
          [b.id],
        );
        await client.query(
          `insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
           values ('listing_approved', $1, $2, $3) on conflict (dedupe_key) do nothing`,
          [b.owner_id, JSON.stringify({ brand_id: b.id, name: b.name, slug: b.slug }), `listing_approved:${b.id}`],
        );
        result.approved++;
      } else {
        await client.query(`update public.brands set checked_at = now(), review_reason = $2 where id = $1`, [
          b.id,
          decision.reasons.join(','),
        ]);
        result.held++;
      }
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return result;
}
