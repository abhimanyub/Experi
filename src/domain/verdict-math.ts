// Verdict math (v1 — deliberately simple).
// Per metric, per phase: means/sums/rates + deltas. No significance testing.
// The human writes the verdict; this module just refuses to hide the spread.

import { actualDays } from './phase-engine';
import { Metric, Observation, Phase } from './types';

export interface PhaseSummary {
  phaseId: string;
  label: string;
  n: number; // observations included
  nFlagged: number; // observations excluded/flagged (for honest context)
  mean: number | null; // scale | numeric | duration
  min: number | null;
  max: number | null;
  pctTrue: number | null; // boolean, 0..100
  sum: number | null; // currency
  perDay: number | null; // currency: sum / actual phase days
  perUnit: number | null; // currency: sum / n
}

export interface PhaseDelta {
  fromPhaseId: string;
  toPhaseId: string;
  absolute: number | null; // to - from, on the comparison value
  percent: number | null; // null when from === 0
}

export interface MetricComparison {
  metricId: string;
  phases: PhaseSummary[];
  deltas: PhaseDelta[]; // consecutive phase pairs
  totalFlagged: number;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Summarize one metric within one phase. `excludeFlagged` drops confounded observations. */
export function summarizePhase(
  metric: Metric,
  phase: Phase,
  observations: Observation[],
  opts: { excludeFlagged?: boolean; now?: number } = {}
): PhaseSummary {
  const now = opts.now ?? phase.endedAt ?? phase.startedAt ?? 0;
  // Missed markers are bookkeeping, never data.
  const inPhase = observations.filter(
    (o) => o.metricId === metric.id && o.phaseId === phase.id && !o.missed
  );
  const flaggedCount = inPhase.filter((o) => o.flagged).length;
  const included = opts.excludeFlagged ? inPhase.filter((o) => !o.flagged) : inPhase;

  const base: PhaseSummary = {
    phaseId: phase.id,
    label: phase.label,
    n: included.length,
    nFlagged: flaggedCount,
    mean: null,
    min: null,
    max: null,
    pctTrue: null,
    sum: null,
    perDay: null,
    perUnit: null,
  };
  if (included.length === 0) return base;

  const values = included.map((o) => o.value);
  const sum = values.reduce((a, b) => a + b, 0);

  switch (metric.type) {
    case 'scale':
    case 'numeric':
    case 'duration':
      return {
        ...base,
        mean: round2(sum / values.length),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    case 'boolean':
      return {
        ...base,
        pctTrue: round2((values.filter((v) => v === 1).length / values.length) * 100),
      };
    case 'currency': {
      const days = Math.max(1, actualDays(phase, now));
      return {
        ...base,
        sum: round2(sum),
        perDay: round2(sum / days),
        perUnit: round2(sum / values.length),
      };
    }
  }
}

/** The single number a phase is compared on, per metric type. */
export function comparisonValue(metric: Metric, s: PhaseSummary): number | null {
  switch (metric.type) {
    case 'scale':
    case 'numeric':
    case 'duration':
      return s.mean;
    case 'boolean':
      return s.pctTrue;
    case 'currency':
      return s.perDay; // normalize by duration so unequal phases compare fairly
  }
}

/** Full per-metric comparison across all phases, with consecutive deltas. */
export function compareMetricAcrossPhases(
  metric: Metric,
  phases: Phase[],
  observations: Observation[],
  opts: { excludeFlagged?: boolean; now?: number } = {}
): MetricComparison {
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const summaries = ordered.map((p) => summarizePhase(metric, p, observations, opts));

  const deltas: PhaseDelta[] = [];
  for (let i = 1; i < summaries.length; i++) {
    const from = comparisonValue(metric, summaries[i - 1]);
    const to = comparisonValue(metric, summaries[i]);
    if (from === null || to === null) {
      deltas.push({
        fromPhaseId: summaries[i - 1].phaseId,
        toPhaseId: summaries[i].phaseId,
        absolute: null,
        percent: null,
      });
    } else {
      deltas.push({
        fromPhaseId: summaries[i - 1].phaseId,
        toPhaseId: summaries[i].phaseId,
        absolute: round2(to - from),
        percent: from === 0 ? null : round2(((to - from) / Math.abs(from)) * 100),
      });
    }
  }

  return {
    metricId: metric.id,
    phases: summaries,
    deltas,
    totalFlagged: summaries.reduce((a, s) => a + s.nFlagged, 0),
  };
}

/**
 * Honest context line for the verdict screen, e.g.:
 * "B averaged 3.9 vs A's 3.1 across 14 vs 7 observations. 3 observations were flagged by confounders."
 */
export function contextLine(metric: Metric, cmp: MetricComparison): string {
  const withData = cmp.phases.filter((s) => s.n > 0);
  if (withData.length < 2) return 'Not enough data to compare phases.';
  const a = withData[0];
  const b = withData[withData.length - 1];
  const va = comparisonValue(metric, a);
  const vb = comparisonValue(metric, b);
  const verb =
    metric.type === 'currency' ? 'cost' : metric.type === 'boolean' ? 'hit' : 'averaged';
  const fmt = (v: number | null) =>
    v === null ? '—' : metric.type === 'boolean' ? `${v}%` : `${v}`;
  let line = `${b.label} ${verb} ${fmt(vb)} vs ${a.label}'s ${fmt(va)} across ${b.n} vs ${a.n} observations.`;
  if (cmp.totalFlagged > 0) {
    line += ` ${cmp.totalFlagged} observation${cmp.totalFlagged === 1 ? ' was' : 's were'} flagged by confounders.`;
  }
  return line;
}
