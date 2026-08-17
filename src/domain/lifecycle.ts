// Experiment lifecycle (§4): DRAFT → ACTIVE → COMPLETED, with ABANDONED exit.
// Pure functions — callers persist returned copies.

import { startFirstPhase, TransitionResult } from './phase-engine';
import { Experiment, Phase, Verdict } from './types';

export interface StartResult {
  experiment: Experiment;
  phases: TransitionResult;
}

/**
 * Start a draft experiment. If skipBaseline, baseline phases are removed and
 * the skip is recorded — the verdict screen must show a caveat banner.
 */
export function startExperiment(
  experiment: Experiment,
  phases: Phase[],
  now: number,
  opts: { skipBaseline?: boolean } = {}
): StartResult {
  if (experiment.status !== 'draft') {
    throw new Error(`Cannot start experiment with status "${experiment.status}"`);
  }
  let plan = phases;
  if (opts.skipBaseline) {
    plan = phases.filter((p) => p.type !== 'baseline');
    if (plan.length === 0) throw new Error('Cannot skip baseline: no other phases defined');
  }
  return {
    experiment: {
      ...experiment,
      status: 'active',
      startedAt: now,
      baselineSkipped: !!opts.skipBaseline,
    },
    phases: startFirstPhase(plan, now),
  };
}

/** Abandon requires a one-line reason — no silent quitting. */
export function abandonExperiment(
  experiment: Experiment,
  now: number,
  reason: string
): Experiment {
  if (experiment.status !== 'active' && experiment.status !== 'draft') {
    throw new Error(`Cannot abandon experiment with status "${experiment.status}"`);
  }
  if (!reason.trim()) throw new Error('Abandoning requires a reason');
  return { ...experiment, status: 'abandoned', endedAt: now, abandonReason: reason.trim() };
}

/** Complete only through the verdict flow — a verdict with a written conclusion is mandatory. */
export function completeExperiment(
  experiment: Experiment,
  verdict: Verdict,
  now: number
): Experiment {
  if (experiment.status !== 'active') {
    throw new Error(`Cannot complete experiment with status "${experiment.status}"`);
  }
  if (!verdict.conclusion.trim()) throw new Error('Verdict requires a written conclusion');
  return { ...experiment, status: 'completed', endedAt: now, verdictId: verdict.id };
}

/** Clone a completed/abandoned experiment back to a fresh draft. */
export function cloneExperiment(
  experiment: Experiment,
  phases: Phase[],
  now: number,
  makeId: () => string
): { experiment: Experiment; phases: Phase[] } {
  const newExperimentId = makeId();
  return {
    experiment: {
      ...experiment,
      id: newExperimentId,
      status: 'draft',
      createdAt: now,
      startedAt: null,
      endedAt: null,
      verdictId: null,
      baselineSkipped: false,
      abandonReason: null,
    },
    phases: phases.map((p) => ({
      ...p,
      id: makeId(),
      experimentId: newExperimentId,
      startedAt: null,
      endedAt: null,
    })),
  };
}
