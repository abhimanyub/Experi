// Last-7-days bar (Todoist/Notion-Calendar style): pick a day to review it,
// log for it, or mark it missed. Selected day fills with the tint.

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
  onSelect,
}: {
  now: number;
  selected: number; // startOfDay ms
  onSelect: (dayStart: number) => void;
}) {
  const colors = useTheme();
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY_MS);

  return (
    <View style={styles.row}>
      {days.map((d) => {
        const date = new Date(d);
        const isSelected = d === selected;
        const isToday = d === today;
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            style={[
              styles.day,
              { backgroundColor: isSelected ? colors.tint : colors.backgroundElement },
              isToday && !isSelected && { borderWidth: 1.5, borderColor: colors.tint },
            ]}>
            <ThemedText
              type="small"
              style={{ color: isSelected ? colors.onTint : colors.textSecondary, fontSize: 10 }}>
              {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
            </ThemedText>
            <ThemedText
              type="smallBold"
              style={isSelected ? { color: colors.onTint } : undefined}>
              {date.getDate()}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.one + 2,
    borderRadius: Spacing.two + 2,
    gap: 1,
  },
});
