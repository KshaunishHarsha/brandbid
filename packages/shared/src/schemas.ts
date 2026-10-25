import { z } from 'zod';
import { CHANNELS } from './channels';
import { RESERVED_HANDLES } from './constants';

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(HANDLE_PATTERN, 'Use 3-20 characters: letters, numbers, underscore')
  .refine((h) => !RESERVED_HANDLES.has(h), 'That handle is reserved');

export const channelSchema = z.enum(CHANNELS);

/** Body of POST /api/q (BUILD section 13, step B5). */
export const qualifyBodySchema = z.object({
  click_id: z.uuid(),
  turnstile_token: z.string().min(1).max(4096),
  fingerprint: z.string().min(1).max(256).optional(),
  active_ms: z.number().int().min(0).max(3_600_000),
  interactions: z.number().int().min(0).max(1_000_000),
});
export type QualifyBody = z.infer<typeof qualifyBodySchema>;

/** Brand listing form (BUILD section 8). */
export const listingSchema = z.object({
  url: z.url().refine((u) => u.startsWith('https://'), 'URL must use https'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(160),
  categoryId: z.number().int().positive(),
});
export type ListingInput = z.infer<typeof listingSchema>;

/** Dollar string -> validated in cents by `toCents`; this checks the floor. */
export const rateCentsSchema = (floorCents: number) =>
  z.number().int().min(floorCents, `Rate must be at least ${floorCents} cents`).max(100_000);
