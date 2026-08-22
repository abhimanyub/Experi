// Phase timeline (redesign): one rounded track per phase, width ∝ planned
// days. Done phases are full, the active phase fills to its progress with a
// spring, future phases are dashed outlines. Doubles as the color legend.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { phaseColor } from '@/constants/viz';
import { actualDays } from '@/domain/phase-engine';
import { Phase } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

function ActiveFill({ fraction, color }: { fraction: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(Math.min(1, Math.max(0.04, fraction)), {
      damping: 22,
      stiffness: 90,
      reduceMotion: ReduceMotion.System,
    });
  }, [fraction, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />;
}

export function PhaseTimeline({ phases, now }: { phases: Phase[]; now: number }) {
  const colors = useTheme();
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const total = ordered.reduce((a, p) => a + p.plannedDays, 0) || 1;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {ordered.map((p, i) => {
          const c = phaseColor('dark', i);
          const isActive = p.startedAt !== null && p.endedAt === null;
          const isDone = p.endedAt !== null;
          const future = p.startedAt === null;
          return (
            <View
              key={p.id}
              style={[
                styles.segment,
                { flex: p.plannedDays / total },
                future
                  ? { borderWidth: 1.5, borderColor: c, borderStyle: 'dashed', opacity: 0.6 }
                  : { backgroundColor: `${c}26` },
              ]}>
              {isDone && <View style={[styles.fill, { backgroundColor: c, transform: [] }]} />}
              {isActive && (
                <ActiveFill fraction={actualDays(p, now) / p.plannedDays} color={c} />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        {ordered.map((p, i) => (
          <View key={p.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: phaseColor('dark', i) }]} />
            <ThemedText type="small" style={{ color: colors.textSecondary, fontWeight: 600 }}>
              {p.label} · {p.plannedDays}d
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  bar: {
    flexDirection: 'row',
    height: 12,
    gap: 4,
  },
  segment: {
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 99,
    transformOrigin: 'left',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
