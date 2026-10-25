import { describe, expect, it } from 'vitest';
import type { Pool } from '../db.js';
import { runRefreshLeaderboards } from './refresh-leaderboards.js';

describe('promoter leaderboard refresh job', () => {
  it('refreshes both materialized views concurrently and outside a transaction', async () => {
    const queries: string[] = [];
    const pool = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } } as unknown as Pool;
    await expect(runRefreshLeaderboards(pool)).resolves.toEqual({ refreshed: 2 });
    expect(queries).toEqual([
      'refresh materialized view concurrently public.promoter_leaderboard_all_time',
      'refresh materialized view concurrently public.promoter_leaderboard_week',
    ]);
  });
});
