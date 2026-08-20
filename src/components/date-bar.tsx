// Todoist-style week strip: month label, weekday letters over day numbers,
// today/selected in a filled red circle, activity dots under days with logs.

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(t: number): number {
  return new Date(t).setHours(0, 0, 0, 0);
}

export function DateBar({
  now,
  selected,
  activity = {},
  onSelect,
}: {
  now: number;
  selected: number; // startOfDay ms
  activity?: Record<number, boolean>;
  onSelect: (dayStart: number) => void;
}) {
  const colors = useTheme();
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY_MS);

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" style={{ color: colors.textSecondary }}>
        {new Date(selected).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </ThemedText>
      <View style={styles.row}>
        {days.map((d) => {
          const date = new Date(d);
          const isSelected = d === selected;
          const isToday = d === today;
          return (
            <Pressable key={d} onPress={() => onSelect(d)} style={styles.day} hitSlop={4}>
              <ThemedText
                type="small"
                style={{ color: colors.textSecondary, fontSize: 10, letterSpacing: 1 }}>
                {date.toLocaleDateString(undefined, { weekday: 'narrow' }).toUpperCase()}
              </ThemedText>
              <View
                style={[
                  styles.numCircle,
                  isSelected && { backgroundColor: colors.tint },
                  !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.tint },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={
                    isSelected
                      ? { color: colors.onTint }
                      : isToday
                        ? { color: colors.tint }
                        : undefined
                  }>
                  {date.getDate()}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.activityDot,
                  { backgroundColor: activity[d] ? colors.tint : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  numCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
