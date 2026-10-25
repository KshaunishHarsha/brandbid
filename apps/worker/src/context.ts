import { createMailer, type Mailer } from '@brandbid/emails';
import { createMockProcessor, createRazorpayProcessor, type PaymentProcessor } from '@brandbid/payments';
import { createPool, type Pool } from './db.js';
import { env } from './env.js';

/** Everything a job needs from the outside world. Jobs receive it, so tests can pass fakes. */
export type JobContext = { pool: Pool; send: Mailer; processor: PaymentProcessor; siteUrl: string };

export function buildContext(): JobContext {
  return {
    pool: createPool(),
    send: createMailer({ resendApiKey: env.resendApiKey, from: env.emailFrom, mailpitUrl: env.mailpitUrl }),
    processor: env.paymentsMode === 'mock' ? createMockProcessor() : createRazorpayProcessor(env.razorpay),
    siteUrl: env.siteUrl,
  };
}
