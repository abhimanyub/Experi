// Phase list editor (wizard step 4). Reorder via up/down; <7-day warning inline.

import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { NewPhaseInput } from '@/db/repo';
import { MIN_PHASE_DAYS } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { ChipRow } from './chips';

export function PhaseEditor({
  phases,
  onChange,
}: {
  phases: NewPhaseInput[];
  onChange: (phases: NewPhaseInput[]) => void;
}) {
  const colors = useTheme();

  const update = (i: number, patch: Partial<NewPhaseInput>) => {
    const next = [...phases];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= phases.length) return;
    const next = [...phases];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <View style={styles.container}>
      {phases.map((p, i) => (
        <ThemedView key={i} type="backgroundElement" style={styles.card}>
          <View style={styles.headerRow}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              {i + 1}.
            </ThemedText>
            <TextInput
              value={p.label}
              onChangeText={(label) => update(i, { label })}
              placeholder="Phase label"
              placeholderTextColor={colors.textSecondary}
              style={[styles.labelInput, { color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${p.label || `phase ${i + 1}`} up`}
              accessibilityState={{ disabled: i === 0 }}
              hitSlop={12}
              onPress={() => move(i, -1)}
              disabled={i === 0}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <ThemedText type="small" style={{ opacity: i === 0 ? 0.3 : 1 }}>
                ↑
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${p.label || `phase ${i + 1}`} down`}
              accessibilityState={{ disabled: i === phases.length - 1 }}
              hitSlop={12}
              onPress={() => move(i, 1)}
              disabled={i === phases.length - 1}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <ThemedText type="small" style={{ opacity: i === phases.length - 1 ? 0.3 : 1 }}>
                ↓
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.label || `phase ${i + 1}`}`}
              hitSlop={12}
              onPress={() => onChange(phases.filter((_, j) => j !== i))}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Remove
              </ThemedText>
            </Pressable>
          </View>

          <ChipRow
            options={[
              { value: 'baseline', label: 'Baseline' },
              { value: 'intervention', label: 'Intervention' },
              { value: 'reversal', label: 'Reversal' },
            ]}
            value={p.type}
            onChange={(type) => update(i, { type })}
          />

          <View style={styles.daysRow}>
            <ThemedText type="small" style={{ color: colors.textSecondary }}>
              Days
            </ThemedText>
            <TextInput
              value={String(p.plannedDays || '')}
              onChangeText={(v) => update(i, { plannedDays: Number(v) || 0 })}
              keyboardType="number-pad"
              style={[styles.daysInput, { color: colors.text }]}
            />
            {p.plannedDays > 0 && p.plannedDays < MIN_PHASE_DAYS && (
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                ⚠︎ under {MIN_PHASE_DAYS}d — one-good-day risk
              </ThemedText>
            )}
          </View>
        </ThemedView>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          onChange([...phases, { type: 'intervention', label: '', plannedDays: 7 }])
        }
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
        ]}>
        <ThemedText type="smallBold">+ Add phase</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  labelInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: Spacing.one,
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  daysInput: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 16,
    paddingVertical: Spacing.one,
  },
  addButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
});
