// Verdict flow (spec §7.4, mandatory): per-metric comparison pages →
// outcome picker → written conclusion → adopt? → complete.
// The app's job is to make lying to yourself effortful.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { DotChart } from '@/components/dot-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ChipRow } from '@/components/wizard/chips';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getExperimentDetail, saveVerdict } from '@/db/repo';
import { VerdictOutcome } from '@/domain/types';
import { compareMetricAcrossPhases, comparisonValue, contextLine } from '@/domain/verdict-math';
import { successFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

const OUTCOMES: { value: VerdictOutcome; label: string; blurb: string }[] = [
  { value: 'supported', label: 'Supported', blurb: 'The data backs the hypothesis.' },
  { value: 'refuted', label: 'Refuted', blurb: 'The data contradicts it. Also a win.' },
  {
    value: 'inconclusive',
    label: 'Inconclusive',
    blurb: 'Not enough signal. A valid, honest verdict.',
  },
  {
    value: 'contaminated',
    label: 'Contaminated',
    blurb: 'Confounders ruined the data. Re-run it.',
  },
];

export default function VerdictFlow() {
  const { experimentId } = useLocalSearchParams<{ experimentId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();

  const [metricIndex, setMetricIndex] = useState(0); // 0..metrics-1, then decision page
  const [onDecision, setOnDecision] = useState(false);
  const [excludeFlagged, setExcludeFlagged] = useState(false);
  const [outcome, setOutcome] = useState<VerdictOutcome | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [willAdopt, setWillAdopt] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ['experiment-detail', experimentId],
    queryFn: () => getExperimentDetail(experimentId),
  });

  const save = useMutation({
    mutationFn: () =>
      saveVerdict({
        experimentId,
        outcome: outcome!,
        conclusion: conclusion.trim(),
        willAdopt,
        now: Date.now(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSaved(true);
      successFeedback();
    },
  });

  if (!detail) return <ThemedView style={styles.container} />;
  const { experiment, phases, metrics, observations } = detail;
  const chartWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 4;

  if (saved) {
    return (
      <ThemedView style={[styles.container, styles.centerAll]}>
        <Animated.View entering={ZoomIn.springify()}>
          <View style={[styles.bigBadge, { backgroundColor: colors.success }]}>
            <ThemedText type="title" style={{ color: colors.onTint, fontSize: 40, lineHeight: 48 }}>
              ✓
            </ThemedText>
          </View>
        </Animated.View>
        <ThemedText type="subtitle">Settled with data</ThemedText>
        <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
          "{experiment.title}" is archived in History.
        </ThemedText>
        <Pressable
          onPress={() => router.back()}
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}>
          <ThemedText type="smallBold" style={{ color: colors.onTint }}>
            Done
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // --- per-metric comparison pages ---
  if (!onDecision) {
    const metric = metrics[metricIndex];
    const cmp = compareMetricAcrossPhases(metric, phases, observations, {
      excludeFlagged,
      now: Date.now(),
    });
    const withData = cmp.phases.filter((s) => s.n > 0);
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Metric {metricIndex + 1} of {metrics.length}
          </ThemedText>
          <ThemedText type="subtitle">{metric.name}</ThemedText>

          {experiment.baselineSkipped && (
            <ThemedView type="backgroundElement" style={[styles.card, { backgroundColor: colors.tintSoft }]}>
              <ThemedText type="small">
                ⚠︎ Baseline was skipped — there is no before-picture. Weigh this comparison
                accordingly.
              </ThemedText>
            </ThemedView>
          )}

          <ThemedView type="backgroundElement" style={styles.card}>
            <DotChart metric={metric} phases={phases} observations={observations} width={chartWidth} />
            <View style={styles.pillRow}>
              {withData.map((s) => (
                <View
                  key={s.phaseId}
                  style={[styles.pill, { backgroundColor: colors.backgroundSelected }]}>
                  <ThemedText type="small">
                    {s.label}: {comparisonValue(metric, s) ?? '—'}
                    {metric.type === 'boolean' ? '%' : ''}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: colors.textSecondary }}>
                    n={s.n}
                    {s.nFlagged > 0 ? ` · ⚑${s.nFlagged}` : ''}
                  </ThemedText>
                </View>
              ))}
            </View>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {contextLine(metric, cmp)}
            </ThemedText>
          </ThemedView>

          {cmp.totalFlagged > 0 && (
            <ThemedView type="backgroundElement" style={[styles.card, styles.toggleRow]}>
              <View style={{ flexShrink: 1 }}>
                <ThemedText type="smallBold">Exclude flagged observations</ThemedText>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  {cmp.totalFlagged} observation{cmp.totalFlagged === 1 ? '' : 's'} overlap
                  confounders.
                </ThemedText>
              </View>
              <Switch value={excludeFlagged} onValueChange={setExcludeFlagged} />
            </ThemedView>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {metricIndex > 0 ? (
            <Pressable onPress={() => setMetricIndex((i) => i - 1)}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                ← Back
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={() =>
              metricIndex + 1 < metrics.length ? setMetricIndex((i) => i + 1) : setOnDecision(true)
            }
            style={[styles.nextButton, { backgroundColor: colors.tint }]}>
            <ThemedText type="smallBold" style={{ color: colors.onTint }}>
              {metricIndex + 1 < metrics.length ? 'Next metric' : 'To the verdict'}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // --- decision page ---
  const conclusionLength = conclusion.trim().length;
  const canSave = outcome !== null && conclusionLength > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown} style={{ gap: Spacing.two }}>
          <ThemedText type="subtitle">The verdict</ThemedText>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Hypothesis
            </ThemedText>
            <ThemedText type="default">{experiment.hypothesis}</ThemedText>
          </ThemedView>

          <ThemedText type="smallBold">Outcome</ThemedText>
          {OUTCOMES.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => setOutcome(o.value)}
              style={[
                styles.card,
                {
                  backgroundColor:
                    outcome === o.value ? colors.tintSoft : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold" style={outcome === o.value ? { color: colors.tint } : undefined}>
                {o.label}
              </ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                {o.blurb}
              </ThemedText>
            </Pressable>
          ))}

          <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
            Conclusion — in your own words
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.conclusionBox}>
            <TextInput
              value={conclusion}
              onChangeText={setConclusion}
              placeholder="What did you learn? What would you tell someone who asks whether this worked?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.conclusionInput, { color: colors.text }]}
              multiline
            />
          </ThemedView>
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            {conclusionLength < 100
              ? `${conclusionLength}/100 — a verdict this short probably hasn't settled anything.`
              : `${conclusionLength} characters.`}
          </ThemedText>

          <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>
            Are you keeping this change?
          </ThemedText>
          <ChipRow
            options={[
              { value: 'yes', label: 'Adopting it' },
              { value: 'no', label: 'Dropping it' },
              { value: 'undecided', label: 'Undecided' },
            ]}
            value={willAdopt === true ? 'yes' : willAdopt === false ? 'no' : 'undecided'}
            onChange={(v) => setWillAdopt(v === 'yes' ? true : v === 'no' ? false : null)}
          />

          <Pressable
            disabled={!canSave || save.isPending}
            onPress={() => save.mutate()}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: canSave ? 1 : 0.4, marginTop: Spacing.three },
            ]}>
            <ThemedText type="smallBold" style={{ color: colors.onTint }}>
              {save.isPending ? 'Archiving…' : 'Seal the verdict'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => setOnDecision(false)} style={styles.backLink}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              ← Back to the data
            </ThemedText>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerAll: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
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
    gap: Spacing.one,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  nextButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  conclusionBox: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  conclusionInput: {
    minHeight: 120,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  bigBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.six,
    borderRadius: Spacing.three,
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
