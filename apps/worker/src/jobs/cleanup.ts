import type { Pool } from '../db.js';

/** Removes unpaid drafts and the throwaway accounts made for them (D45). SQL: cleanup_stale_listings. */
export async function runCleanup(pool: Pool, days = 7): Promise<{ drafts_deleted: number; users_deleted: number }> {
  const { rows } = await pool.query(`select public.cleanup_stale_listings($1) as r`, [days]);
  return rows[0].r;
}
