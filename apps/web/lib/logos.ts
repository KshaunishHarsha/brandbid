import type { SupabaseClient } from '@supabase/supabase-js';
import { safeFetch, sniffImage, type SafeFetchOptions } from '@brandbid/shared';
import type { Database } from '@brandbid/db';

export const MAX_LOGO_BYTES = 1024 * 1024; // matches the bucket limit in supabase/config.toml

export function logoPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}

/** Validate by magic bytes (never by filename or Content-Type) and store as logos/<brandId>.<ext>. */
export async function saveLogo(
  admin: SupabaseClient<Database>,
  brandId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
  const kind = sniffImage(bytes);
  if (!kind) return null;

  const path = `${brandId}.${kind.ext}`;
  const { error } = await admin.storage.from('logos').upload(path, bytes, { contentType: kind.mime, upsert: true });
  if (error) return null;
  const { error: updateError } = await admin.from('brands').update({ logo_path: path }).eq('id', brandId);
  return updateError ? null : path;
}

/** Download the site's Open Graph image (SSRF-guarded) and host it ourselves. Best effort: null on any failure. */
export async function saveLogoFromUrl(
  admin: SupabaseClient<Database>,
  brandId: string,
  imageUrl: string,
  fetchOpts: SafeFetchOptions = {},
): Promise<string | null> {
  try {
    const res = await safeFetch(imageUrl, { timeoutMs: 5000, maxBytes: MAX_LOGO_BYTES, headers: { Accept: 'image/*' }, ...fetchOpts });
    if (res.status !== 200 || res.truncated) return null;
    return await saveLogo(admin, brandId, res.body);
  } catch {
    return null;
  }
}
