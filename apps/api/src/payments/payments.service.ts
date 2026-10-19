import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { formatReceiptNo, type Receipt, type TowRequest } from '@depanini/shared';
import { and, eq, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module.js';
import { customerProfiles, driverProfiles, payments, towRequests } from '../db/schema.js';
import { TripEvents } from '../realtime/trip-events.service.js';
import { CLOCK, type Clock } from '../tow-requests/clock.js';
import { columns, selectTowRequests, toTowRequest } from '../tow-requests/tow-request-rows.js';

/**
 * Records the cash payment of a request the caller has just completed, in the caller's
 * transaction: the agreed fare, `driver_confirmed`, and the next receipt number. The year of
 * the number is that of `completed_at` in Africa/Tunis, worked out by Postgres so the
 * 31 December / 1 January boundary follows the Tunisian calendar, not the server's.
 */
export async function recordCashPayment(
  tx: Pick<Database, 'insert' | 'execute'>,
  { requestId, amountTnd, now }: { requestId: string; amountTnd: number; now: Date },
): Promise<void> {
  const { rows } = await tx.execute<{ year: number; n: string }>(
    sql`select extract(year from ${towRequests.completedAt} at time zone 'Africa/Tunis')::int as year,
      nextval('receipt_seq') as n
      from ${towRequests} where ${towRequests.id} = ${requestId}`,
  );
  const { year, n } = rows[0]!;
  await tx.insert(payments).values({
    requestId,
    amountTnd,
    method: 'cash',
    status: 'driver_confirmed',
    receiptNo: formatReceiptNo(Number(year), Number(n)),
    driverConfirmedAt: now,
  });
}

/** What the customer says about the cash they paid, and the receipt both parties may read. */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly events: TripEvents,
  ) {}

  /** The customer says they paid: `customer_confirmed`. */
  confirm(customerId: string, requestId: string): Promise<TowRequest> {
    return this.answer(customerId, requestId, { status: 'customer_confirmed' });
  }

  /** The customer reports a problem: `disputed`, with a note for support. It never blocks the driver. */
  dispute(customerId: string, requestId: string, note: string): Promise<TowRequest> {
    return this.answer(customerId, requestId, { status: 'disputed', disputeNote: note });
  }

  /**
   * The receipt of a completed request, for its customer or its assigned driver. `404` for
   * anyone else and until the request is completed and paid. It selects its own columns and
   * never the phone or the plate, so they cannot leak into it.
   */
  async receipt(accountId: string, requestId: string): Promise<Receipt> {
    const [row] = await this.db
      .select({
        receiptNo: payments.receiptNo,
        amountTnd: payments.amountTnd,
        method: payments.method,
        completedAt: towRequests.completedAt,
        pickupLatitude: columns.pickupLatitude,
        pickupLongitude: columns.pickupLongitude,
        pickupAddress: towRequests.pickupAddress,
        dropoffLatitude: columns.dropoffLatitude,
        dropoffLongitude: columns.dropoffLongitude,
        dropoffAddress: towRequests.dropoffAddress,
        distanceM: towRequests.distanceM,
        vehicleType: towRequests.vehicleType,
        problemType: towRequests.problemType,
        assignedAt: towRequests.assignedAt,
        enRouteAt: towRequests.enRouteAt,
        arrivedAt: towRequests.arrivedAt,
        towingAt: towRequests.towingAt,
        driverFullName: driverProfiles.fullName,
        driverTruckType: driverProfiles.truckType,
        customerFullName: customerProfiles.fullName,
      })
      .from(towRequests)
      .innerJoin(payments, eq(payments.requestId, towRequests.id))
      .innerJoin(driverProfiles, eq(driverProfiles.userId, towRequests.assignedDriverId))
      .innerJoin(customerProfiles, eq(customerProfiles.userId, towRequests.customerId))
      .where(
        and(
          eq(towRequests.id, requestId),
          eq(towRequests.status, 'completed'),
          or(eq(towRequests.customerId, accountId), eq(towRequests.assignedDriverId, accountId)),
        ),
      );
    if (!row?.completedAt) throw new NotFoundException('Receipt not found');

    return {
      receiptNo: row.receiptNo,
      completedAt: row.completedAt.toISOString(),
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
      vehicleType: row.vehicleType,
      problemType: row.problemType,
      agreedFare: row.amountTnd,
      method: row.method,
      assignedAt: row.assignedAt?.toISOString() ?? null,
      enRouteAt: row.enRouteAt?.toISOString() ?? null,
      arrivedAt: row.arrivedAt?.toISOString() ?? null,
      towingAt: row.towingAt?.toISOString() ?? null,
      driver: { fullName: row.driverFullName, truckType: row.driverTruckType },
      customer: { fullName: row.customerFullName },
    };
  }

  /**
   * Records the customer's one answer. `404` unless the request is the caller's, `409`
   * unless it is completed with a payment nobody has answered yet. Locks the request row
   * first, the same first lock as complete, accept and cancel.
   */
  private async answer(
    customerId: string,
    requestId: string,
    change: { status: 'customer_confirmed' } | { status: 'disputed'; disputeNote: string },
  ): Promise<TowRequest> {
    const now = this.now();
    const answered = await this.db.transaction(async (tx) => {
      const [request] = await tx
        .select({ customerId: towRequests.customerId, status: towRequests.status })
        .from(towRequests)
        .where(eq(towRequests.id, requestId))
        .for('update');
      if (request?.customerId !== customerId) throw new NotFoundException('Tow request not found');
      if (request.status !== 'completed') {
        throw new ConflictException('Only a completed trip can be answered');
      }

      const updated = await tx
        .update(payments)
        .set({ ...change, customerAnsweredAt: now })
        .where(and(eq(payments.requestId, requestId), eq(payments.status, 'driver_confirmed')))
        .returning({ requestId: payments.requestId });
      if (updated.length === 0) {
        throw new ConflictException('This payment was already answered, or has none');
      }
      const [row] = await selectTowRequests(tx).where(eq(towRequests.id, requestId));
      return toTowRequest(row!);
    });
    await this.events.requestsUpdated([requestId], { type: 'payment_answered' });
    return answered;
  }
}
