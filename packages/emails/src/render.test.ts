import { describe, expect, it } from 'vitest';
import { escapeHtml, isSupportedKind, renderEmail, SUPPORTED_KINDS } from './render';

const ctx = { siteUrl: 'https://brandbid.wtf' };

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });
});

describe('listing_approved', () => {
  const mail = renderEmail('listing_approved', { name: 'Acme', slug: 'acme' }, ctx)!;
  it('says the brand is live and links to its page and the dashboard', () => {
    expect(mail.subject).toBe('Acme is live on brandbid');
    expect(mail.html).toContain('https://brandbid.wtf/b/acme');
    expect(mail.html).toContain('https://brandbid.wtf/dash');
    expect(mail.text).toContain('https://brandbid.wtf/b/acme');
  });
  it('falls back to the home page when the slug is missing or unsafe', () => {
    expect(renderEmail('listing_approved', { name: 'A' }, ctx)!.html).toContain('href="https://brandbid.wtf"');
    expect(renderEmail('listing_approved', { name: 'A', slug: '"><script>' }, ctx)!.html).not.toContain('<script>');
  });
});

describe('listing_rejected', () => {
  const mail = renderEmail('listing_rejected', { name: 'Coin Co', reason: 'Looks like a scam', refund_cents: 3501 }, ctx)!;
  it('states the reason and the exact refund amount', () => {
    expect(mail.subject).toBe("We couldn't list Coin Co: your payment is being refunded");
    expect(mail.html).toContain('Looks like a scam');
    expect(mail.html).toContain('$35.01');
    expect(mail.text).toContain('$35.01');
    expect(mail.html).toContain('https://brandbid.wtf/list');
  });
  it('still says "full amount" if the amount is missing or not an integer', () => {
    for (const refund_cents of [undefined, 'oops', 12.5, null]) {
      expect(renderEmail('listing_rejected', { name: 'A', reason: 'r', refund_cents }, ctx)!.text).toContain('full amount');
    }
  });
});

describe('rate_floor_raised', () => {
  it('states the new rate and that existing visitor claims keep their rate', () => {
    const mail = renderEmail('rate_floor_raised', { name: 'Acme', rate_cents: 25 }, ctx)!;
    expect(mail.subject).toContain('rate was updated');
    expect(mail.text).toContain('$0.25');
    expect(mail.text).toContain('Existing visitor claims keep their original rate');
  });
});

describe('untrusted text', () => {
  const evil = `<img src=x onerror=alert(1)>"&'`;
  it('is escaped in every html field', () => {
    for (const kind of ['listing_approved', 'listing_rejected']) {
      const html = renderEmail(kind, { name: evil, reason: evil, slug: 'x' }, ctx)!.html;
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });
  it('cannot inject headers through the subject', () => {
    const subject = renderEmail('listing_approved', { name: 'Acme\r\nBcc: attacker@evil.com' }, ctx)!.subject;
    expect(subject).not.toMatch(/[\r\n]/);
  });
  it('caps a very long name in the subject', () => {
    expect(renderEmail('listing_approved', { name: 'x'.repeat(5000) }, ctx)!.subject.length).toBeLessThanOrEqual(200);
  });
});

describe('kinds', () => {
  it('knows which kinds it can send', () => {
    expect(isSupportedKind('listing_approved')).toBe(true);
    expect(isSupportedKind('listing_rejected')).toBe(true);
    expect(isSupportedKind('outbid')).toBe(true);
    expect(renderEmail('not_a_template', {}, ctx)).toBeNull();
  });

  it('renders every notification kind as both HTML and text', () => {
    for (const kind of SUPPORTED_KINDS) {
      const mail = renderEmail(kind, { name: 'Demo Brand', brand_name: 'Demo Brand', amount_cents: 1250, count: 2 }, ctx);
      expect(mail, kind).not.toBeNull();
      expect(mail!.subject.length, kind).toBeGreaterThan(0);
      expect(mail!.html, kind).toContain('<!doctype html>');
      expect(mail!.text.length, kind).toBeGreaterThan(0);
    }
  });

  it('escapes user-supplied notification details in both formats', () => {
    const evil = `<img src=x onerror=alert(1)>`;
    for (const kind of SUPPORTED_KINDS) {
      const mail = renderEmail(kind, { name: evil, brand_name: evil, reason: evil, reason_category: evil, details: evil }, ctx)!;
      expect(mail.html, kind).not.toContain('<img');
      expect(mail.subject, kind).not.toMatch(/[\r\n]/);
    }
  });
});
