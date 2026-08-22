// Field Notes graft: rubber-stamp verdict. Slightly rotated, inky border,
// letterspaced caps — slams in with a spring where animated.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Display } from '@/constants/theme';
import { VerdictOutcome } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

const LABELS: Record<VerdictOutcome | 'abandoned', string> = {
  supported: 'SUPPORTED',
  refuted: 'REFUTED',
  inconclusive: 'INCONCLUSIVE',
  contaminated: 'CONTAMINATED',
  abandoned: 'ABANDONED',
};

export function VerdictStamp({
  outcome,
  size = 'small',
}: {
  outcome: VerdictOutcome | 'abandoned';
  size?: 'small' | 'large';
}) {
  const colors = useTheme();
  const color =
    outcome === 'supported'
      ? colors.success
      : outcome === 'refuted'
        ? colors.tint
        : outcome === 'contaminated'
          ? colors.warning
          : colors.textSecondary;
  const large = size === 'large';

  return (
    <View
      style={[
        styles.stamp,
        large ? styles.large : styles.small,
        { borderColor: color, transform: [{ rotate: large ? '-6deg' : '-4deg' }] },
      ]}>
      <ThemedText
        style={[styles.label, { color, fontSize: large ? 24 : 11, lineHeight: large ? 30 : 14 }]}>
        {LABELS[outcome]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    opacity: 0.92,
  },
  small: {
    borderWidth: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  large: {
    borderWidth: 3.5,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  label: {
    fontFamily: Display.extraBold,
    letterSpacing: 2,
  },
});
