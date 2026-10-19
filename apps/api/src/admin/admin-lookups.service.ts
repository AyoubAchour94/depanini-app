import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminRating,
  AdminTripDetail,
  AdminTripItem,
  AdminTripPage,
  AdminUserDetail,
  AdminUserPage,
  TowRequestStatus,
} from '@depanini/shared';
import { and, asc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { alias, type PgColumn, type SelectedFields } from 'drizzle-orm/pg-core';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';
import { z } from 'zod';

import { DB, type Database } from '../db/database.module.js';
import {
  customerProfiles,
  driverProfiles,
  payments,
  ratings,
  reports,
  towOffers,
  towRequests,
  users,
} from '../db/schema.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { columns as requestColumns } from '../tow-requests/tow-request-rows.js';
import { keyset, micros, type PageQuery, prefixPattern, toPage } from './paging.js';
import { reportColumns, selectReports, toAdminReport } from './report-rows.js';

/** How many of a user's trips their detail shows. */
export const RECENT_TRIPS = 10;

const customerUsers = alias(users, 'customer_users');
const driverUsers = alias(users, 'driver_users');
const offerDrivers = alias(driverProfiles, 'offer_drivers');

/**
 * What a request's status really is now: an open request past its expiry is expired,
 * even before a read on the customer's side has marked it so.
 */
const effectiveStatus = (now: Date) =>
  sql<TowRequestStatus>`case when ${towRequests.status} = 'open' and ${towRequests.expiresAt} <= ${now.toISOString()}::timestamptz then 'expired' else ${towRequests.status} end`;

/** The prefix patterns a typed phone may match: as typed, and with `+` or `+216` in front of digits. */
function phoneMatches(phone: PgColumn, q: string): SQL[] {
  const compact = q.replace(/[\s.-]/g, '');
  if (!compact) return [];
  const forms = /^\d+$/.test(compact) ? [compact, `+${compact}`, `+216${compact}`] : [compact];
  return forms.map((form) => ilike(phone, prefixPattern(form)));
}

const tripItemColumns = (now: Date) => ({
  id: towRequests.id,
  status: effectiveStatus(now),
  customerName: customerProfiles.fullName,
  driverName: driverProfiles.fullName,
  pickupAddress: towRequests.pickupAddress,
  dropoffAddress: towRequests.dropoffAddress,
  agreedFare: towRequests.agreedFareTnd,
  createdAt: towRequests.createdAt,
  createdAtMicros: micros(towRequests.createdAt),
});

/** A row of {@link tripItemColumns}; the names come from left joins. */
type TripItemRow = Omit<
  SelectResultFields<ReturnType<typeof tripItemColumns>>,
  'customerName' | 'driverName'
> & { customerName: string | null; driverName: string | null };

function toTripItem(row: TripItemRow): AdminTripItem {
  return {
    id: row.id,
    status: row.status,
    customerName: row.customerName,
    driverName: row.driverName,
    pickupAddress: row.pickupAddress,
    dropoffAddress: row.dropoffAddress,
    agreedFare: row.agreedFare,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Looking up accounts and trips, for support. */
@Injectable()
export class AdminLookupsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  /** Accounts whose email or profile phone starts with `q` (any case), newest first. */
  async users(q: string | undefined, { cursor, limit }: PageQuery): Promise<AdminUserPage> {
    const page = keyset(users.createdAt, users.id, cursor, 'desc');
    const search = q
      ? or(
          ilike(users.email, prefixPattern(q)),
          ...phoneMatches(customerProfiles.phone, q),
          ...phoneMatches(driverProfiles.phone, q),
        )
      : undefined;
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        phone: sql<string | null>`coalesce(${customerProfiles.phone}, ${driverProfiles.phone})`,
        customerName: customerProfiles.fullName,
        driverName: driverProfiles.fullName,
        createdAt: users.createdAt,
        createdAtMicros: micros(users.createdAt),
      })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(and(search, page.after))
      .orderBy(...page.orderBy)
      .limit(limit + 1);
    return toPage(
      rows,
      limit,
      (row) => ({ createdAt: row.createdAtMicros, id: row.id }),
      ({ createdAtMicros: _, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString() }),
    );
  }

  /** One account: its profiles, how many trips and reports it has, and its latest trips. */
  async user(userId: string): Promise<AdminUserDetail> {
    const reportsAgainst = sql<number>`(
      select count(*) from ${reports}
      join ${towRequests} on ${towRequests.id} = ${reports.requestId}
      where ${reports.reporterUserId} <> ${users.id}
        and ((${reports.reporterRole} = 'customer' and ${towRequests.assignedDriverId} = ${users.id})
          or (${reports.reporterRole} = 'driver' and ${towRequests.customerId} = ${users.id}))
    )::int`;
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        customerName: customerProfiles.fullName,
        customerPhone: customerProfiles.phone,
        driverName: driverProfiles.fullName,
        driverPhone: driverProfiles.phone,
        truckType: driverProfiles.truckType,
        plateNumber: driverProfiles.plateNumber,
        verificationStatus: driverProfiles.verificationStatus,
        tripsAsCustomer: sql<number>`(select count(*) from ${towRequests} where ${towRequests.customerId} = ${users.id})::int`,
        tripsAsDriver: sql<number>`(select count(*) from ${towRequests} where ${towRequests.assignedDriverId} = ${users.id})::int`,
        reportsMade: sql<number>`(select count(*) from ${reports} where ${reports.reporterUserId} = ${users.id})::int`,
        reportsAgainst,
      })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(eq(users.id, userId));
    if (!row) throw new NotFoundException('User not found');

    const recent = await this.selectTrips()
      .where(or(eq(towRequests.customerId, userId), eq(towRequests.assignedDriverId, userId)))
      .orderBy(sql`${towRequests.createdAt} desc`, sql`${towRequests.id} desc`)
      .limit(RECENT_TRIPS);
    return {
      id: row.id,
      email: row.email,
      phone: row.customerPhone ?? row.driverPhone,
      customerName: row.customerName,
      driverName: row.driverName,
      createdAt: row.createdAt.toISOString(),
      customerProfile:
        row.customerName !== null
          ? { fullName: row.customerName, phone: row.customerPhone! }
          : null,
      driverProfile:
        row.driverName !== null
          ? {
              fullName: row.driverName,
              phone: row.driverPhone!,
              truckType: row.truckType!,
              plateNumber: row.plateNumber!,
              verificationStatus: row.verificationStatus!,
            }
          : null,
      counts: {
        tripsAsCustomer: row.tripsAsCustomer,
        tripsAsDriver: row.tripsAsDriver,
        reportsMade: row.reportsMade,
        reportsAgainst: row.reportsAgainst,
      },
      recentTrips: recent.map(toTripItem),
    };
  }

  /**
   * Trips, newest first, optionally of one status. `q` is a trip id, or the start (any
   * case) of a receipt number, or of the customer's or driver's name, email or phone.
   */
  async trips(
    status: TowRequestStatus | undefined,
    q: string | undefined,
    { cursor, limit }: PageQuery,
  ): Promise<AdminTripPage> {
    const now = this.now();
    const page = keyset(towRequests.createdAt, towRequests.id, cursor, 'desc');
    const rows = await this.selectTrips(now)
      .where(
        and(
          status ? sql`${effectiveStatus(now)} = ${status}` : undefined,
          q ? tripSearch(q) : undefined,
          page.after,
        ),
      )
      .orderBy(...page.orderBy)
      .limit(limit + 1);
    return toPage(
      rows,
      limit,
      (row) => ({ createdAt: row.createdAtMicros, id: row.id }),
      toTripItem,
    );
  }

  /** Everything about one trip: route, timeline, offers, payment, both ratings and reports. */
  async trip(requestId: string): Promise<AdminTripDetail> {
    const now = this.now();
    const [row] = await this.selectTrips(now, {
      ...requestColumns,
      cancelledAt: towRequests.cancelledAt,
      customerId: towRequests.customerId,
      customerPhone: customerProfiles.phone,
      driverId: towRequests.assignedDriverId,
      driverPhone: driverProfiles.phone,
      driverPlateNumber: driverProfiles.plateNumber,
      payment: {
        status: payments.status,
        method: payments.method,
        amountTnd: payments.amountTnd,
        receiptNo: payments.receiptNo,
        driverConfirmedAt: payments.driverConfirmedAt,
        customerAnsweredAt: payments.customerAnsweredAt,
        disputeNote: payments.disputeNote,
        resolutionNote: payments.resolutionNote,
        resolvedAt: payments.resolvedAt,
      },
    }).where(eq(towRequests.id, requestId));
    if (!row) throw new NotFoundException('Trip not found');

    const [offers, rated, tripReports] = await Promise.all([
      this.db
        .select({
          id: towOffers.id,
          driverName: sql<string>`coalesce(${offerDrivers.fullName}, '')`,
          fare: towOffers.fareTnd,
          status: towOffers.status,
          createdAt: towOffers.createdAt,
        })
        .from(towOffers)
        .leftJoin(offerDrivers, eq(offerDrivers.userId, towOffers.driverId))
        .where(eq(towOffers.requestId, requestId))
        .orderBy(asc(towOffers.createdAt), asc(towOffers.id)),
      this.db
        .select({
          raterRole: ratings.raterRole,
          stars: ratings.stars,
          tags: ratings.tags,
          comment: ratings.comment,
          createdAt: ratings.createdAt,
        })
        .from(ratings)
        .where(eq(ratings.requestId, requestId)),
      selectReports(this.db)
        .where(eq(reportColumns.requestId, requestId))
        .orderBy(asc(reportColumns.createdAt), asc(reportColumns.id)),
    ]);
    const rating = (role: 'customer' | 'driver'): AdminRating | null => {
      const found = rated.find((r) => r.raterRole === role);
      return found
        ? {
            stars: found.stars,
            tags: found.tags,
            comment: found.comment,
            createdAt: found.createdAt.toISOString(),
          }
        : null;
    };
    const iso = (date: Date | null) => date?.toISOString() ?? null;
    const { payment } = row;
    return {
      ...toTripItem(row),
      problemType: row.problemType,
      vehicleType: row.vehicleType,
      note: row.note,
      pickup: {
        latitude: Number(row.pickupLatitude),
        longitude: Number(row.pickupLongitude),
        address: row.pickupAddress,
      },
      dropoff: {
        latitude: Number(row.dropoffLatitude),
        longitude: Number(row.dropoffLongitude),
        address: row.dropoffAddress,
      },
      distanceM: row.distanceM,
      suggestedFare: row.suggestedFare,
      proposedFare: row.proposedFare,
      tripStage: row.tripStage,
      customer:
        row.customerName !== null
          ? { userId: row.customerId, fullName: row.customerName, phone: row.customerPhone }
          : null,
      driver:
        row.driverId && row.driverName !== null
          ? {
              userId: row.driverId,
              fullName: row.driverName,
              phone: row.driverPhone,
              plateNumber: row.driverPlateNumber,
            }
          : null,
      assignedAt: iso(row.assignedAt),
      enRouteAt: iso(row.enRouteAt),
      arrivedAt: iso(row.arrivedAt),
      towingAt: iso(row.towingAt),
      completedAt: iso(row.completedAt),
      cancelledAt: iso(row.cancelledAt),
      cancelledBy: row.cancelledBy,
      cancelReason: row.cancelReason,
      offers: offers.map((offer) => ({ ...offer, createdAt: offer.createdAt.toISOString() })),
      payment: payment
        ? {
            ...payment,
            driverConfirmedAt: payment.driverConfirmedAt.toISOString(),
            customerAnsweredAt: iso(payment.customerAnsweredAt),
            resolvedAt: iso(payment.resolvedAt),
          }
        : null,
      customerRating: rating('customer'),
      driverRating: rating('driver'),
      reports: tripReports.map(toAdminReport),
    };
  }

  /**
   * Requests with their customer, assigned driver and payment joined, selecting `extra`
   * plus the trip item columns (whose `status` is the {@link effectiveStatus}).
   */
  private selectTrips<Extra extends SelectedFields = Record<never, never>>(
    now = this.now(),
    extra = {} as Extra,
  ) {
    return this.db
      .select({ ...extra, ...tripItemColumns(now) })
      .from(towRequests)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, towRequests.customerId))
      .leftJoin(customerUsers, eq(customerUsers.id, towRequests.customerId))
      .leftJoin(driverProfiles, eq(driverProfiles.userId, towRequests.assignedDriverId))
      .leftJoin(driverUsers, eq(driverUsers.id, towRequests.assignedDriverId))
      .leftJoin(payments, eq(payments.requestId, towRequests.id));
  }
}

/** The search of `GET /admin/trips?q=`. */
function tripSearch(q: string): SQL | undefined {
  if (z.uuid().safeParse(q).success) return eq(towRequests.id, q);
  const pattern = prefixPattern(q);
  return or(
    ilike(payments.receiptNo, pattern),
    ilike(customerProfiles.fullName, pattern),
    ilike(driverProfiles.fullName, pattern),
    ilike(customerUsers.email, pattern),
    ilike(driverUsers.email, pattern),
    ...phoneMatches(customerProfiles.phone, q),
    ...phoneMatches(driverProfiles.phone, q),
  );
}
