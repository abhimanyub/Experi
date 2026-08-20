import { describe, expect, it } from 'vitest';
import { DAY_MS, Metric, Observation, Phase } from './types';
import {
  compareMetricAcrossPhases,
  comparisonValue,
  contextLine,
  summarizePhase,
} from './verdict-math';

const T0 = 1_700_000_000_000;

const phaseA: Phase = {
  id: 'pa',
  experimentId: 'e1',
  type: 'baseline',
  label: 'A',
  sequence: 0,
  plannedDays: 7,
  startedAt: T0,
  endedAt: T0 + 7 * DAY_MS,
};
const phaseB: Phase = {
  id: 'pb',
  experimentId: 'e1',
  type: 'intervention',
  label: 'B',
  sequence: 1,
  plannedDays: 14,
  startedAt: T0 + 7 * DAY_MS,
  endedAt: T0 + 21 * DAY_MS,
};

function metric(type: Metric['type']): Metric {
  return {
    id: 'm1',
    experimentId: 'e1',
    name: 'M',
    type,
    config: {},
    schedule: { onDemand: true },
    direction: 'higher_is_better',
  };
}

function obs(phaseId: string, value: number, i: number, flagged = false): Observation {
  return {
    id: `o-${phaseId}-${i}`,
    metricId: 'm1',
    phaseId,
    value,
    note: null,
    observedAt: T0 + i * DAY_MS,
    backfilled: false,
    flagged,
    missed: false,
  };
}

describe('summarizePhase — scale/numeric/duration', () => {
  it('computes mean/min/max/n', () => {
    const m = metric('scale');
    const observations = [obs('pa', 3, 0), obs('pa', 4, 1), obs('pa', 2, 2)];
    const s = summarizePhase(m, phaseA, observations);
    expect(s.n).toBe(3);
    expect(s.mean).toBe(3);
    expect(s.min).toBe(2);
    expect(s.max).toBe(4);
    expect(s.pctTrue).toBeNull();
  });

  it('excludeFlagged drops confounded observations but reports the count', () => {
    const m = metric('scale');
    const observations = [obs('pa', 5, 0, true), obs('pa', 3, 1)];
    const s = summarizePhase(m, phaseA, observations, { excludeFlagged: true });
    expect(s.n).toBe(1);
    expect(s.nFlagged).toBe(1);
    expect(s.mean).toBe(3);
  });

  it('empty phase yields nulls', () => {
    const s = summarizePhase(metric('numeric'), phaseA, []);
    expect(s.n).toBe(0);
    expect(s.mean).toBeNull();
  });
});

describe('summarizePhase — boolean', () => {
  it('computes % true', () => {
    const m = metric('boolean');
    const observations = [obs('pa', 1, 0), obs('pa', 1, 1), obs('pa', 0, 2), obs('pa', 1, 3)];
    const s = summarizePhase(m, phaseA, observations);
    expect(s.pctTrue).toBe(75);
    expect(s.mean).toBeNull();
  });
});

describe('summarizePhase — currency', () => {
  it('computes sum, per-day, per-unit', () => {
    const m = metric('currency');
    const observations = [obs('pa', 5.5, 0), obs('pa', 6.5, 1), obs('pa', 2, 2)];
    const s = summarizePhase(m, phaseA, observations);
    expect(s.sum).toBe(14);
    expect(s.perDay).toBe(2); // 14 over 7 actual days
    expect(s.perUnit).toBe(4.67);
  });
});

describe('compareMetricAcrossPhases', () => {
  it('computes consecutive deltas absolute + %', () => {
    const m = metric('scale');
    const observations = [
      obs('pa', 3, 0),
      obs('pa', 3.2, 1),
      obs('pb', 4, 8),
      obs('pb', 3.8, 9),
    ];
    const cmp = compareMetricAcrossPhases(m, [phaseA, phaseB], observations);
    expect(cmp.deltas).toHaveLength(1);
    expect(cmp.deltas[0].absolute).toBe(0.8);
    expect(cmp.deltas[0].percent).toBe(25.81);
  });

  it('currency compares on per-day so unequal phase lengths stay fair', () => {
    const m = metric('currency');
    // A: $28 over 7d = 4/day. B: $28 over 14d = 2/day.
    const observations = [obs('pa', 28, 0), obs('pb', 28, 8)];
    const cmp = compareMetricAcrossPhases(m, [phaseA, phaseB], observations);
    expect(comparisonValue(m, cmp.phases[0])).toBe(4);
    expect(comparisonValue(m, cmp.phases[1])).toBe(2);
    expect(cmp.deltas[0].absolute).toBe(-2);
    expect(cmp.deltas[0].percent).toBe(-50);
  });

  it('null delta when a phase has no data', () => {
    const m = metric('scale');
    const cmp = compareMetricAcrossPhases(m, [phaseA, phaseB], [obs('pb', 4, 8)]);
    expect(cmp.deltas[0].absolute).toBeNull();
    expect(cmp.deltas[0].percent).toBeNull();
  });

  it('percent is null when baseline mean is 0', () => {
    const m = metric('numeric');
    const cmp = compareMetricAcrossPhases(m, [phaseA, phaseB], [
      obs('pa', 0, 0),
      obs('pb', 5, 8),
    ]);
    expect(cmp.deltas[0].absolute).toBe(5);
    expect(cmp.deltas[0].percent).toBeNull();
  });
});

describe('contextLine', () => {
  it('produces the honest-context sentence with flag count', () => {
    const m = metric('scale');
    const observations = [
      obs('pa', 3, 0),
      obs('pa', 3.2, 1, true),
      obs('pb', 4, 8),
      obs('pb', 3.8, 9),
    ];
    const cmp = compareMetricAcrossPhases(m, [phaseA, phaseB], observations);
    const line = contextLine(m, cmp);
    expect(line).toContain("B averaged 3.9 vs A's 3.1");
    expect(line).toContain('2 vs 2 observations');
    expect(line).toContain('1 observation was flagged');
  });

  it('degrades gracefully with insufficient data', () => {
    const m = metric('scale');
    const cmp = compareMetricAcrossPhases(m, [phaseA, phaseB], []);
    expect(contextLine(m, cmp)).toBe('Not enough data to compare phases.');
  });
});

describe('missed markers', () => {
  it('are excluded from all aggregation', () => {
    const m = metric('scale');
    const observations = [obs('pa', 3, 0), { ...obs('pa', 0, 1), missed: true }];
    const s = summarizePhase(m, phaseA, observations);
    expect(s.n).toBe(1);
    expect(s.mean).toBe(3);
  });
});
