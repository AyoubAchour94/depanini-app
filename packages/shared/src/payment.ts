import { z } from 'zod';

/** How a trip is paid. Cash only in v1. */
export const PAYMENT_METHODS = ['cash'] as const;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * Where a payment stands. The driver's cash confirmation creates it as
 * `driver_confirmed`; the customer may then confirm it or dispute it.
 */
export const PAYMENT_STATUSES = ['driver_confirmed', 'customer_confirmed', 'disputed'] as const;

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** A receipt number, like `DPN-2026-000123`: the year, then a six-digit sequence number. */
export const RECEIPT_NO_PATTERN = /^DPN-\d{4}-\d{6}$/;

/** The receipt number for the `n`th receipt of `year`. */
export function formatReceiptNo(year: number, n: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError(`Invalid receipt year: ${year}`);
  }
  if (!Number.isInteger(n) || n < 1 || n > 999_999) {
    throw new RangeError(`Invalid receipt sequence number: ${n}`);
  }
  return `DPN-${year}-${String(n).padStart(6, '0')}`;
}

export const receiptNoSchema = z.string().regex(RECEIPT_NO_PATTERN);

/** The payment of a completed request, as the API returns it. Dates are ISO strings. */
export const paymentSchema = z.object({
  status: paymentStatusSchema,
  method: paymentMethodSchema,
  /** Whole dinars: the agreed fare. */
  amountTnd: z.number().int().positive(),
  receiptNo: receiptNoSchema,
  driverConfirmedAt: z.iso.datetime(),
  /** When the customer confirmed or disputed; null while unanswered. */
  customerAnsweredAt: z.iso.datetime().nullish(),
  disputeNote: z.string().nullish(),
});

export type Payment = z.infer<typeof paymentSchema>;

/** The part of a payment carried on a completed request in lists and details. */
export const paymentSummarySchema = paymentSchema.pick({
  status: true,
  amountTnd: true,
  receiptNo: true,
});

export type PaymentSummary = z.infer<typeof paymentSummarySchema>;

/** Body of `POST /driver/job/complete`: the driver confirms the agreed fare was paid in cash. */
export const completeJobInputSchema = z.object({
  cashReceived: z.literal(true, 'Confirm you received the cash'),
});

export type CompleteJobInput = z.input<typeof completeJobInputSchema>;

/** Body of `POST /tow-requests/:id/payment/dispute`. */
export const disputeInputSchema = z.object({
  note: z.string().trim().min(1, 'Tell us what went wrong').max(500, 'Note is too long'),
});

export type DisputeInput = z.input<typeof disputeInputSchema>;
