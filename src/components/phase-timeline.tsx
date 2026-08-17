// Horizontal phase timeline: segment width ∝ planned days, active phase ringed.
// Doubles as the color legend for the dot charts (same phase → same slot color).

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { phaseColor } from '@/constants/viz';
import { Phase } from '@/domain/types';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export function PhaseTimeline({ phases, now }: { phases: Phase[]; now: number }) {
  const colors = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);
  const total = ordered.reduce((a, p) => a + p.plannedDays, 0) || 1;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {ordered.map((p, i) => {
          const isActive = p.startedAt !== null && p.endedAt === null;
          const isDone = p.endedAt !== null;
          return (
            <View
              key={p.id}
              style={[
                styles.segment,
                {
                  flex: p.plannedDays / total,
                  backgroundColor: phaseColor(scheme, i),
                  opacity: isDone ? 1 : isActive ? 1 : 0.25,
                  borderWidth: isActive ? 2 : 0,
                  borderColor: colors.text,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.legend}>
        {ordered.map((p, i) => (
          <View key={p.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: phaseColor(scheme, i) }]} />
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {p.label} {p.plannedDays}d
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 2, // 2px surface gap between adjacent fills
  },
  segment: {
    borderRadius: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one / 2 + 2,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
