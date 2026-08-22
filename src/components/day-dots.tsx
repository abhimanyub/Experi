// Day-dot strip (redesign): one dot per planned day across all phases.
// Done days glow in their phase color, the current day is an outlined ring
// (pulsing while unlogged), remaining days in the current phase are faint,
// and future phases render as dashed outlines in their phase color.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { phaseColor } from '@/constants/viz';
import { Phase } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

const MAX_DOTS = 21;

function PulseDot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 800, reduceMotion: ReduceMotion.System }),
        withTiming(1, { duration: 800, reduceMotion: ReduceMotion.System })
      ),
      -1
    );
  }, [p, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return <Animated.View style={[styles.dot, { borderWidth: 2, borderColor: color }, style]} />;
}

export function DayDots({
  phases,
  dayIndex,
  loggedToday,
}: {
  phases: Phase[]; // ordered
  dayIndex: number; // 0-based day within the whole experiment
  loggedToday: boolean;
}) {
  const colors = useTheme();
  const days: { phaseIdx: number; state: 'done' | 'current' | 'rest' | 'future' }[] = [];
  let cursor = 0;
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  ordered.forEach((p, pi) => {
    const started = p.startedAt !== null;
    for (let d = 0; d < p.plannedDays; d++) {
      const abs = cursor + d;
      days.push({
        phaseIdx: pi,
        state: !started
          ? 'future'
          : abs < dayIndex || (abs === dayIndex && loggedToday)
            ? 'done'
            : abs === dayIndex
              ? 'current'
              : 'rest',
      });
    }
    cursor += p.plannedDays;
  });
  const shown = days.slice(0, MAX_DOTS);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Day ${Math.min(dayIndex + 1, days.length)} of ${days.length}`}>
      {shown.map((d, i) => {
        const c = phaseColor('dark', d.phaseIdx);
        if (d.state === 'current') return <PulseDot key={i} color={c} />;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              d.state === 'done' && { backgroundColor: c, shadowColor: c },
              d.state === 'done' && styles.glow,
              d.state === 'rest' && { backgroundColor: colors.backgroundSelected },
              d.state === 'future' && {
                borderWidth: 1.5,
                borderColor: c,
                borderStyle: 'dashed',
                opacity: 0.55,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 15,
    height: 15,
    borderRadius: 8,
  },
  glow: {
    shadowOpacity: 0.4,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
});
