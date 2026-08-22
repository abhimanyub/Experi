// Experiment detail (M4, spec §7.2): hypothesis header, phase timeline,
// per-metric dot charts, confounder log, observation history, phase/abandon actions.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { PhaseTimeline } from '@/components/phase-timeline';
import { Sparkline } from '@/components/sparkline';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { phaseColor } from '@/constants/viz';
import { ScaleConfig } from '@/domain/types';
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
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
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

  const shownObservations = showAllObservations ? [...observations].reverse() : [...observations].reverse().slice(0, 10);
  const metricName = (metricId: string) => metrics.find((m) => m.id === metricId)?.name ?? '?';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: experiment.title }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* hypothesis header */}
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.cardBorder }]}>
          <ThemedText type="label">Hypothesis</ThemedText>
          <ThemedText type="default">{experiment.hypothesis}</ThemedText>
          {experiment.baselineSkipped && (
            <ThemedText type="small" style={{ color: colors.warning }}>
              ⚠️ Baseline was skipped — comparisons lack a before-picture.
            </ThemedText>
          )}
        </ThemedView>

        {/* verdict (completed experiments) */}
        {verdict && (
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.cardBorder }]}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Verdict — {verdict.outcome}
              {verdict.willAdopt === true && ' · adopted'}
              {verdict.willAdopt === false && ' · dropped'}
            </ThemedText>
            <ThemedText type="default">{verdict.conclusion}</ThemedText>
          </ThemedView>
        )}

        {/* phase card */}
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.cardBorder }]}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold" style={{ fontSize: 15 }}>
              {active
                ? `${active.label} — day ${actualDays(active, now) + 1} of ${active.plannedDays}`
                : 'All phases complete'}
            </ThemedText>
            {active && (
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={confirmEndEarly}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <ThemedText type="smallBold" style={{ fontSize: 13, color: colors.tint }}>
                  End early
                </ThemedText>
              </Pressable>
            )}
          </View>
          <PhaseTimeline phases={phases} now={now} />
        </ThemedView>

        {/* per-metric charts: self-drawing sparkline + per-phase stat chips */}
        {metrics.map((m, mi) => {
          const cmp = compareMetricAcrossPhases(m, phases, observations, { now });
          const phasesWithData = cmp.phases.filter((s) => s.n > 0);
          const vals = observations
            .filter((o) => o.metricId === m.id && !o.missed)
            .sort((a, b) => a.observedAt - b.observedAt)
            .map((o) => o.value);
          let yMin = 1;
          let yMax = 5;
          if (m.type === 'scale') {
            const cfg = m.config as ScaleConfig;
            yMin = cfg.min ?? 1;
            yMax = cfg.max ?? 5;
          } else if (vals.length > 0) {
            yMin = Math.min(...vals);
            yMax = Math.max(...vals);
            if (yMin === yMax) {
              yMin -= 1;
              yMax += 1;
            }
          }
          return (
            <ThemedView
              key={m.id}
              type="backgroundElement"
              style={[styles.card, { borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <ThemedText type="smallBold" style={{ fontSize: 15 }}>
                  {m.name}
                </ThemedText>
                <ThemedText type="small" style={{ color: colors.textFaint, fontWeight: 600 }}>
                  {m.type === 'scale' ? `${yMin}-${yMax} rating` : m.type}
                </ThemedText>
              </View>
              {vals.length >= 2 ? (
                <Sparkline
                  values={vals}
                  yMin={yMin}
                  yMax={yMax}
                  width={chartWidth}
                  height={110}
                  color={phaseColor('dark', mi)}
                  accessibilityLabel={`${m.name}: ${vals.length} observations, latest ${vals[vals.length - 1]}`}
                />
              ) : (
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  {vals.length === 0 ? 'No observations yet.' : 'One observation — a line needs two.'}
                </ThemedText>
              )}
              {phasesWithData.length > 0 && (
                <View style={styles.progressPhases}>
                  {phasesWithData.map((s) => (
                    <View
                      key={s.phaseId}
                      style={[styles.statChip, { backgroundColor: colors.tintSoft }]}>
                      <ThemedText type="smallBold" style={{ fontSize: 13, color: colors.tint }}>
                        {s.label} avg: {comparisonValue(m, s) ?? '—'}
                        {m.type === 'boolean' ? '%' : ''}
                      </ThemedText>
                    </View>
                  ))}
                  <View style={[styles.statChip, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                    <ThemedText type="smallBold" style={{ fontSize: 13, color: colors.textSecondary }}>
                      n = {phasesWithData.reduce((a, s) => a + s.n, 0)}
                    </ThemedText>
                  </View>
                </View>
              )}
              {phasesWithData.length >= 2 && (
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  {contextLine(m, cmp)}
                </ThemedText>
              )}
            </ThemedView>
          );
        })}

        {/* actions: confounder + settle */}
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/confounder/${experiment.id}` as never)}
            style={({ pressed }) => [
              styles.actionOutline,
              { borderColor: 'rgba(255,255,255,0.14)', transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}>
            <ThemedText type="smallBold" style={{ fontSize: 15, color: colors.textSecondary }}>
              ⚠ Log confounder
            </ThemedText>
          </Pressable>
          {experiment.status === 'active' && !active && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/verdict/${experiment.id}` as never)}
              style={({ pressed }) => [
                styles.actionPrimary,
                { backgroundColor: colors.cream, transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}>
              <ThemedText type="smallBold" style={{ fontSize: 15, color: colors.onCream }}>
                Settle it →
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* confounders */}
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.cardBorder }]}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold">Confounders</ThemedText>
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => router.push(`/confounder/${experiment.id}` as never)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
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
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.cardBorder }]}>
          <ThemedText type="smallBold">Observations ({observations.length})</ThemedText>
          {shownObservations.map((o) => (
            <View key={o.id} style={styles.rowBetween}>
              <View style={styles.obsLine}>
                <ThemedText type="code" style={[styles.obsDate, { color: colors.textSecondary }]}>
                  {new Date(o.observedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: '2-digit',
                  })}
                </ThemedText>
                <View style={{ flexShrink: 1 }}>
                  <ThemedText
                    type="small"
                    style={
                      o.backfilled
                        ? { fontStyle: 'italic', color: colors.textSecondary }
                        : undefined
                    }>
                    {o.missed ? `${metricName(o.metricId)}: missed` : `${metricName(o.metricId)}: ${o.value}`}
                    {o.flagged ? ' ⚑' : ''}
                    {o.backfilled ? ' · backfilled' : ''}
                  </ThemedText>
                  {o.note ? (
                    <ThemedText type="small" style={{ color: colors.textSecondary }}>
                      {o.note}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete observation, ${metricName(o.metricId)}`}
                hitSlop={12}
                onPress={async () => {
                  const ok = await confirmAction({
                    title: 'Delete observation?',
                    confirmText: 'Delete',
                    destructive: true,
                  });
                  if (ok) removeObservation.mutate(o.id);
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ))}
          {observations.length > 10 && (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setShowAllObservations((s) => !s)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                {showAllObservations ? 'Show fewer' : `Show all ${observations.length}`}
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {/* abandon — inline reason entry works on every platform
            (Alert.prompt is iOS-only and silently dead elsewhere) */}
        {experiment.status === 'active' && !abandonOpen && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAbandonOpen(true)}
            style={({ pressed }) => [styles.abandonButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Abandon experiment…
            </ThemedText>
          </Pressable>
        )}
        {experiment.status === 'active' && abandonOpen && (
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.cardBorder }]}>
            <ThemedText type="smallBold">Abandon this experiment?</ThemedText>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              One-line reason (required) — future you will want to know why.
            </ThemedText>
            <TextInput
              autoFocus
              value={abandonReason}
              onChangeText={setAbandonReason}
              placeholder="e.g. Travel wrecked the routine"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Reason for abandoning"
              style={[styles.abandonInput, { color: colors.text }]}
            />
            <View style={styles.rowBetween}>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setAbandonOpen(false);
                  setAbandonReason('');
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!abandonReason.trim() || abandon.isPending}
                onPress={() => abandon.mutate(abandonReason.trim())}
                style={({ pressed }) => [
                  styles.abandonConfirm,
                  {
                    backgroundColor: colors.tint,
                    opacity: !abandonReason.trim() ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText type="smallBold" style={{ color: colors.onTint }}>
                  {abandon.isPending ? 'Abandoning…' : 'Abandon'}
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
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
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: Spacing.two,
  },
  statChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionOutline: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionPrimary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
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
  progressPhases: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  obsLine: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexShrink: 1,
  },
  obsDate: {
    fontSize: 11,
    lineHeight: 18,
    minWidth: 52,
  },
  abandonButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  abandonInput: {
    fontSize: 16,
    minHeight: 44,
    paddingVertical: Spacing.one,
  },
  abandonConfirm: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
});
