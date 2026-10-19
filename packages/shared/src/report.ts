import { z } from 'zod';

/** How many days after a trip ends it can still be reported. */
export const REPORT_WINDOW_DAYS = 14;

/** Longest report note, in characters. */
export const MAX_REPORT_NOTE_LENGTH = 1000;

export const REPORT_CATEGORIES = [
  'safety',
  'vehicle_damage',
  'overcharged',
  'no_show',
  'behaviour',
  'other',
] as const;

export const reportCategorySchema = z.enum(REPORT_CATEGORIES, 'Choose a category');

export type ReportCategory = z.infer<typeof reportCategorySchema>;

export const REPORT_STATUSES = ['open', 'resolved'] as const;

export const reportStatusSchema = z.enum(REPORT_STATUSES);

export type ReportStatus = z.infer<typeof reportStatusSchema>;

/** Body of `POST /tow-requests/:id/reports`. */
export const reportInputSchema = z.object({
  category: reportCategorySchema,
  note: z
    .string()
    .trim()
    .min(1, 'Tell us what happened')
    .max(MAX_REPORT_NOTE_LENGTH, 'Note is too long'),
});

export type ReportInput = z.input<typeof reportInputSchema>;

/** A report, as its reporter sees it. Dates are ISO strings. */
export const reportSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  category: reportCategorySchema,
  note: z.string(),
  status: reportStatusSchema,
  resolutionNote: z.string().nullish(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullish(),
});

export type Report = z.infer<typeof reportSchema>;
