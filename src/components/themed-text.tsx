import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Display, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'headline'
    | 'subtitle'
    | 'label'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

// Display sizes clamp their Dynamic Type growth so a 50px title doesn't hit
// ~150px at accessibility sizes; body text scales freely.
const MAX_SCALE: Partial<Record<NonNullable<ThemedTextProps['type']>, number>> = {
  title: 1.2,
  subtitle: 1.3,
  headline: 1.4,
};

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  maxFontSizeMultiplier,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[type]}
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'headline' && styles.headline,
        type === 'subtitle' && styles.subtitle,
        type === 'label' && [styles.label, { color: theme[themeColor ?? 'textFaint'] }],
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.tint }],
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  title: {
    fontSize: 50,
    lineHeight: 54,
    letterSpacing: -1,
    fontFamily: Display.extraBold, // Bricolage Grotesque — the redesign's voice
  },
  subtitle: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.5,
    fontFamily: Display.extraBold,
  },
  headline: {
    fontSize: 22,
    lineHeight: 27,
    fontFamily: Display.bold,
  },
  /** All-caps section label — HYPOTHESIS, METRICS, PHASES. */
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  link: {
    lineHeight: 20,
    fontSize: 14,
    fontWeight: 700,
  },
  linkPrimary: {
    lineHeight: 20,
    fontSize: 14,
    fontWeight: 700,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
