// Todoist-style week strip: month label, weekday letters over day numbers,
// today/selected in a filled red circle, activity dots under days with logs.
// Weeks page horizontally — swipe back through the past year with native
// 1:1 drag tracking and velocity-projected snapping (paging), bounce at the
// edges. The rightmost page always ends on today; no future days exist.

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_BACK = 52;

export function startOfDay(t: number): number {
  return new Date(t).setHours(0, 0, 0, 0);
}

function WeekRow({
  days,
  today,
  selected,
  activity,
  onSelect,
  width,
}: {
  days: number[];
  today: number;
  selected: number;
  activity: Record<number, boolean>;
  onSelect: (dayStart: number) => void;
  width?: number;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.row, width ? { width } : null]}>
      {days.map((d) => {
        const date = new Date(d);
        const isSelected = d === selected;
        const isToday = d === today;
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityLabel={date.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(d)}
            style={({ pressed }) => [styles.day, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={8}>
            <ThemedText
              type="small"
              maxFontSizeMultiplier={1.4}
              style={{ color: colors.textSecondary, fontSize: 11, letterSpacing: 1 }}>
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
                maxFontSizeMultiplier={1.4}
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
  );
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
  const [width, setWidth] = useState(0);
  const today = startOfDay(now);

  // Page w weeks ago = the 7 days ending (today − 7w).
  const daysFor = (weeksAgo: number) =>
    Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY_MS - weeksAgo * 7 * DAY_MS);

  // Oldest page first so the list reads left→right through time;
  // start scrolled to the last page (the current week).
  const weeks = Array.from({ length: WEEKS_BACK }, (_, i) => WEEKS_BACK - 1 - i);

  return (
    <View style={styles.container} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ThemedText type="smallBold" style={{ color: colors.textSecondary }}>
        {new Date(selected).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </ThemedText>
      {width > 0 ? (
        <FlatList
          horizontal
          pagingEnabled
          inverted={false}
          showsHorizontalScrollIndicator={false}
          data={weeks}
          keyExtractor={(w) => String(w)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          initialScrollIndex={WEEKS_BACK - 1}
          initialNumToRender={1}
          windowSize={3}
          renderItem={({ item: weeksAgo }) => (
            <WeekRow
              days={daysFor(weeksAgo)}
              today={today}
              selected={selected}
              activity={activity}
              onSelect={onSelect}
              width={width}
            />
          )}
        />
      ) : (
        // Pre-measure placeholder keeps the bar's height stable.
        <WeekRow
          days={daysFor(0)}
          today={today}
          selected={selected}
          activity={activity}
          onSelect={onSelect}
        />
      )}
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
