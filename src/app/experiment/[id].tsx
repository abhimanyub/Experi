// Experiment detail (M4, spec §7.2): hypothesis header, phase timeline,
// per-metric dot charts, confounder log, observation history, phase/abandon actions.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DotChart } from '@/components/dot-chart';
import { PhaseTimeline } from '@/components/phase-timeline';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  abandonExperimentById,
  deleteObservation,
  endPhaseEarly,
  getExperimentDetail,
  getVerdict,
} from '@/db/repo';
import { actualDays, currentPhase, plannedEnd } from '@/domain/phase-engine';
import { compareMetricAcrossPhases, comparisonValue, contextLine } from '@/domain/verdict-math';
import { confirmAction } from '@/lib/confirm';
import { useTheme } from '@/hooks/use-theme';

export default function ExperimentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const [showAllObservations, setShowAllObservations] = useState(false);
  const now = Date.now();

  const { data: detail } = useQuery({
    queryKey: ['experiment-detail', id],
    queryFn: () => getExperimentDetail(id),
  });
  const { data: verdict } = useQuery({
    queryKey: ['verdict', id],
    queryFn: () => getVerdict(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['experiment-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
  };

  const endEarly = useMutation({
    mutationFn: () => endPhaseEarly(id, Date.now()),
    onSuccess: refresh,
  });
  const removeObservation = useMutation({
    mutationFn: (obsId: string) => deleteObservation(obsId),
    onSuccess: refresh,
  });
  const abandon = useMutation({
    mutationFn: (reason: string) => abandonExperimentById(id, Date.now(), reason),
    onSuccess: () => {
      refresh();
      router.back();
    },
  });

  if (!detail) {
    return <ThemedView style={styles.container} />;
  }

  const { experiment, phases, metrics, observations, confounders } = detail;
  const active = currentPhase(phases);
  const chartWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 2 - Spacing.three * 2;

  const confirmEndEarly = async () => {
    if (!active) return;
    const daysIn = actualDays(active, now);
    const end = plannedEnd(active);
    const daysLeft = end ? Math.ceil((end - now) / (24 * 60 * 60 * 1000)) : 0;
    const ok = await confirmAction({
      title: `End "${active.label}" early?`,
      message: `${daysIn} day(s) in, ${daysLeft} planned day(s) remaining. Actual duration is recorded — short phases weaken the verdict.`,
      confirmText: 'End phase',
      destructive: true,
    });
    if (ok) endEarly.mutate();
  };

  const confirmAbandon = () => {
    Alert.prompt?.(
      'Abandon experiment',
      'One-line reason (required):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: (reason?: string) => {
            if (reason?.trim()) abandon.mutate(reason.trim());
          },
        },
      ],
      'plain-text'
    );
  };

  const shownObservations = showAllObservations ? [...observations].reverse() : [...observations].reverse().slice(0, 10);
  const metricName = (metricId: string) => metrics.find((m) => m.id === metricId)?.name ?? '?';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: experiment.title }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* hypothesis header */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Hypothesis
          </ThemedText>
          <ThemedText type="default">{experiment.hypothesis}</ThemedText>
          {experiment.baselineSkipped && (
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              ⚠︎ Baseline was skipped — comparisons lack a before-picture.
            </ThemedText>
          )}
        </ThemedView>

        {/* verdict (completed experiments) */}
        {verdict && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Verdict — {verdict.outcome}
              {verdict.willAdopt === true && ' · adopted'}
              {verdict.willAdopt === false && ' · dropped'}
            </ThemedText>
            <ThemedText type="default">{verdict.conclusion}</ThemedText>
          </ThemedView>
        )}

        {/* verdict entry (all phases done, still active) */}
        {experiment.status === 'active' && !active && (
          <Pressable
            onPress={() => router.push(`/verdict/${experiment.id}` as never)}
            style={[styles.verdictButton, { backgroundColor: colors.success }]}>
            <ThemedText type="smallBold" style={{ color: colors.onTint }}>
              Write the verdict
            </ThemedText>
          </Pressable>
        )}

        {/* phase timeline */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold">
              {active
                ? `${active.label} — day ${actualDays(active, now) + 1} of ${active.plannedDays}`
                : 'All phases complete'}
            </ThemedText>
            {active && (
              <Pressable onPress={confirmEndEarly}>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  End early
                </ThemedText>
              </Pressable>
            )}
          </View>
          <PhaseTimeline phases={phases} now={now} />
        </ThemedView>

        {/* per-metric charts */}
        {metrics.map((m) => (
          <ThemedView key={m.id} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{m.name}</ThemedText>
            <DotChart metric={m} phases={phases} observations={observations} width={chartWidth} />
          </ThemedView>
        ))}

        {/* progress so far */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Progress so far</ThemedText>
          {metrics.map((m) => {
            const cmp = compareMetricAcrossPhases(m, phases, observations, { now });
            const phasesWithData = cmp.phases.filter((s) => s.n > 0);
            if (phasesWithData.length === 0) {
              return (
                <View key={m.id} style={styles.progressMetric}>
                  <ThemedText type="small">{m.name}</ThemedText>
                  <ThemedText type="small" style={{ color: colors.textSecondary }}>
                    No data yet.
                  </ThemedText>
                </View>
              );
            }
            return (
              <View key={m.id} style={styles.progressMetric}>
                <ThemedText type="small">{m.name}</ThemedText>
                <View style={styles.progressPhases}>
                  {phasesWithData.map((s) => (
                    <View
                      key={s.phaseId}
                      style={[styles.progressPill, { backgroundColor: colors.backgroundSelected }]}>
                      <ThemedText type="small">
                        {s.label}: {comparisonValue(m, s) ?? '—'}
                        {m.type === 'boolean' ? '%' : ''}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: colors.textSecondary }}>
                        n={s.n}
                        {s.nFlagged > 0 ? ` · ⚑${s.nFlagged}` : ''}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                {phasesWithData.length >= 2 && (
                  <ThemedText type="small" style={{ color: colors.textSecondary }}>
                    {contextLine(m, cmp)}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </ThemedView>

        {/* confounders */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold">Confounders</ThemedText>
            <Pressable onPress={() => router.push(`/confounder/${experiment.id}` as never)}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                + Something happened
              </ThemedText>
            </Pressable>
          </View>
          {confounders.length === 0 ? (
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              None logged. Sick day, travel, bad sleep — anything that contaminates the data.
            </ThemedText>
          ) : (
            confounders.map((c) => (
              <View key={c.id} style={styles.confounderRow}>
                <ThemedText type="small">{c.note}</ThemedText>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  {new Date(c.startsAt).toLocaleDateString()} –{' '}
                  {c.endsAt ? new Date(c.endsAt).toLocaleDateString() : 'ongoing'}
                </ThemedText>
              </View>
            ))
          )}
        </ThemedView>

        {/* observation history */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Observations ({observations.length})</ThemedText>
          {shownObservations.map((o) => (
            <View key={o.id} style={styles.rowBetween}>
              <View style={{ flexShrink: 1 }}>
                <ThemedText type="small">
                  {metricName(o.metricId)}: {o.value}
                  {o.flagged ? ' ⚑' : ''}
                  {o.backfilled ? ' (backfilled)' : ''}
                </ThemedText>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  {new Date(o.observedAt).toLocaleString()}
                  {o.note ? ` · ${o.note}` : ''}
                </ThemedText>
              </View>
              <Pressable
                onPress={async () => {
                  const ok = await confirmAction({
                    title: 'Delete observation?',
                    confirmText: 'Delete',
                    destructive: true,
                  });
                  if (ok) removeObservation.mutate(o.id);
                }}>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ))}
          {observations.length > 10 && (
            <Pressable onPress={() => setShowAllObservations((s) => !s)}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                {showAllObservations ? 'Show fewer' : `Show all ${observations.length}`}
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {/* abandon */}
        {experiment.status === 'active' && (
          <Pressable onPress={confirmAbandon} style={styles.abandonButton}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Abandon experiment…
            </ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  confounderRow: {
    gap: Spacing.half,
  },
  progressMetric: {
    gap: Spacing.one,
  },
  progressPhases: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  progressPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  abandonButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  verdictButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
