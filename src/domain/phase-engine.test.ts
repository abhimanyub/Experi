import { describe, expect, it } from 'vitest';
import {
  actualDays,
  allPhasesDone,
  buildAlternatingPhases,
  currentPhase,
  nextPhase,
  phaseDurationWarnings,
  phaseForTimestamp,
  shouldAutoTransition,
  startFirstPhase,
  transitionToNext,
} from './phase-engine';
import { DAY_MS, Phase } from './types';

const T0 = 1_700_000_000_000;

function makePhases(): Phase[] {
  return [
    {
      id: 'p1',
      experimentId: 'e1',
      type: 'baseline',
      label: 'Baseline',
      sequence: 0,
      plannedDays: 7,
      startedAt: null,
      endedAt: null,
    },
    {
      id: 'p2',
      experimentId: 'e1',
      type: 'intervention',
      label: 'Intervention',
      sequence: 1,
      plannedDays: 14,
      startedAt: null,
      endedAt: null,
    },
    {
      id: 'p3',
      experimentId: 'e1',
      type: 'reversal',
      label: 'Reversal',
      sequence: 2,
      plannedDays: 7,
      startedAt: null,
      endedAt: null,
    },
  ];
}

describe('startFirstPhase', () => {
  it('opens the first phase by sequence', () => {
    const r = startFirstPhase(makePhases(), T0);
    expect(r.opened?.id).toBe('p1');
    expect(r.updated.find((p) => p.id === 'p1')?.startedAt).toBe(T0);
    expect(r.done).toBe(false);
  });

  it('throws if already started', () => {
    const phases = makePhases();
    phases[0].startedAt = T0;
    expect(() => startFirstPhase(phases, T0)).toThrow('already started');
  });

  it('throws on empty phase list', () => {
    expect(() => startFirstPhase([], T0)).toThrow('No phases');
  });
});

describe('transitionToNext', () => {
  it('auto-transitions at planned duration', () => {
    let phases = startFirstPhase(makePhases(), T0).updated;
    const at = T0 + 7 * DAY_MS;
    expect(shouldAutoTransition(currentPhase(phases)!, at)).toBe(true);
    const r = transitionToNext(phases, at);
    expect(r.closed?.id).toBe('p1');
    expect(r.opened?.id).toBe('p2');
    expect(r.closedActualDays).toBe(7);
    expect(r.done).toBe(false);
  });

  it('blocks early transition without confirmation', () => {
    const phases = startFirstPhase(makePhases(), T0).updated;
    expect(() => transitionToNext(phases, T0 + 2 * DAY_MS)).toThrow('requires confirmation');
  });

  it('allows early transition with confirmation and records actual days', () => {
    const phases = startFirstPhase(makePhases(), T0).updated;
    const r = transitionToNext(phases, T0 + 2 * DAY_MS, { confirmEarly: true });
    expect(r.closed?.id).toBe('p1');
    expect(r.closedActualDays).toBe(2);
  });

  it('marks done after the last phase closes', () => {
    let phases = startFirstPhase(makePhases(), T0).updated;
    let now = T0;
    for (const days of [7, 14]) {
      now += days * DAY_MS;
      phases = transitionToNext(phases, now).updated;
    }
    now += 7 * DAY_MS;
    const r = transitionToNext(phases, now);
    expect(r.opened).toBeNull();
    expect(r.done).toBe(true);
    expect(allPhasesDone(r.updated)).toBe(true);
  });

  it('throws when nothing is active', () => {
    expect(() => transitionToNext(makePhases(), T0)).toThrow('No active phase');
  });
});

describe('phaseForTimestamp', () => {
  it('resolves timestamps to the containing phase', () => {
    let phases = startFirstPhase(makePhases(), T0).updated;
    phases = transitionToNext(phases, T0 + 7 * DAY_MS).updated;

    expect(phaseForTimestamp(phases, T0 + 3 * DAY_MS)?.id).toBe('p1');
    expect(phaseForTimestamp(phases, T0 + 10 * DAY_MS)?.id).toBe('p2'); // open phase
    expect(phaseForTimestamp(phases, T0 - DAY_MS)).toBeNull(); // before start
  });

  it('boundary timestamp belongs to the newly opened phase', () => {
    let phases = startFirstPhase(makePhases(), T0).updated;
    const boundary = T0 + 7 * DAY_MS;
    phases = transitionToNext(phases, boundary).updated;
    expect(phaseForTimestamp(phases, boundary)?.id).toBe('p2');
  });

  it('clamps post-completion timestamps to the last phase', () => {
    let phases = startFirstPhase(makePhases(), T0).updated;
    let now = T0;
    for (const days of [7, 14, 7]) {
      now += days * DAY_MS;
      phases = transitionToNext(phases, now).updated;
    }
    expect(phaseForTimestamp(phases, now + DAY_MS)?.id).toBe('p3');
  });
});

describe('helpers', () => {
  it('nextPhase returns first unstarted phase', () => {
    const phases = startFirstPhase(makePhases(), T0).updated;
    expect(nextPhase(phases)?.id).toBe('p2');
  });

  it('actualDays floors partial days', () => {
    const p: Phase = { ...makePhases()[0], startedAt: T0, endedAt: T0 + 7.9 * DAY_MS };
    expect(actualDays(p, T0)).toBe(7);
  });

  it('warns on phases under the 7-day minimum', () => {
    const phases = makePhases();
    phases[0].plannedDays = 3;
    const warnings = phaseDurationWarnings(phases);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('3 day');
  });

  it('buildAlternatingPhases produces A/B/A/B ordering', () => {
    let n = 0;
    const phases = buildAlternatingPhases('e1', 'A', 'B', 7, 2, () => `id${n++}`);
    expect(phases.map((p) => p.label)).toEqual(['A', 'B', 'A', 'B']);
    expect(phases.map((p) => p.sequence)).toEqual([0, 1, 2, 3]);
  });
});
