// One-go check-in flow (redesign): one big Bricolage question at a time,
// energy tiles with labels, Yes/No tiles, a single filling progress bar.
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
import { Flame } from '@/components/streak';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getActiveExperiments, getActivityDays, logObservation } from '@/db/repo';
import { computeStreak } from '@/domain/streak';
import { Metric, ScaleConfig } from '@/domain/types';
import { successFeedback, tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

const ENERGY_LABELS = ['Drained', 'Low', 'OK', 'Good', 'Wired'];

function ProgressBar({ fraction }: { fraction: number }) {
  const colors = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(fraction, {
      damping: 20,
      stiffness: 120,
      overshootClamping: true,
      reduceMotion: ReduceMotion.System,
    });
  }, [fraction, p]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
      <Animated.View style={[styles.trackFill, { backgroundColor: colors.tintStrong }, fill]} />
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
  const [picked, setPicked] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);

  const { data: bundles = [] } = useQuery({
    queryKey: ['active-experiments'],
    queryFn: () => getActiveExperiments(Date.now()),
  });
  const bundle = bundles.find((b) => b.experiment.id === experimentId);

  const { data: activity = {} } = useQuery({
    queryKey: ['activity-days'],
    queryFn: () => getActivityDays(Date.now(), 366),
  });
  const streak = computeStreak(activity, Date.now());

  // Pending = scheduled metrics not yet fully logged today.
  const pending = useMemo(() => {
    if (!bundle) return [];
    return bundle.metrics.filter(
      (m) =>
        'timesPerDay' in m.schedule && (bundle.todayCounts[m.id] ?? 0) < m.schedule.timesPerDay
    );
  }, [bundle]);

  // Snapshot the queue once loaded so completing steps doesn't reshuffle it.
  const [queue, setQueue] = useState<Metric[] | null>(null);
  useEffect(() => {
    if (queue === null && bundle) setQueue(pending);
  }, [bundle, pending, queue]);

  const log = useMutation({
    mutationFn: (params: { metricId: string; value: number }) =>
      logObservation({ ...params, now: Date.now() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['activity-days'] });
    },
  });

  const metric = queue?.[stepIndex];
  const total = queue?.length ?? 0;
  const loggedCount = total - skippedCount;
  const allSkipped = total > 0 && skippedCount >= total;

  const advance = () => {
    setPicked(null);
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
    setPicked(value);
    log.mutate(
      { metricId: metric.id, value },
      {
        onSuccess: () => {
          setNumericRaw('');
          if (stepIndex + 1 >= total) successFeedback();
          advance();
        },
        onError: () => setPicked(null),
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
        <Animated.View entering={ZoomIn.springify().damping(15).stiffness(140)}>
          <View
            style={[
              styles.bigCheck,
              celebrateForReal || total === 0
                ? { backgroundColor: '#2E9E69', shadowColor: colors.success }
                : { backgroundColor: colors.backgroundSelected },
            ]}>
            <ThemedText
              maxFontSizeMultiplier={1.2}
              style={{
                color: celebrateForReal || total === 0 ? '#FFFFFF' : colors.textSecondary,
                fontSize: 44,
                lineHeight: 52,
              }}>
              {celebrateForReal || total === 0 ? '✓' : '–'}
            </ThemedText>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(150)}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
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
        {celebrateForReal && (
          <Animated.View
            entering={ZoomIn.delay(400).springify().damping(14).stiffness(160)}
            style={[styles.streakBump, { backgroundColor: colors.warningSoft }]}>
            <Flame size={18} />
            <ThemedText type="smallBold" style={{ fontSize: 16, color: colors.warning }}>
              Streak → {streak} day{streak === 1 ? '' : 's'}
            </ThemedText>
          </Animated.View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: colors.cream, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}>
          <ThemedText type="smallBold" style={{ fontSize: 17, lineHeight: 22, color: colors.onCream }}>
            Done
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const scaleCfg = metric.type === 'scale' ? (metric.config as ScaleConfig) : null;
  const scaleMin = scaleCfg?.min ?? 1;
  const scaleMax = scaleCfg?.max ?? 5;
  const isEnergyScale = scaleMin === 1 && scaleMax === 5;
  const numericValue = Number(numericRaw.replace(',', '.'));
  const numericValid = numericRaw.trim() !== '' && Number.isFinite(numericValue);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ProgressBar fraction={(stepIndex + 1) / total} />
        <ThemedText type="smallBold" style={{ color: colors.textSecondary, fontSize: 13 }}>
          {stepIndex + 1} of {total} · {bundle.experiment.title}
        </ThemedText>

        <Animated.View
          key={metric.id}
          entering={FadeInDown.springify().damping(18).stiffness(160)}
          exiting={FadeOutUp.duration(150)}
          style={styles.question}>
          <ThemedText type="subtitle">{metric.name}</ThemedText>

          {metric.type === 'scale' && scaleCfg && (
            <View style={styles.tileRow}>
              {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i).map((v) => {
                const on = picked === v;
                return (
                  <Pressable
                    key={v}
                    accessibilityRole="button"
                    accessibilityLabel={`${metric.name}: ${v}${isEnergyScale ? `, ${ENERGY_LABELS[v - 1]}` : ''}`}
                    onPress={() => answer(v)}
                    style={({ pressed }) => [
                      styles.energyTile,
                      {
                        backgroundColor: on ? colors.cream : 'rgba(255,255,255,0.055)',
                        borderColor: on ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)',
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                      },
                    ]}>
                    <ThemedText
                      type="headline"
                      maxFontSizeMultiplier={1.3}
                      style={{ fontSize: 26, lineHeight: 31, color: on ? colors.onCream : colors.text }}>
                      {v}
                    </ThemedText>
                    {isEnergyScale && (
                      <ThemedText
                        maxFontSizeMultiplier={1.3}
                        style={{
                          fontSize: 10.5,
                          lineHeight: 13,
                          fontWeight: 700,
                          opacity: 0.7,
                          color: on ? colors.onCream : colors.text,
                        }}>
                        {ENERGY_LABELS[v - 1]}
                      </ThemedText>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {metric.type === 'boolean' && (
            <View style={styles.tileRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${metric.name}: yes`}
                onPress={() => answer(1)}
                style={({ pressed }) => [
                  styles.boolTile,
                  {
                    backgroundColor: 'rgba(76,195,138,0.12)',
                    borderColor: 'rgba(76,195,138,0.4)',
                    transform: [{ scale: pressed ? 0.92 : 1 }],
                  },
                ]}>
                <ThemedText style={{ fontSize: 34, lineHeight: 40, color: colors.success, fontWeight: 800 }}>
                  ✓
                </ThemedText>
                <ThemedText type="smallBold" style={{ fontSize: 16, color: colors.success }}>
                  Yes
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${metric.name}: no`}
                onPress={() => answer(0)}
                style={({ pressed }) => [
                  styles.boolTile,
                  {
                    backgroundColor: 'rgba(224,87,74,0.08)',
                    borderColor: 'rgba(224,87,74,0.35)',
                    transform: [{ scale: pressed ? 0.92 : 1 }],
                  },
                ]}>
                <ThemedText style={{ fontSize: 34, lineHeight: 40, color: colors.tint, fontWeight: 800 }}>
                  ✗
                </ThemedText>
                <ThemedText type="smallBold" style={{ fontSize: 16, color: colors.tint }}>
                  No
                </ThemedText>
              </Pressable>
            </View>
          )}

          {(metric.type === 'numeric' || metric.type === 'currency' || metric.type === 'duration') && (
            <View style={styles.numericCol}>
              <ThemedView
                type="backgroundElement"
                style={[styles.numericBox, { borderColor: colors.cardBorder }]}>
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
                    backgroundColor: colors.cream,
                    opacity: !numericValid ? 0.4 : 1,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                ]}>
                <ThemedText type="smallBold" style={{ fontSize: 17, lineHeight: 22, color: colors.onCream }}>
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
          <ThemedText type="smallBold" style={{ color: colors.textFaint }}>
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
    gap: 10,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  track: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: Spacing.two,
  },
  trackFill: {
    height: '100%',
    borderRadius: 99,
    transformOrigin: 'left',
  },
  bigCheck: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  streakBump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,180,84,0.35)',
  },
  doneButton: {
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  question: {
    gap: Spacing.four,
    marginTop: Spacing.three,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  energyTile: {
    flex: 1,
    minWidth: 56,
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
  },
  boolTile: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 34,
  },
  numericCol: {
    gap: Spacing.two,
  },
  numericBox: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  numericInput: {
    fontSize: 32,
    paddingVertical: Spacing.three,
  },
  nextButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 999,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
});
