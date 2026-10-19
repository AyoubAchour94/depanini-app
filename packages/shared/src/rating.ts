import { z } from 'zod';

/** How many days after completion a trip can still be rated. */
export const RATING_WINDOW_DAYS = 7;

/** Below this many ratings an average is not shown ("New"). */
export const RATING_NEW_THRESHOLD = 3;

/** Most tags on one rating. */
export const MAX_RATING_TAGS = 5;

/** Longest rating comment, in characters. */
export const MAX_RATING_COMMENT_LENGTH = 300;

/** Ratings of this many stars or fewer need a tag. */
const LOW_STARS = 2;

/** Tags a customer can give a driver. Display labels live in the app. */
export const CUSTOMER_RATING_TAGS = [
  'on_time',
  'careful_with_vehicle',
  'friendly',
  'fair_price',
  'late',
  'rough_handling',
  'rude',
] as const;

/** Tags a driver can give a customer. */
export const DRIVER_RATING_TAGS = [
  'clear_location',
  'ready_on_time',
  'friendly',
  'wrong_location',
  'made_me_wait',
  'rude',
] as const;

export const customerRatingTagSchema = z.enum(CUSTOMER_RATING_TAGS);
export const driverRatingTagSchema = z.enum(DRIVER_RATING_TAGS);

export type CustomerRatingTag = z.infer<typeof customerRatingTagSchema>;
export type DriverRatingTag = z.infer<typeof driverRatingTagSchema>;

/** Any tag, from either side. */
export const ratingTagSchema = z.union([customerRatingTagSchema, driverRatingTagSchema]);

export type RatingTag = z.infer<typeof ratingTagSchema>;

const starsSchema = z
  .number('Pick a rating')
  .int('Pick a rating')
  .min(1, 'Pick a rating')
  .max(5, 'Pick a rating');

/** The rating input for one side: its own tags, unique, and the low-star rule. */
function ratingInputSchemaFor<const T extends readonly [string, ...string[]]>(tags: T) {
  return z
    .object({
      stars: starsSchema,
      tags: z
        .array(z.enum(tags))
        .max(MAX_RATING_TAGS, `Pick at most ${MAX_RATING_TAGS} tags`)
        .default([]),
      /** Trimmed; a blank comment counts as none. */
      comment: z
        .string()
        .trim()
        .max(MAX_RATING_COMMENT_LENGTH, 'Comment is too long')
        .transform((value) => value || undefined)
        .optional(),
    })
    .superRefine((rating, ctx) => {
      if (new Set(rating.tags).size !== rating.tags.length) {
        ctx.addIssue({ code: 'custom', path: ['tags'], message: 'Each tag can only be used once' });
      }
      if (rating.stars <= LOW_STARS && rating.tags.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['tags'],
          message: 'Tell us what went wrong: pick at least one tag',
        });
      }
    });
}

/** Body of `POST /tow-requests/:id/rating` when a customer rates the driver. */
export const customerRatingInputSchema = ratingInputSchemaFor(CUSTOMER_RATING_TAGS);

/** Body of `POST /tow-requests/:id/rating` when a driver rates the customer. */
export const driverRatingInputSchema = ratingInputSchemaFor(DRIVER_RATING_TAGS);

export type CustomerRatingInput = z.input<typeof customerRatingInputSchema>;
export type DriverRatingInput = z.input<typeof driverRatingInputSchema>;

/**
 * Someone's average rating and how many ratings it is built from. The average is
 * rounded to one decimal, and null (or missing) below `RATING_NEW_THRESHOLD`.
 */
export const ratingSummarySchema = z.object({
  average: z
    .number()
    .min(1)
    .max(5)
    .transform((value) => Math.round(value * 10) / 10)
    .nullish(),
  count: z.number().int().nonnegative(),
});

export type RatingSummary = z.infer<typeof ratingSummarySchema>;

/**
 * Response of `GET /tow-requests/:id/rating`: my rating of the other side, if any,
 * and whether they rated me (never their stars). Dates are ISO strings.
 */
export const myRatingSchema = z.object({
  mine: z
    .object({
      stars: starsSchema,
      tags: z.array(ratingTagSchema),
      comment: z.string().nullish(),
    })
    .nullable(),
  otherSideRated: z.boolean(),
  canRate: z.boolean(),
  /** The end of the rating window. */
  deadline: z.iso.datetime(),
});

export type MyRating = z.infer<typeof myRatingSchema>;
