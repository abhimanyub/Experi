import { describe, expect, it } from 'vitest';
import {
  abandonExperiment,
  cloneExperiment,
  completeExperiment,
  startExperiment,
} from './lifecycle';
import { Experiment, Phase, Verdict } from './types';

const T0 = 1_700_000_000_000;

function draft(): Experiment {
  return {
    id: 'e1',
    title: 'Morning vs evening workouts',
    hypothesis: 'Morning workouts will improve my afternoon energy',
    archetype: 'routine',
    status: 'draft',
    createdAt: T0,
    startedAt: null,
    endedAt: null,
    verdictId: null,
    baselineSkipped: false,
    abandonReason: null,
  };
}

function phases(): Phase[] {
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
  ];
}

function verdict(conclusion = 'B clearly beat A on energy; adopting morning workouts.'): Verdict {
  return {
    id: 'v1',
    experimentId: 'e1',
    outcome: 'supported',
    conclusion,
    willAdopt: true,
    createdAt: T0,
  };
}

describe('startExperiment', () => {
  it('activates and opens the baseline phase', () => {
    const r = startExperiment(draft(), phases(), T0);
    expect(r.experiment.status).toBe('active');
    expect(r.experiment.baselineSkipped).toBe(false);
    expect(r.phases.opened?.id).toBe('p1');
  });

  it('skipBaseline drops baseline phases and records the skip', () => {
    const r = startExperiment(draft(), phases(), T0, { skipBaseline: true });
    expect(r.experiment.baselineSkipped).toBe(true);
    expect(r.phases.opened?.id).toBe('p2');
    expect(r.phases.updated).toHaveLength(1);
  });

  it('cannot skip baseline when nothing else remains', () => {
    const only = [phases()[0]];
    expect(() => startExperiment(draft(), only, T0, { skipBaseline: true })).toThrow(
      'no other phases'
    );
  });

  it('only drafts can start', () => {
    const active = { ...draft(), status: 'active' as const };
    expect(() => startExperiment(active, phases(), T0)).toThrow('status "active"');
  });
});

describe('abandonExperiment', () => {
  it('requires a reason', () => {
    const active = { ...draft(), status: 'active' as const };
    expect(() => abandonExperiment(active, T0, '  ')).toThrow('requires a reason');
    const r = abandonExperiment(active, T0, 'Got bored, dropped adherence');
    expect(r.status).toBe('abandoned');
    expect(r.abandonReason).toBe('Got bored, dropped adherence');
  });

  it('completed experiments cannot be abandoned', () => {
    const done = { ...draft(), status: 'completed' as const };
    expect(() => abandonExperiment(done, T0, 'x')).toThrow('status "completed"');
  });
});

describe('completeExperiment', () => {
  it('completes with a verdict', () => {
    const active = { ...draft(), status: 'active' as const };
    const r = completeExperiment(active, verdict(), T0);
    expect(r.status).toBe('completed');
    expect(r.verdictId).toBe('v1');
  });

  it('rejects empty conclusion', () => {
    const active = { ...draft(), status: 'active' as const };
    expect(() => completeExperiment(active, verdict('   '), T0)).toThrow('written conclusion');
  });
});

describe('cloneExperiment', () => {
  it('produces a fresh draft with reset phases', () => {
    const done = { ...draft(), status: 'completed' as const, verdictId: 'v1', endedAt: T0 };
    let n = 0;
    const r = cloneExperiment(done, phases(), T0 + 1000, () => `new${n++}`);
    expect(r.experiment.id).toBe('new0');
    expect(r.experiment.status).toBe('draft');
    expect(r.experiment.verdictId).toBeNull();
    expect(r.phases.every((p) => p.startedAt === null && p.endedAt === null)).toBe(true);
    expect(r.phases.every((p) => p.experimentId === 'new0')).toBe(true);
  });
});

describe('startExperiment — scheduled start', () => {
  it('starts at a future date', () => {
    const future = T0 + 2 * 24 * 60 * 60 * 1000;
    const r = startExperiment(draft(), phases(), T0, { startAt: future });
    expect(r.experiment.startedAt).toBe(future);
    expect(r.phases.opened?.startedAt).toBe(future);
  });

  it('rejects a past start date', () => {
    expect(() => startExperiment(draft(), phases(), T0, { startAt: T0 - 1000 })).toThrow(
      'past'
    );
  });
});
