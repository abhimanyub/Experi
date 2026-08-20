// Metric list editor (wizard step 3). Cap 4 metrics — more metrics = mushier verdicts.

import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { NewMetricInput } from '@/db/repo';
import {
  CurrencyConfig,
  DurationConfig,
  MetricType,
  NumericConfig,
  ScaleConfig,
} from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { ChipRow } from './chips';

export const MAX_METRICS = 4;

/** New metrics inherit reminder times already chosen on earlier metrics. */
export function defaultMetric(existing: NewMetricInput[] = []): NewMetricInput {
  const lastScheduled = [...existing]
    .reverse()
    .find((m) => 'remindAt' in m.schedule && m.schedule.remindAt.length > 0);
  const schedule: NewMetricInput['schedule'] =
    lastScheduled && 'remindAt' in lastScheduled.schedule
      ? {
          timesPerDay: lastScheduled.schedule.timesPerDay,
          remindAt: [...lastScheduled.schedule.remindAt],
        }
      : { timesPerDay: 1, remindAt: ['20:00'] };
  return {
    name: '',
    type: 'scale',
    config: { min: 1, max: 5 },
    schedule,
    direction: 'higher_is_better',
  };
}

function defaultConfigFor(type: MetricType): NewMetricInput['config'] {
  switch (type) {
    case 'scale':
      return { min: 1, max: 5 };
    case 'numeric':
      return { unit: '' };
    case 'currency':
      return { code: 'USD' };
    case 'duration':
      return { unit: 'min' };
    case 'boolean':
      return {};
  }
}

export function MetricEditor({
  metrics,
  onChange,
}: {
  metrics: NewMetricInput[];
  onChange: (metrics: NewMetricInput[]) => void;
}) {
  const colors = useTheme();

  const update = (i: number, patch: Partial<NewMetricInput>) => {
    const next = [...metrics];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <View style={styles.container}>
      {metrics.map((m, i) => (
        <ThemedView key={i} type="backgroundElement" style={styles.card}>
          <View style={styles.headerRow}>
            <TextInput
              value={m.name}
              onChangeText={(name) => update(i, { name })}
              placeholder="Metric name (e.g. Afternoon energy)"
              placeholderTextColor={colors.textSecondary}
              style={[styles.nameInput, { color: colors.text }]}
            />
            <Pressable onPress={() => onChange(metrics.filter((_, j) => j !== i))}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Remove
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Type
          </ThemedText>
          <ChipRow
            options={[
              { value: 'scale', label: 'Scale' },
              { value: 'numeric', label: 'Number' },
              { value: 'boolean', label: 'Yes/No' },
              { value: 'currency', label: 'Money' },
              { value: 'duration', label: 'Time' },
            ]}
            value={m.type}
            onChange={(type) => update(i, { type, config: defaultConfigFor(type) })}
          />

          {m.type === 'scale' && (
            <View style={styles.configRow}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Range
              </ThemedText>
              <TextInput
                value={String((m.config as ScaleConfig).min ?? 1)}
                onChangeText={(v) =>
                  update(i, { config: { ...(m.config as ScaleConfig), min: Number(v) || 1 } })
                }
                keyboardType="number-pad"
                style={[styles.smallInput, { color: colors.text }]}
              />
              <ThemedText type="small">to</ThemedText>
              <TextInput
                value={String((m.config as ScaleConfig).max ?? 5)}
                onChangeText={(v) =>
                  update(i, { config: { ...(m.config as ScaleConfig), max: Number(v) || 5 } })
                }
                keyboardType="number-pad"
                style={[styles.smallInput, { color: colors.text }]}
              />
            </View>
          )}
          {m.type === 'numeric' && (
            <View style={styles.configRow}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Unit
              </ThemedText>
              <TextInput
                value={(m.config as NumericConfig).unit ?? ''}
                onChangeText={(unit) => update(i, { config: { unit } })}
                placeholder="hrs sleep"
                placeholderTextColor={colors.textSecondary}
                style={[styles.unitInput, { color: colors.text }]}
              />
            </View>
          )}
          {m.type === 'currency' && (
            <View style={styles.configRow}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                Currency
              </ThemedText>
              <TextInput
                value={(m.config as CurrencyConfig).code ?? 'USD'}
                onChangeText={(code) => update(i, { config: { code: code.toUpperCase() } })}
                autoCapitalize="characters"
                style={[styles.unitInput, { color: colors.text }]}
              />
            </View>
          )}
          {m.type === 'duration' && (
            <ChipRow
              options={[
                { value: 'min', label: 'Minutes' },
                { value: 'hr', label: 'Hours' },
              ]}
              value={(m.config as DurationConfig).unit ?? 'min'}
              onChange={(unit) => update(i, { config: { unit } })}
            />
          )}

          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Better when
          </ThemedText>
          <ChipRow
            options={[
              { value: 'higher_is_better', label: 'Higher' },
              { value: 'lower_is_better', label: 'Lower' },
              { value: 'neutral', label: 'Neutral' },
            ]}
            value={m.direction}
            onChange={(direction) => update(i, { direction })}
          />

          <ThemedText type="small" style={{ color: colors.textSecondary }}>
            Reminders
          </ThemedText>
          <ChipRow
            options={[
              { value: 'scheduled', label: 'Daily reminders' },
              { value: 'on_demand', label: 'On demand' },
            ]}
            value={'onDemand' in m.schedule ? 'on_demand' : 'scheduled'}
            onChange={(v) =>
              update(i, {
                schedule:
                  v === 'on_demand' ? { onDemand: true } : { timesPerDay: 1, remindAt: ['20:00'] },
              })
            }
          />
          {'remindAt' in m.schedule && (
            <View style={styles.configRow}>
              <ThemedText type="small" style={{ color: colors.textSecondary }}>
                At
              </ThemedText>
              <TextInput
                value={m.schedule.remindAt.join(', ')}
                onChangeText={(v) => {
                  const remindAt = v.split(',').map((s) => s.trim());
                  update(i, { schedule: { timesPerDay: remindAt.length, remindAt } });
                }}
                placeholder="09:00, 13:00, 20:00"
                placeholderTextColor={colors.textSecondary}
                style={[styles.unitInput, { color: colors.text }]}
              />
            </View>
          )}
        </ThemedView>
      ))}

      {metrics.length < MAX_METRICS ? (
        <Pressable
          onPress={() => onChange([...metrics, defaultMetric(metrics)])}
          style={[styles.addButton, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">+ Add metric</ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="small" style={{ color: colors.textSecondary }}>
          Max {MAX_METRICS} metrics — more metrics, mushier verdicts.
        </ThemedText>
      )}
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
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: Spacing.one,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  smallInput: {
    minWidth: 44,
    textAlign: 'center',
    paddingVertical: Spacing.one,
    fontSize: 16,
  },
  unitInput: {
    flex: 1,
    paddingVertical: Spacing.one,
    fontSize: 16,
  },
  addButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
});
