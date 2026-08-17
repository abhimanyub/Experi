import { describe, expect, it } from 'vitest';
import {
  applyConfounderFlags,
  confoundersOverlapping,
  isInConfounderWindow,
} from './confounders';
import { Confounder, DAY_MS, Observation } from './types';

const T0 = 1_700_000_000_000;

const sickTueThu: Confounder = {
  id: 'c1',
  experimentId: 'e1',
  note: 'Was sick Tue–Thu',
  startsAt: T0 + 1 * DAY_MS,
  endsAt: T0 + 3 * DAY_MS,
};
const openEnded: Confounder = {
  id: 'c2',
  experimentId: 'e1',
  note: 'Travel, ongoing',
  startsAt: T0 + 10 * DAY_MS,
  endsAt: null,
};

function obs(i: number, flagged = false): Observation {
  return {
    id: `o${i}`,
    metricId: 'm1',
    phaseId: 'p1',
    value: 3,
    note: null,
    observedAt: T0 + i * DAY_MS,
    backfilled: false,
    flagged,
  };
}

describe('isInConfounderWindow', () => {
  it('flags inside a closed window, inclusive bounds', () => {
    expect(isInConfounderWindow(T0 + 1 * DAY_MS, [sickTueThu])).toBe(true);
    expect(isInConfounderWindow(T0 + 3 * DAY_MS, [sickTueThu])).toBe(true);
    expect(isInConfounderWindow(T0 + 2 * DAY_MS, [sickTueThu])).toBe(true);
  });

  it('does not flag outside the window', () => {
    expect(isInConfounderWindow(T0, [sickTueThu])).toBe(false);
    expect(isInConfounderWindow(T0 + 4 * DAY_MS, [sickTueThu])).toBe(false);
  });

  it('open-ended window extends forward indefinitely', () => {
    expect(isInConfounderWindow(T0 + 100 * DAY_MS, [openEnded])).toBe(true);
    expect(isInConfounderWindow(T0 + 9 * DAY_MS, [openEnded])).toBe(false);
  });
});

describe('applyConfounderFlags', () => {
  it('recomputes flags both directions', () => {
    const observations = [obs(0), obs(2), obs(5, true)]; // o5 stale-flagged
    const result = applyConfounderFlags(observations, [sickTueThu]);
    expect(result.map((o) => o.flagged)).toEqual([false, true, false]);
  });

  it('returns same object when flag unchanged (no needless churn)', () => {
    const o = obs(0);
    const [result] = applyConfounderFlags([o], [sickTueThu]);
    expect(result).toBe(o);
  });
});

describe('confoundersOverlapping', () => {
  it('finds windows overlapping a phase range', () => {
    const hits = confoundersOverlapping([sickTueThu, openEnded], T0, T0 + 7 * DAY_MS);
    expect(hits.map((c) => c.id)).toEqual(['c1']);
  });

  it('open-ended confounder overlaps any later range', () => {
    const hits = confoundersOverlapping([openEnded], T0 + 50 * DAY_MS, T0 + 60 * DAY_MS);
    expect(hits).toHaveLength(1);
  });
});
