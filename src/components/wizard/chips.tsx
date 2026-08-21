// Small selectable chip row used across wizard steps.

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Option<V extends string> {
  value: V;
  label: string;
}

export function ChipRow<V extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.row}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          hitSlop={{ top: 4, bottom: 4 }}
          onPress={() => onChange(o.value)}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor:
                o.value === value
                  ? colors.backgroundSelected
                  : pressed
                    ? colors.backgroundSelected
                    : colors.backgroundElement,
              opacity: pressed && o.value !== value ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="small" maxFontSizeMultiplier={1.6}>
            {o.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    minHeight: 36,
    justifyContent: 'center',
  },
});
