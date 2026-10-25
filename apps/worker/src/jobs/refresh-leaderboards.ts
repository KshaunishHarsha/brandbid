import type { Pool } from '../db.js';

/** Refresh the promoter snapshots. Unique promoter indexes let PostgreSQL refresh without blocking readers. */
export async function runRefreshLeaderboards(pool: Pool): Promise<{ refreshed: number }> {
  await pool.query('refresh materialized view concurrently public.promoter_leaderboard_all_time');
  await pool.query('refresh materialized view concurrently public.promoter_leaderboard_week');
  return { refreshed: 2 };
}
