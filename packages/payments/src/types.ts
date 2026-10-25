// Payment processor boundary (BUILD section 4, D29). Razorpay is the first implementation;
// everything outside lib/payments talks to this interface so a processor swap stays cheap.

export type CheckoutOrder = {
  /** Processor order id, passed to the client-side checkout */
  orderId: string;
  amountCents: number;
  currency: 'USD';
};

/** A captured payment, normalised from a processor webhook. */
export type CapturedPayment = {
  processor: string;
  paymentId: string;
  orderId: string | null;
  amountCents: number;
  currency: string;
  email: string | null;
  /** Card/payment-method fingerprint if the processor exposes one (fraud signal R9) */
  fingerprint: string | null;
  notes: Record<string, string>;
};

export interface PaymentProcessor {
  readonly name: string;
  createOrder(input: {
    amountCents: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<CheckoutOrder>;
  /** True only if `signature` is the processor's valid signature over the exact raw body. */
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>;
  /** Returns the captured payment, or null for events we do not act on. */
  parseEvent(json: unknown): CapturedPayment | null;
  fetchOrderNotes(orderId: string): Promise<Record<string, string>>;
  /** Refund a payment in full (amountCents) or part. Returns the refund reference. */
  refund(paymentId: string, amountCents: number, reason: string): Promise<string>;
}
