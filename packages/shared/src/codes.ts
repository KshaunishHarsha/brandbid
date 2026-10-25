// Promo link codes: 8 characters of base62 from a CSPRNG (BUILD section 11).
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const CODE_LENGTH = 8;
export const CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

export function randomCode(len = CODE_LENGTH): string {
  let out = '';
  while (out.length < len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of bytes) {
      if (b < 248) out += ALPHABET[b % 62]; // 248 = 62 * 4: rejects the biased tail
      if (out.length === len) break;
    }
  }
  return out;
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
