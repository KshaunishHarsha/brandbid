import { describe, expect, it } from 'vitest';
import { isChannel } from './channels';
import {
  isPreviewFetcher, linkUrl, needsConsent, RESERVED_HANDLES,
} from './constants';
import { handleSchema, listingSchema, qualifyBodySchema, rateCentsSchema } from './schemas';

describe('handleSchema', () => {
  it('accepts valid handles and lowercases', () => {
    expect(handleSchema.parse('Kshaun_99')).toBe('kshaun_99');
    expect(handleSchema.parse('abc')).toBe('abc');
    expect(handleSchema.parse('a'.repeat(20))).toHaveLength(20);
  });
  it.each(['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'émoji', ''])('rejects %j', (h) => {
    expect(handleSchema.safeParse(h).success).toBe(false);
  });
  it('rejects reserved handles', () => {
    for (const h of RESERVED_HANDLES) {
      if (h.length >= 3) expect(handleSchema.safeParse(h).success).toBe(false);
    }
    expect(handleSchema.safeParse('Admin').success).toBe(false);
  });
});

describe('qualifyBodySchema', () => {
  const ok = {
    click_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    turnstile_token: 't',
    active_ms: 10_000,
    interactions: 3,
  };
  it('accepts a valid body, with or without fingerprint', () => {
    expect(qualifyBodySchema.safeParse(ok).success).toBe(true);
    expect(qualifyBodySchema.safeParse({ ...ok, fingerprint: 'abc' }).success).toBe(true);
  });
  it.each([
    { click_id: 'nope' },
    { turnstile_token: '' },
    { active_ms: -1 },
    { active_ms: 1.5 },
    { interactions: -1 },
  ])('rejects %j', (patch) => {
    expect(qualifyBodySchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

describe('listingSchema', () => {
  const ok = { url: 'https://example.com', name: 'Acme', description: 'Rockets for everyone', categoryId: 1 };
  it('accepts valid input', () => expect(listingSchema.safeParse(ok).success).toBe(true));
  it('requires https', () => {
    expect(listingSchema.safeParse({ ...ok, url: 'http://example.com' }).success).toBe(false);
  });
  it('rejects bad fields', () => {
    expect(listingSchema.safeParse({ ...ok, name: 'A' }).success).toBe(false);
    expect(listingSchema.safeParse({ ...ok, description: 'short' }).success).toBe(false);
    expect(listingSchema.safeParse({ ...ok, categoryId: 0 }).success).toBe(false);
  });
});

describe('rateCentsSchema', () => {
  it('enforces the floor', () => {
    const s = rateCentsSchema(10);
    expect(s.safeParse(10).success).toBe(true);
    expect(s.safeParse(9).success).toBe(false);
    expect(s.safeParse(10.5).success).toBe(false);
  });
});

describe('channels, consent, bots, links', () => {
  it('isChannel', () => {
    expect(isChannel('story')).toBe(true);
    expect(isChannel('instagram')).toBe(false);
    expect(isChannel(5)).toBe(false);
  });
  it('needsConsent covers EU, EEA, UK and ignores others', () => {
    for (const c of ['DE', 'fr', 'GB', 'NO', 'IS']) expect(needsConsent(c)).toBe(true);
    for (const c of ['US', 'IN', 'CH', '', null, undefined]) expect(needsConsent(c)).toBe(false);
  });
  it('isPreviewFetcher recognises link-preview bots only', () => {
    expect(isPreviewFetcher('Twitterbot/1.0')).toBe(true);
    expect(isPreviewFetcher('Mozilla/5.0 (compatible; LinkedInBot/1.0)')).toBe(true);
    expect(isPreviewFetcher('WhatsApp/2.23.20 A')).toBe(true);
    expect(isPreviewFetcher('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(false);
    expect(isPreviewFetcher(null)).toBe(false);
    expect(isPreviewFetcher('')).toBe(false);
  });
  it('linkUrl builds /go links and tolerates trailing slashes', () => {
    expect(linkUrl('k7Qx2aPm', 'https://brandbid.wtf')).toBe('https://brandbid.wtf/go/k7Qx2aPm');
    expect(linkUrl('k7Qx2aPm', 'https://brandbid.wtf/')).toBe('https://brandbid.wtf/go/k7Qx2aPm');
  });
});
