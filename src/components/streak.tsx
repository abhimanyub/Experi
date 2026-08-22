// Streak flame UI (redesign): amber pill with a gently dancing 🔥, and the
// "streak energy" shimmer bar toward a 7-day week.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { STREAK_GOAL, streakGoalCopy } from '@/domain/streak';
import { useTheme } from '@/hooks/use-theme';

export function Flame({ size = 15 }: { size?: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System })
      ),
      -1
    );
  }, [p, reduced]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + 0.18 * p.value },
      { rotate: `${-4 + 9 * p.value}deg` },
    ],
  }));
  return (
    <Animated.Text style={[{ fontSize: size }, style]} accessibilityElementsHidden>
      🔥
    </Animated.Text>
  );
}

export function StreakPill({ streak }: { streak: number }) {
  const colors = useTheme();
  return (
    <View
      style={[styles.pill, { backgroundColor: colors.warningSoft, borderColor: 'rgba(255,180,84,0.25)' }]}
      accessible
      accessibilityLabel={`${streak}-day streak`}>
      <Flame />
      <ThemedText type="smallBold" style={{ color: colors.warning }}>
        {streak}-day streak
      </ThemedText>
    </View>
  );
}

export function StreakEnergyBar({ streak }: { streak: number }) {
  const colors = useTheme();
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withSpring(Math.min(1, streak / STREAK_GOAL), {
      damping: 22,
      stiffness: 90,
      reduceMotion: ReduceMotion.System,
    });
  }, [fill, streak]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View
      style={[styles.energyCard, { backgroundColor: colors.backgroundElement, borderColor: colors.cardBorder }]}
      accessible
      accessibilityLabel={`Streak energy: ${streak} of ${STREAK_GOAL} days`}>
      <Flame size={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <ThemedText type="label" themeColor="textSecondary">
          Streak energy — {streakGoalCopy(streak)}
        </ThemedText>
        <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
  },
  energyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  track: {
    height: 8,
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: '#E0574A',
    transformOrigin: 'left',
    // amber tip via gradient feel: solid ember base, amber overlay handled by shadow
    shadowColor: '#FFB454',
    shadowOpacity: 0.7,
    shadowRadius: 4,
    shadowOffset: { width: 2, height: 0 },
  },
});
