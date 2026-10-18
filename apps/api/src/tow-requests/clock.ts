/** Injection token for the clock: a function returning the current time. Tests move it. */
export const CLOCK = Symbol('CLOCK');

export type Clock = () => Date;
