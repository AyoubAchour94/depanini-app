import type { CustomerOffer, Offer } from '@depanini/shared';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

import { driverProfiles, towOffers } from '../db/schema.js';
import { ratingColumns, type RatingRow, toRatingSummary } from '../ratings/rating-summary.js';

// How a `tow_offers` row becomes what each side sees, shared by the REST endpoints and
// the realtime events. The mappers pick their fields, so extra columns never leak out.

/** The columns of `tow_offers` the apps see. */
export const offerColumns = {
  id: towOffers.id,
  requestId: towOffers.requestId,
  fare: towOffers.fareTnd,
  etaMin: towOffers.etaMin,
  distanceToPickupM: towOffers.distanceToPickupM,
  status: towOffers.status,
  expiresAt: towOffers.expiresAt,
  createdAt: towOffers.createdAt,
};

type OfferRow = SelectResultFields<typeof offerColumns>;

/** An offer as its driver sees it. */
export function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    requestId: row.requestId,
    fare: row.fare,
    etaMin: row.etaMin,
    distanceToPickupM: row.distanceToPickupM,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** {@link offerColumns} plus who made the offer; needs an inner join on `driver_profiles`. */
export const customerOfferColumns = {
  ...offerColumns,
  driverFullName: driverProfiles.fullName,
  driverTruckType: driverProfiles.truckType,
  // What customers rated the driver, in the same query.
  ...ratingColumns(towOffers.driverId, 'customer'),
};

/** An offer as the customer sees it: the offer plus the driver's name, truck and rating. */
export function toCustomerOffer(
  row: OfferRow &
    RatingRow & {
      driverFullName: string;
      driverTruckType: CustomerOffer['driver']['truckType'];
    },
): CustomerOffer {
  return {
    ...toOffer(row),
    driver: {
      fullName: row.driverFullName,
      truckType: row.driverTruckType,
      rating: toRatingSummary(row),
    },
  };
}
