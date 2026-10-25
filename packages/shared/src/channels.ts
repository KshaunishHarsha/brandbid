export const CHANNELS = ['story', 'linkedin', 'x', 'link'] as const;
export type Channel = (typeof CHANNELS)[number];

export function isChannel(v: unknown): v is Channel {
  return typeof v === 'string' && (CHANNELS as readonly string[]).includes(v);
}
