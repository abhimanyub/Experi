// Phase engine: ordering, current phase resolution, transitions, crossover support.
// Pure functions — callers persist returned copies.

import { DAY_MS, MIN_PHASE_DAYS, Phase } from './types';

export function sortPhases(phases: Phase[]): Phase[] {
  return [...phases].sort((a, b) => a.sequence - b.sequence);
}

export function currentPhase(phases: Phase[]): Phase | null {
  return sortPhases(phases).find((p) => p.startedAt !== null && p.endedAt === null) ?? null;
}

export function nextPhase(phases: Phase[]): Phase | null {
  return sortPhases(phases).find((p) => p.startedAt === null) ?? null;
}

export function allPhasesDone(phases: Phase[]): boolean {
  return phases.length > 0 && phases.every((p) => p.endedAt !== null);
}

/** Planned end of an active phase, or null if not started. */
export function plannedEnd(phase: Phase): number | null {
  if (phase.startedAt === null) return null;
  return phase.startedAt + phase.plannedDays * DAY_MS;
}

/** True when an active phase has run its planned duration. */
export function shouldAutoTransition(phase: Phase, now: number): boolean {
  const end = plannedEnd(phase);
  return end !== null && phase.endedAt === null && now >= end;
}

/** Whole days a phase actually ran (>= 0). Uses now for still-open phases. */
export function actualDays(phase: Phase, now: number): number {
  if (phase.startedAt === null) return 0;
  const end = phase.endedAt ?? now;
  return Math.floor((end - phase.startedAt) / DAY_MS);
}

export interface TransitionResult {
  updated: Phase[]; // full phase list with changes applied
  closed: Phase | null; // phase that just ended
  opened: Phase | null; // phase that just started (null when experiment is done)
  done: boolean; // all phases ended
  closedActualDays: number | null;
}

/** Start the experiment: opens the first phase. Throws if any phase already started. */
export function startFirstPhase(phases: Phase[], now: number): TransitionResult {
  if (phases.some((p) => p.startedAt !== null)) {
    throw new Error('Experiment already started');
  }
  const sorted = sortPhases(phases);
  if (sorted.length === 0) throw new Error('No phases defined');
  const first = { ...sorted[0], startedAt: now };
  const updated = phases.map((p) => (p.id === first.id ? first : p));
  return { updated, closed: null, opened: first, done: false, closedActualDays: null };
}

/**
 * Close the current phase and open the next.
 * Early transition (before plannedDays) requires confirmEarly — the UI must
 * confirm with the user; actual days are recorded via startedAt/endedAt.
 */
export function transitionToNext(
  phases: Phase[],
  now: number,
  opts: { confirmEarly?: boolean } = {}
): TransitionResult {
  const active = currentPhase(phases);
  if (!active) throw new Error('No active phase to transition from');
  if (!shouldAutoTransition(active, now) && !opts.confirmEarly) {
    throw new Error('Phase has not reached planned duration; early transition requires confirmation');
  }
  const closed = { ...active, endedAt: now };
  let updated = phases.map((p) => (p.id === closed.id ? closed : p));

  const upcoming = nextPhase(updated);
  let opened: Phase | null = null;
  if (upcoming) {
    opened = { ...upcoming, startedAt: now };
    updated = updated.map((p) => (p.id === opened!.id ? opened! : p));
  }
  return {
    updated,
    closed,
    opened,
    done: allPhasesDone(updated),
    closedActualDays: actualDays(closed, now),
  };
}

/**
 * Resolve which phase an observation timestamp belongs to.
 * Open phase covers [startedAt, ∞) until ended. Returns null if t precedes all phases.
 */
export function phaseForTimestamp(phases: Phase[], t: number): Phase | null {
  const started = sortPhases(phases).filter((p) => p.startedAt !== null);
  // Walk newest-first: first phase whose start <= t wins; its end bounds it unless open.
  for (let i = started.length - 1; i >= 0; i--) {
    const p = started[i];
    if (t >= p.startedAt! && (p.endedAt === null || t < p.endedAt)) return p;
  }
  // Timestamp may fall exactly on a boundary or after a closed final phase — clamp to last ended phase containing/preceding t.
  const last = started[started.length - 1];
  if (last && last.endedAt !== null && t >= last.endedAt) return last;
  return null;
}

/** Validation for the wizard: warn (not block) below the minimum phase duration. */
export function phaseDurationWarnings(phases: Phase[]): string[] {
  return phases
    .filter((p) => p.plannedDays < MIN_PHASE_DAYS)
    .map(
      (p) =>
        `Phase "${p.label}" is planned for ${p.plannedDays} day(s) — fewer than the recommended minimum of ${MIN_PHASE_DAYS}. Short phases invite one-good-day conclusions.`
    );
}

/** Build an alternating A/B/A/B phase plan (crossover). */
export function buildAlternatingPhases(
  experimentId: string,
  labelA: string,
  labelB: string,
  daysEach: number,
  rounds: number, // rounds=2 -> A B A B
  makeId: () => string,
  startSequence = 0
): Phase[] {
  const phases: Phase[] = [];
  for (let r = 0; r < rounds; r++) {
    for (const [label, type] of [
      [labelA, 'baseline'],
      [labelB, 'intervention'],
    ] as const) {
      phases.push({
        id: makeId(),
        experimentId,
        type,
        label,
        sequence: startSequence + phases.length,
        plannedDays: daysEach,
        startedAt: null,
        endedAt: null,
      });
    }
  }
  return phases;
}
