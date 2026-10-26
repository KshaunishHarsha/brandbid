/** No-key local development can qualify without Turnstile; deployed checks require a real token. */
export function hasTurnstileProof(required: boolean, token: string | null): boolean {
  return !required || Boolean(token);
}
