import { type AnyColumn, asc, desc, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  type Cursor,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
} from '../tow-requests/tow-requests.service.js';

/** `?cursor=&limit=` of every admin list. */
export const pageQuerySchema = z.object({
  cursor: z
    .string()
    .refine((cursor) => decodeCursor(cursor) !== null, 'Invalid cursor')
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export type PageQuery = z.output<typeof pageQuerySchema>;

/** A timestamp as text at microsecond precision, for the cursor (a JS `Date` keeps only ms). */
export const micros = (timestamp: SQL | AnyColumn) =>
  sql<string>`to_char(${timestamp} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * Keyset paging on `(sortKey, id)`, in `direction`: the condition for the rows after the
 * cursor and the matching order. Select `micros(sortKey)` to build the next cursor with
 * {@link toPage}.
 */
export function keyset(
  sortKey: SQL | AnyColumn,
  id: AnyColumn,
  cursor: string | undefined,
  direction: 'asc' | 'desc',
): { after: SQL | undefined; orderBy: SQL[] } {
  const position = cursor ? decodeCursor(cursor) : null;
  const op = direction === 'asc' ? sql`>` : sql`<`;
  const order = direction === 'asc' ? asc : desc;
  return {
    after: position
      ? sql`(${sortKey}, ${id}) ${op} (${position.createdAt}::timestamptz, ${position.id}::uuid)`
      : undefined,
    orderBy: [order(sortKey), order(id)],
  };
}

/**
 * The page from `limit + 1` rows: the first `limit` mapped through `map`, and a cursor
 * after the last of them if there are more.
 */
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  position: (row: Row) => Cursor,
  map: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const last = rows[limit - 1];
  return {
    items: rows.slice(0, limit).map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(position(last)) : null,
  };
}

/** `text` as a `LIKE` pattern that matches it literally, as a prefix. */
export const prefixPattern = (text: string) => `${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
