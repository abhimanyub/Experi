// Reminder times editor (Todoist-picker inspired, inline): existing times as
// removable chips, quick presets, and a compact hour/minute custom picker.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PRESETS: { label: string; time: string }[] = [
  { label: '☀️ 08:00', time: '08:00' },
  { label: '🕛 12:00', time: '12:00' },
  { label: '🌆 18:00', time: '18:00' },
  { label: '🌙 21:00', time: '21:00' },
];
const MINUTES = ['00', '15', '30', '45'];

export function TimesEditor({
  times,
  onChange,
}: {
  times: string[];
  onChange: (times: string[]) => void;
}) {
  const colors = useTheme();
  const [customOpen, setCustomOpen] = useState(false);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState('00');

  const add = (time: string) => {
    if (times.includes(time)) return;
    onChange([...times, time].sort());
  };
  const remove = (time: string) => onChange(times.filter((t) => t !== time));

  return (
    <View style={styles.container}>
      {/* current times */}
      <View style={styles.chipRow}>
        {times.length === 0 && (
          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            No reminders yet — add one below.
          </ThemedText>
        )}
        {times.map((time) => (
          <Pressable
            key={time}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${time} reminder`}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => remove(time)}
            style={({ pressed }) => [
              styles.timeChip,
              { backgroundColor: colors.tintSoft, opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: colors.tint }}>
              {time} ✕
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* quick presets */}
      <View style={styles.chipRow}>
        {PRESETS.filter((p) => !times.includes(p.time)).map((p) => (
          <Pressable
            key={p.time}
            accessibilityRole="button"
            accessibilityLabel={`Add ${p.time} reminder`}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => add(p.time)}
            style={({ pressed }) => [
              styles.presetChip,
              { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText type="small">{p.label}</ThemedText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: customOpen }}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => setCustomOpen((o) => !o)}
          style={({ pressed }) => [
            styles.presetChip,
            { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.6 : 1 },
          ]}>
          <ThemedText type="small">{customOpen ? 'Close' : '+ Custom'}</ThemedText>
        </Pressable>
      </View>

      {/* custom hour/minute */}
      {customOpen && (
        <View style={styles.customRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Earlier hour"
            hitSlop={4}
            onPress={() => setHour((h) => (h + 23) % 24)}
            style={({ pressed }) => [
              styles.stepBtn,
              { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText type="smallBold">−</ThemedText>
          </Pressable>
          <ThemedText
            type="smallBold"
            accessibilityLabel={`Hour: ${String(hour).padStart(2, '0')}`}
            style={styles.hourLabel}>
            {String(hour).padStart(2, '0')}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Later hour"
            hitSlop={4}
            onPress={() => setHour((h) => (h + 1) % 24)}
            style={({ pressed }) => [
              styles.stepBtn,
              { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText type="smallBold">+</ThemedText>
          </Pressable>
          {MINUTES.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`${m} minutes`}
              accessibilityState={{ selected: minute === m }}
              hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => setMinute(m)}
              style={({ pressed }) => [
                styles.minChip,
                {
                  backgroundColor: minute === m ? colors.tint : colors.backgroundSelected,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText
                type="small"
                style={minute === m ? { color: colors.onTint } : undefined}>
                :{m}
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => {
              add(`${String(hour).padStart(2, '0')}:${minute}`);
              setCustomOpen(false);
            }}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: colors.onTint }}>
              Add
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    alignItems: 'center',
  },
  timeChip: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
  presetChip: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  stepBtn: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourLabel: {
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  minChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
  addBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: 'center',
  },
});
