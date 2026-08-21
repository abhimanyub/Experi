// Verdict flow (spec §7.4, mandatory): per-metric comparison pages →
// outcome picker → written conclusion → adopt? → complete.
// The app's job is to make lying to yourself effortful — but never to trap
// you: Close is always available, and typed work warns before discarding.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import { ConfettiBurst } from '@/components/confetti';
import { DotChart } from '@/components/dot-chart';
import { VerdictStamp } from '@/components/verdict-stamp';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ChipRow } from '@/components/wizard/chips';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getExperimentDetail, saveVerdict } from '@/db/repo';
import { VerdictOutcome } from '@/domain/types';
import { compareMetricAcrossPhases, comparisonValue, contextLine } from '@/domain/verdict-math';
import { confirmAction } from '@/lib/confirm';
import { stampFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
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
  const navigation = useNavigation();
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

  // A half-written verdict shouldn't vanish on an accidental dismiss.
  const dirtyRef = useRef(false);
  dirtyRef.current = !saved && (outcome !== null || conclusion.trim().length > 0);
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      confirmAction({
        title: 'Discard this verdict?',
        message: 'Your outcome and conclusion so far will be lost.',
        confirmText: 'Discard',
        destructive: true,
      }).then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return () => sub();
  }, [navigation]);

  // Two-beat stamp: heavy thud fires on save; the success chime lands as the
  // ink settles. Timer is cleaned up if the screen unmounts first.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(successFeedback, 350);
    return () => clearTimeout(timer);
  }, [saved]);

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
      stampFeedback();
    },
  });

  // fullScreenModal has no swipe-to-dismiss and no back chevron — an explicit
  // Close keeps the flow escapable before the verdict is sealed.
  const screenOptions = (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <ThemedText type="link" style={{ color: colors.tint }}>
              Close
            </ThemedText>
          </Pressable>
        ),
      }}
    />
  );

  if (!detail) {
    return (
      <ThemedView style={styles.container}>{screenOptions}</ThemedView>
    );
  }
  const { experiment, phases, metrics, observations } = detail;
  const chartWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 4;

  if (saved) {
    return (
      <ThemedView style={[styles.container, styles.centerAll]}>
        {screenOptions}
        <ConfettiBurst />
        <Animated.View entering={ZoomIn.springify().damping(9)}>
          <VerdictStamp outcome={outcome ?? 'inconclusive'} size="large" />
        </Animated.View>
        <ThemedText type="subtitle">Settled with data</ThemedText>
        <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
          "{experiment.title}" is archived in History.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
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
        {screenOptions}
        <ScrollView contentContainerStyle={styles.content}>
          <Animated.View
            key={metricIndex}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={{ gap: Spacing.two }}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Metric {metricIndex + 1} of {metrics.length}
            </ThemedText>
            <ThemedText type="subtitle">{metric.name}</ThemedText>

            {experiment.baselineSkipped && (
              <ThemedView
                type="backgroundElement"
                style={[styles.card, { backgroundColor: colors.warningSoft }]}>
                <ThemedText type="small" style={{ color: colors.warning }}>
                  ⚠️ Baseline was skipped — there is no before-picture. Weigh this comparison
                  accordingly.
                </ThemedText>
              </ThemedView>
            )}

            <ThemedView type="backgroundElement" style={styles.card}>
              <DotChart
                metric={metric}
                phases={phases}
                observations={observations}
                width={chartWidth}
              />
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
          </Animated.View>
        </ScrollView>
        <View style={styles.footer}>
          {metricIndex > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setMetricIndex((i) => i - 1)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                ← Back
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              metricIndex + 1 < metrics.length ? setMetricIndex((i) => i + 1) : setOnDecision(true)
            }
            style={({ pressed }) => [
              styles.nextButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}>
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
      {screenOptions}
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
              accessibilityRole="button"
              accessibilityState={{ selected: outcome === o.value }}
              accessibilityLabel={`${o.label}. ${o.blurb}`}
              onPress={() => {
                tapFeedback();
                setOutcome(o.value);
              }}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor:
                    outcome === o.value
                      ? colors.tintSoft
                      : pressed
                        ? colors.backgroundSelected
                        : colors.backgroundElement,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={outcome === o.value ? { color: colors.tint } : undefined}>
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
              accessibilityLabel="Conclusion"
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
            accessibilityRole="button"
            disabled={!canSave || save.isPending}
            onPress={() => save.mutate()}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity: !canSave ? 0.4 : pressed ? 0.85 : 1,
                marginTop: Spacing.three,
              },
            ]}>
            <ThemedText type="smallBold" style={{ color: colors.onTint }}>
              {save.isPending ? 'Archiving…' : 'Seal the verdict'}
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOnDecision(false)}
            style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.6 : 1 }]}>
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
    minHeight: 44,
    justifyContent: 'center',
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
  primaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.six,
    borderRadius: Spacing.three,
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
});
