import { hashValue } from '@/lib/request';

// A guest who just paid has no session yet, but should see "under review / live". This token proves they
// came from the checkout that created the brand. It grants read access to the brand's status only.
export async function statusToken(brandId: string): Promise<string> {
  return (await hashValue(`listing-status:${brandId}`)).slice(0, 32);
}

export async function verifyStatusToken(brandId: string, token: string): Promise<boolean> {
  const expected = await statusToken(brandId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

