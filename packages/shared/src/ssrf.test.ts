import { describe, expect, it } from 'vitest';
import { bareHost, isIpLiteral, isPrivateIp, parseSafeUrl, UnsafeUrlError } from './ssrf';

describe('isPrivateIp: IPv4', () => {
  it.each([
    '0.0.0.0', '10.0.0.1', '10.255.255.255', '127.0.0.1', '127.1.2.3', '100.64.0.1', '100.127.255.255',
    '169.254.169.254', '169.254.0.1', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.5',
    '192.168.0.1', '192.168.255.255', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
  ])('%s is private/reserved', (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(['1.1.1.1', '8.8.8.8', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '192.167.1.1', '198.17.0.1', '223.255.255.255'])(
    '%s is public',
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );

  it.each(['256.1.1.1', '1.2.3', '1.2.3.4.5', 'abc', '', '1.2.3.-4'])('malformed %j is treated as unsafe', (ip) =>
    expect(isPrivateIp(ip)).toBe(true),
  );
});

describe('isPrivateIp: IPv6', () => {
  it.each([
    '::', '::1', '0:0:0:0:0:0:0:1', 'fc00::1', 'fd12:3456:789a::1', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'ff02::1',
    '2001:db8::1', '100::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a00:1', '::ffff:169.254.169.254',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '2002:a9fe:a9fe::', '::127.0.0.1', '[::1]',
  ])('%s is private/reserved', (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808'])(
    '%s is public',
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );

  it.each([':::', '1::2::3', 'gggg::1', '12345::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9'])('malformed %j is unsafe', (ip) =>
    expect(isPrivateIp(ip)).toBe(true),
  );
});

describe('isIpLiteral', () => {
  it('detects v4 and v6 literals only', () => {
    expect(isIpLiteral('8.8.8.8')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('[2606:4700::1111]')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
    expect(isIpLiteral('1.2.3.com')).toBe(false);
  });
});

describe('parseSafeUrl: accepts', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['example.com', 'https://example.com/'],
    ['  Example.COM/path?q=1#frag  '.trim(), 'https://example.com/path?q=1'],
    ['https://www.example.co.uk/a/b', 'https://www.example.co.uk/a/b'],
    ['https://example.com:443/x', 'https://example.com/x'],
    ['https://sub.domain.example.io.', 'https://sub.domain.example.io./'],
    ['https://xn--bcher-kva.example.xn--p1ai', 'https://xn--bcher-kva.example.xn--p1ai/'],
    ['https://bücher.de', 'https://xn--bcher-kva.de/'],
  ])('%s', (input, expected) => expect(parseSafeUrl(input).toString()).toBe(expected));

  it('strips the fragment', () => expect(parseSafeUrl('https://a.com/x#secret').hash).toBe(''));
});

describe('parseSafeUrl: rejects', () => {
  const bad = (input: string) => {
    try {
      parseSafeUrl(input);
    } catch (e) {
      expect(e).toBeInstanceOf(UnsafeUrlError);
      return (e as UnsafeUrlError).reason;
    }
    throw new Error(`expected "${input}" to be rejected`);
  };

  it.each([
    ['http://example.com', 'scheme'],
    ['ftp://example.com', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['gopher://example.com', 'scheme'],
    ['https://user:pass@example.com', 'credentials'],
    ['https://user@example.com', 'credentials'],
    ['https://example.com:8443', 'port'],
    ['https://example.com:80', 'port'],
    ['example.com:8080', 'port'],
    ['https://127.0.0.1', 'ip_literal'],
    ['https://8.8.8.8', 'ip_literal'],
    ['https://[::1]', 'ip_literal'],
    ['https://[::ffff:127.0.0.1]', 'ip_literal'],
    ['https://169.254.169.254/latest/meta-data', 'ip_literal'],
    ['https://2130706433', 'ip_literal'], // 127.0.0.1 as one decimal number
    ['https://0x7f.1', 'ip_literal'], // hex form
    ['https://0177.0.0.1', 'ip_literal'], // octal form
    ['https://127.1', 'ip_literal'], // short form
    ['https://localhost', 'hostname'],
    ['https://foo.localhost', 'hostname'],
    ['https://printer.local', 'hostname'],
    ['https://db.internal', 'hostname'],
    ['https://router.lan', 'hostname'],
    ['https://metadata', 'hostname'], // single label
    ['https://example', 'hostname'],
    ['https://a.b.c.123', 'invalid'], // numeric last label: the URL parser itself refuses it
    ['https://example.123', 'invalid'], // numeric TLD
    ['https://foo.test', 'hostname'],
    ['https://', 'invalid'],
    ['', 'length'],
    ['   ', 'length'],
    ['https://exa mple.com', 'whitespace'],
    ['https://exam\nple.com', 'whitespace'],
  ])('%s -> %s', (input, reason) => expect(bad(input)).toBe(reason));

  it('rejects overly long input', () => expect(bad('https://example.com/' + 'a'.repeat(2100))).toBe('length'));
  it('rejects control characters', () => expect(bad('https://exam\u0000ple.com')).toBe('whitespace'));
  it('trims surrounding whitespace, including a pasted trailing newline', () => {
    expect(parseSafeUrl('  https://example.com/\n').hostname).toBe('example.com');
  });
});

describe('bareHost', () => {
  it('lowercases and drops www and the trailing dot', () => {
    expect(bareHost(new URL('https://WWW.Example.com./x'))).toBe('example.com');
    expect(bareHost(new URL('https://app.example.com'))).toBe('app.example.com');
  });
});
