// Confounder flagging: observations inside a confounder window get flagged.
// Flagged observations render dimmed and can be excluded from verdict math.

import { Confounder, Observation } from './types';

/** True if timestamp falls inside any confounder window. Open windows (endsAt null) extend to ∞. */
export function isInConfounderWindow(t: number, confounders: Confounder[]): boolean {
  return confounders.some((c) => t >= c.startsAt && (c.endsAt === null || t <= c.endsAt));
}

/** Return observations with `flagged` recomputed against the confounder list. */
export function applyConfounderFlags(
  observations: Observation[],
  confounders: Confounder[]
): Observation[] {
  return observations.map((o) => {
    const flagged = isInConfounderWindow(o.observedAt, confounders);
    return flagged === o.flagged ? o : { ...o, flagged };
  });
}

/** Confounders overlapping a time range (for phase-level context in the verdict screen). */
export function confoundersOverlapping(
  confounders: Confounder[],
  rangeStart: number,
  rangeEnd: number
): Confounder[] {
  return confounders.filter(
    (c) => c.startsAt <= rangeEnd && (c.endsAt === null || c.endsAt >= rangeStart)
  );
}
