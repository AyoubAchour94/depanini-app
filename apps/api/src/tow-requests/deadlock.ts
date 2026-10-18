/** Whether Postgres aborted the transaction to break a deadlock (`40P01`). */
export function isDeadlock(error: unknown): boolean {
  return pgCode(error) === '40P01';
}

/** Whether Postgres aborted the transaction over a serialization failure (`40001`). */
export function isSerializationFailure(error: unknown): boolean {
  return pgCode(error) === '40001';
}

function pgCode(error: unknown): string | undefined {
  const e = (error as { cause?: { code?: string }; code?: string } | null) ?? {};
  return e.cause?.code ?? e.code;
}
