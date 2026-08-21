// One-go check-in flow: walks every pending metric sequentially with a progress
// bar, haptic feedback per answer, and a celebration screen at the end.
// A step only advances after its write lands — no confetti over lost data.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';

import { ConfettiBurst } from '@/components/confetti';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getActiveExperiments, logObservation } from '@/db/repo';
import { Metric, ScaleConfig } from '@/domain/types';
import { successFeedback, tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

/** The pour: a done segment fills left-to-right. Critically damped — a
 * progress bar overshooting its own value reads as a glitch. */
function PourSegment({ state }: { state: 'done' | 'active' | 'todo' }) {
  const colors = useTheme();
  const p = useSharedValue(state === 'done' ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(state === 'done' ? 1 : 0, {
      damping: 20,
      stiffness: 120,
      overshootClamping: true,
      reduceMotion: ReduceMotion.System,
    });
  }, [state, p]);
  const liquid = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <View
      style={[
        styles.progressSegment,
        { backgroundColor: state === 'active' ? colors.tintSoft : colors.backgroundElement },
      ]}>
      <Animated.View
        style={[styles.progressLiquid, { backgroundColor: colors.success }, liquid]}
      />
      {state === 'active' && (
        <View
          style={[
            styles.progressLiquid,
            { backgroundColor: colors.tint, transform: [{ scaleX: 0.18 }] },
          ]}
        />
      )}
    </View>
  );
}

export default function CheckinFlow() {
  const { experimentId } = useLocalSearchParams<{ experimentId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [numericRaw, setNumericRaw] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);

  const { data: bundles = [] } = useQuery({
    queryKey: ['active-experiments'],
    queryFn: () => getActiveExperiments(Date.now()),
  });
  const bundle = bundles.find((b) => b.experiment.id === experimentId);

  // Pending = scheduled metrics not yet fully logged today, then on-demand ones.
  const pending = useMemo(() => {
    if (!bundle) return [];
    const scheduled = bundle.metrics.filter(
      (m) =>
        'timesPerDay' in m.schedule && (bundle.todayCounts[m.id] ?? 0) < m.schedule.timesPerDay
    );
    return scheduled;
  }, [bundle]);

  // Snapshot the queue once loaded so completing steps doesn't reshuffle it.
  const [queue, setQueue] = useState<Metric[] | null>(null);
  useEffect(() => {
    if (queue === null && bundle) setQueue(pending);
  }, [bundle, pending, queue]);

  const log = useMutation({
    mutationFn: (params: { metricId: string; value: number }) =>
      logObservation({ ...params, now: Date.now() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-experiments'] }),
  });

  const metric = queue?.[stepIndex];
  const total = queue?.length ?? 0;
  const loggedCount = total - skippedCount;
  const allSkipped = total > 0 && skippedCount >= total;

  const advance = () => {
    if (stepIndex + 1 >= total) {
      setCelebrating(true);
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  // Advance only once the write lands; failures surface via the global
  // mutation error handler and the step stays put for a retry.
  const answer = (value: number) => {
    if (!metric || log.isPending) return;
    tapFeedback();
    log.mutate(
      { metricId: metric.id, value },
      {
        onSuccess: () => {
          setNumericRaw('');
          if (stepIndex + 1 >= total) successFeedback();
          advance();
        },
      }
    );
  };

  const skip = () => {
    setSkippedCount((n) => n + 1);
    advance();
  };

  if (!bundle || queue === null) return <ThemedView style={styles.container} />;

  if (celebrating || total === 0 || !metric) {
    const celebrateForReal = celebrating && !allSkipped && total > 0;
    return (
      <ThemedView style={[styles.container, styles.center]}>
        {celebrateForReal && <ConfettiBurst />}
        <Animated.View
          entering={ZoomIn.springify().damping(15).stiffness(140)}
          style={styles.celebrateIcon}>
          <View
            style={[
              styles.bigCheck,
              { backgroundColor: celebrateForReal ? colors.success : colors.backgroundSelected },
            ]}>
            <ThemedText
              type="title"
              maxFontSizeMultiplier={1.2}
              style={{
                color: celebrateForReal ? colors.onTint : colors.textSecondary,
                fontSize: 40,
                lineHeight: 48,
              }}>
              {celebrateForReal || total === 0 ? '✓' : '–'}
            </ThemedText>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(150)}>
          <ThemedText type="subtitle" style={styles.center}>
            {total === 0 ? 'Nothing pending' : allSkipped ? 'Skipped for now' : 'Checked in'}
          </ThemedText>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(250)}>
          <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {total === 0
              ? 'All observations for today are already logged.'
              : allSkipped
                ? `Nothing logged — ${bundle.experiment.title} is waiting when you are.`
                : `${loggedCount} observation${loggedCount === 1 ? '' : 's'} logged for ${bundle.experiment.title}.${skippedCount > 0 ? ` ${skippedCount} skipped.` : ''}`}
          </ThemedText>
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText type="smallBold" style={{ color: colors.onTint }}>
            Done
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const scaleCfg = metric.type === 'scale' ? (metric.config as ScaleConfig) : null;
  const numericValue = Number(numericRaw.replace(',', '.'));
  const numericValid = numericRaw.trim() !== '' && Number.isFinite(numericValue);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        {/* progress — each answered question pours its segment full */}
        <View
          style={styles.progressRow}
          accessibilityRole="progressbar"
          accessibilityLabel="Check-in progress"
          accessibilityValue={{ min: 0, max: total, now: stepIndex }}>
          {queue.map((m, i) => (
            <PourSegment
              key={m.id}
              state={i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'}
            />
          ))}
        </View>
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          {stepIndex + 1} of {total} · {bundle.experiment.title}
        </ThemedText>

        <Animated.View
          key={metric.id}
          entering={FadeInDown.springify().damping(18).stiffness(160)}
          exiting={FadeOutUp.duration(150)}
          style={styles.question}>
          <ThemedText type="subtitle">{metric.name}</ThemedText>

          {metric.type === 'scale' && scaleCfg && (
            <View style={styles.scaleRow}>
              {Array.from(
                { length: (scaleCfg.max ?? 5) - (scaleCfg.min ?? 1) + 1 },
                (_, i) => (scaleCfg.min ?? 1) + i
              ).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityLabel={`${metric.name}: ${v}`}
                  onPress={() => answer(v)}
                  style={({ pressed }) => [
                    styles.scaleDot,
                    {
                      backgroundColor: pressed ? colors.tint : colors.backgroundElement,
                    },
                  ]}>
                  <ThemedText type="subtitle" maxFontSizeMultiplier={1.4}>
                    {v}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}

          {metric.type === 'boolean' && (
            <View style={styles.scaleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${metric.name}: yes`}
                onPress={() => answer(1)}
                style={({ pressed }) => [
                  styles.boolButton,
                  { backgroundColor: pressed ? colors.backgroundSelected : colors.successSoft },
                ]}>
                <ThemedText type="subtitle">✓</ThemedText>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  Yes
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${metric.name}: no`}
                onPress={() => answer(0)}
                style={({ pressed }) => [
                  styles.boolButton,
                  {
                    backgroundColor: pressed
                      ? colors.backgroundSelected
                      : colors.backgroundElement,
                  },
                ]}>
                <ThemedText type="subtitle">✗</ThemedText>
                <ThemedText type="small" style={{ color: colors.textSecondary }}>
                  No
                </ThemedText>
              </Pressable>
            </View>
          )}

          {(metric.type === 'numeric' || metric.type === 'currency' || metric.type === 'duration') && (
            <View style={styles.numericCol}>
              <ThemedView type="backgroundElement" style={styles.numericBox}>
                <TextInput
                  autoFocus
                  keyboardType="decimal-pad"
                  value={numericRaw}
                  onChangeText={setNumericRaw}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={`${metric.name} value`}
                  style={[styles.numericInput, { color: colors.text }]}
                />
              </ThemedView>
              <Pressable
                accessibilityRole="button"
                disabled={!numericValid || log.isPending}
                onPress={() => answer(numericValue)}
                style={({ pressed }) => [
                  styles.nextButton,
                  {
                    backgroundColor: colors.tint,
                    opacity: !numericValid ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText type="smallBold" style={{ color: colors.onTint }}>
                  Next
                </ThemedText>
              </Pressable>
            </View>
          )}
        </Animated.View>

        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          onPress={skip}
          style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Skip for now
          </ThemedText>
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: Spacing.three,
  },
  celebrateIcon: {
    alignItems: 'center',
  },
  bigCheck: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressLiquid: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 3,
    transformOrigin: 'left',
  },
  question: {
    gap: Spacing.four,
    marginTop: Spacing.four,
  },
  scaleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  scaleDot: {
    minWidth: 56,
    minHeight: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boolButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  numericCol: {
    gap: Spacing.two,
  },
  numericBox: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  numericInput: {
    fontSize: 32,
    paddingVertical: Spacing.three,
  },
  nextButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
});
