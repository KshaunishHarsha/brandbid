/** Public origin of this deployment (used in emails and redirects). */
export function siteUrl(req?: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (req ? new URL(req.url).origin : 'http://localhost:3000');
}
