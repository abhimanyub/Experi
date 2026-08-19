// One-go check-in flow: walks every pending metric sequentially with a progress
// bar, haptic feedback per answer, and a celebration screen at the end.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
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

/** The pour: a done segment fills left-to-right with a liquid spring. */
function PourSegment({ state }: { state: 'done' | 'active' | 'todo' }) {
  const colors = useTheme();
  const p = useSharedValue(state === 'done' ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(state === 'done' ? 1 : 0, { damping: 15, stiffness: 90 });
  }, [state, p]);
  const liquid = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View
      style={[
        styles.progressSegment,
        { backgroundColor: state === 'active' ? colors.tintSoft : colors.backgroundElement },
      ]}>
      <Animated.View style={[styles.progressLiquid, { backgroundColor: colors.success }, liquid]} />
      {state === 'active' && (
        <View style={[styles.progressLiquid, { backgroundColor: colors.tint, width: '18%' }]} />
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

  const answer = (value: number) => {
    if (!metric) return;
    tapFeedback();
    log.mutate({ metricId: metric.id, value });
    setNumericRaw('');
    if (stepIndex + 1 >= total) {
      setCelebrating(true);
      successFeedback();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const skip = () => {
    if (stepIndex + 1 >= total) {
      setCelebrating(true);
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  if (!bundle || queue === null) return <ThemedView style={styles.container} />;

  if (celebrating || total === 0 || !metric) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        {celebrating && <ConfettiBurst />}
        <Animated.View entering={ZoomIn.springify()} style={styles.celebrateIcon}>
          <View style={[styles.bigCheck, { backgroundColor: colors.success }]}>
            <ThemedText type="title" style={{ color: colors.onTint, fontSize: 40, lineHeight: 48 }}>
              ✓
            </ThemedText>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(150)}>
          <ThemedText type="subtitle" style={styles.center}>
            {total === 0 ? 'Nothing pending' : 'Checked in'}
          </ThemedText>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(250)}>
          <ThemedText type="small" style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {total === 0
              ? 'All observations for today are already logged.'
              : `${total} observation${total === 1 ? '' : 's'} logged for ${bundle.experiment.title}.`}
          </ThemedText>
        </Animated.View>
        <Pressable
          onPress={() => router.back()}
          style={[styles.doneButton, { backgroundColor: colors.tint }]}>
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
    <ThemedView style={styles.container}>
      {/* progress — each answered question pours its segment full */}
      <View style={styles.progressRow}>
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

      <Animated.View key={metric.id} entering={FadeInDown.springify()} style={styles.question}>
        <ThemedText type="subtitle">{metric.name}</ThemedText>

        {metric.type === 'scale' && scaleCfg && (
          <View style={styles.scaleRow}>
            {Array.from(
              { length: (scaleCfg.max ?? 5) - (scaleCfg.min ?? 1) + 1 },
              (_, i) => (scaleCfg.min ?? 1) + i
            ).map((v) => (
              <Pressable
                key={v}
                onPress={() => answer(v)}
                style={({ pressed }) => [
                  styles.scaleDot,
                  {
                    backgroundColor: pressed ? colors.tint : colors.backgroundElement,
                  },
                ]}>
                <ThemedText type="subtitle">{v}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {metric.type === 'boolean' && (
          <View style={styles.scaleRow}>
            <Pressable
              onPress={() => answer(1)}
              style={[styles.boolButton, { backgroundColor: colors.successSoft }]}>
              <ThemedText type="subtitle">✓</ThemedText>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Yes
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => answer(0)}
              style={[styles.boolButton, { backgroundColor: colors.backgroundElement }]}>
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
                style={[styles.numericInput, { color: colors.text }]}
              />
            </ThemedView>
            <Pressable
              disabled={!numericValid}
              onPress={() => answer(numericValue)}
              style={[
                styles.nextButton,
                { backgroundColor: colors.tint, opacity: numericValid ? 1 : 0.4 },
              ]}>
              <ThemedText type="smallBold" style={{ color: colors.onTint }}>
                Next
              </ThemedText>
            </Pressable>
          </View>
        )}
      </Animated.View>

      <View style={{ flex: 1 }} />
      <Pressable onPress={skip} style={styles.skipButton}>
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          Skip for now
        </ThemedText>
      </Pressable>
    </ThemedView>
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
    flexDirection: 'row',
  },
  progressLiquid: {
    height: '100%',
    borderRadius: 3,
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
    width: 56,
    height: 56,
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
  },
});
