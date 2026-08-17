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
          onPress={() => onChange(o.value)}
          style={[
            styles.chip,
            {
              backgroundColor:
                o.value === value ? colors.backgroundSelected : colors.backgroundElement,
            },
          ]}>
          <ThemedText type="small">{o.label}</ThemedText>
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
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
});
