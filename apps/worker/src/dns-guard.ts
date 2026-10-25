import { lookup } from 'node:dns/promises';
import { isPrivateIp, UnsafeUrlError } from '@brandbid/shared';

/**
 * Second SSRF layer for Node (the worker): resolve the hostname and refuse if ANY answer is a private,
 * loopback, link-local or reserved address. Run before every hop of a safeFetch.
 */
export async function resolveCheck(hostname: string): Promise<void> {
  let answers: Array<{ address: string }>;
  try {
    answers = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError('dns_unresolvable');
  }
  if (answers.length === 0) throw new UnsafeUrlError('dns_unresolvable');
  if (answers.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError('dns_private');
}
