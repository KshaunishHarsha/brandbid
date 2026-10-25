import { createMockProcessor } from './mock';
import { createRazorpayProcessor } from './razorpay';
import type { PaymentProcessor } from './types';

export type PaymentsMode = 'razorpay' | 'mock';

export function paymentsMode(): PaymentsMode {
  if (process.env.PAYMENTS_MODE === 'mock') {
    if (process.env.NODE_ENV === 'production') throw new Error('PAYMENTS_MODE=mock is not allowed in production');
    return 'mock';
  }
  return 'razorpay';
}

export function getProcessor(): PaymentProcessor {
  if (paymentsMode() === 'mock') return createMockProcessor();
  return createRazorpayProcessor({
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  });
}

/** Public key the browser needs to open Razorpay Checkout. */
export function checkoutKeyId(): string {
  return paymentsMode() === 'mock' ? 'mock' : (process.env.RAZORPAY_KEY_ID ?? '');
}
