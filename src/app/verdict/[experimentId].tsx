// Verdict flow (redesign): one decision page — hypothesis, outcome cards,
// written conclusion — then "Stamp it": the verdict persists and the stamp
// slams in on a full-screen overlay. Data review lives on the detail screen.
// Never a trap: Close is always available, typed work warns before discarding.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ChipRow } from '@/components/wizard/chips';
import { Display, MaxContentWidth, Spacing } from '@/constants/theme';
import { getExperimentDetail, saveVerdict } from '@/db/repo';
import { VerdictOutcome } from '@/domain/types';
import { confirmAction } from '@/lib/confirm';
import { stampFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';

const OUTCOMES: { value: VerdictOutcome; label: string; blurb: string; color: string }[] = [
  { value: 'supported', label: 'Supported', blurb: 'The data backs the hypothesis.', color: '#4CC38A' },
  { value: 'refuted', label: 'Refuted', blurb: 'The data contradicts it. Also a win.', color: '#E2705F' },
  { value: 'inconclusive', label: 'Inconclusive', blurb: 'Not enough signal. A valid, honest verdict.', color: '#A3948A' },
  { value: 'contaminated', label: 'Contaminated', blurb: 'Confounders ruined the data. Re-run it.', color: '#FFB454' },
];

/** Full-screen stamp slam: scale 3.2 → settle at -9°, then a shake. */
function StampOverlay({ word, color, onDone }: { word: string; color: string; onDone: () => void }) {
  const scale = useSharedValue(3.2);
  const shake = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(0.9, { duration: 220, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System }),
      withSpring(1, { damping: 9, stiffness: 220, reduceMotion: ReduceMotion.System })
    );
    shake.value = withDelay(
      300,
      withSequence(
        ...[-6, 5, -4, 3, -2, 0].map((x) =>
          withTiming(x, { duration: 80, reduceMotion: ReduceMotion.System })
        )
      )
    );
  }, [scale, shake]);
  const stampStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shake.value },
      { scale: scale.value },
      { rotate: '-9deg' },
    ],
  }));
  const colors = useTheme();

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.stamp, { borderColor: color, shadowColor: color }, stampStyle]}>
        <ThemedText
          maxFontSizeMultiplier={1.1}
          style={[styles.stampWord, { color }]}>
          {word}
        </ThemedText>
      </Animated.View>
      <Animated.View entering={FadeIn.delay(800).duration(400)}>
        <ThemedText type="small" style={{ color: colors.textSecondary, fontSize: 15 }}>
          Verdict recorded. Nice science.
        </ThemedText>
      </Animated.View>
      <Animated.View entering={FadeIn.delay(1050).duration(400)}>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={({ pressed }) => [
            styles.overlayButton,
            { backgroundColor: colors.cream, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}>
          <ThemedText type="smallBold" style={{ fontSize: 16, color: colors.onCream }}>
            Save to Insights
          </ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function VerdictFlow() {
  const { experimentId } = useLocalSearchParams<{ experimentId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useTheme();
  const queryClient = useQueryClient();

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

  // Two-beat stamp: heavy thud on save, success chime as the ink settles.
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
    return <ThemedView style={styles.container}>{screenOptions}</ThemedView>;
  }
  const { experiment } = detail;

  const conclusionLength = conclusion.trim().length;
  const canStamp = outcome !== null && conclusionLength > 0;
  const picked = OUTCOMES.find((o) => o.value === outcome);

  const finish = () => {
    router.back();
    router.push('/history' as never);
  };

  return (
    <ThemedView style={styles.container}>
      {screenOptions}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(160)} style={{ gap: 10 }}>
          <ThemedText type="title" style={{ fontSize: 44, lineHeight: 48 }}>
            The verdict
          </ThemedText>
          <ThemedView
            type="backgroundElement"
            style={[styles.card, { borderColor: colors.cardBorder }]}>
            <ThemedText type="small" style={{ color: colors.textSecondary, lineHeight: 21 }}>
              <ThemedText type="label">Hypothesis · </ThemedText>
              {experiment.hypothesis}
            </ThemedText>
          </ThemedView>

          {OUTCOMES.map((o) => {
            const on = outcome === o.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${o.label}. ${o.blurb}`}
                onPress={() => {
                  tapFeedback();
                  setOutcome(o.value);
                }}
                style={({ pressed }) => [
                  styles.outcomeCard,
                  {
                    backgroundColor: on ? `${o.color}1F` : colors.backgroundElement,
                    borderColor: on ? o.color : 'rgba(255,255,255,0.07)',
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}>
                <ThemedText type="smallBold" style={{ fontSize: 16, color: o.color }}>
                  {o.label}
                </ThemedText>
                <ThemedText type="small" style={{ color: colors.textSecondary, fontSize: 13.5 }}>
                  {o.blurb}
                </ThemedText>
              </Pressable>
            );
          })}

          <ThemedText type="label" style={{ marginTop: Spacing.two }}>
            Conclusion — in your own words
          </ThemedText>
          <ThemedView
            type="backgroundElement"
            style={[styles.conclusionBox, { borderColor: 'rgba(255,255,255,0.1)' }]}>
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

          <ThemedText type="label" style={{ marginTop: Spacing.two }}>
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

          {canStamp ? (
            <Pressable
              accessibilityRole="button"
              disabled={save.isPending}
              onPress={() => save.mutate()}
              style={({ pressed }) => [
                styles.stampButton,
                { backgroundColor: colors.cream, transform: [{ scale: pressed ? 0.94 : 1 }] },
              ]}>
              <ThemedText type="smallBold" style={{ fontSize: 17, lineHeight: 22, color: colors.onCream }}>
                {save.isPending ? 'Stamping…' : 'Stamp it'}
              </ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.stampButton, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <ThemedText type="smallBold" style={{ fontSize: 17, lineHeight: 22, color: colors.textFaint }}>
                {outcome === null ? 'Pick an outcome to stamp' : 'Write your conclusion to stamp'}
              </ThemedText>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {saved && picked && (
        <StampOverlay word={picked.label.toUpperCase()} color={picked.color} onDone={finish} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.three,
  },
  outcomeCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 17,
    paddingVertical: 15,
    gap: 3,
  },
  conclusionBox: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  conclusionInput: {
    minHeight: 120,
    paddingVertical: Spacing.two,
    fontSize: 15,
    lineHeight: 22,
  },
  stampButton: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: 17,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(12,9,7,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    zIndex: 40,
  },
  stamp: {
    borderWidth: 6,
    borderRadius: 14,
    paddingHorizontal: 34,
    paddingVertical: 18,
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  stampWord: {
    fontFamily: Display.extraBold,
    fontSize: 38,
    lineHeight: 46,
    letterSpacing: 6,
  },
  overlayButton: {
    paddingHorizontal: 46,
    paddingVertical: 15,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
