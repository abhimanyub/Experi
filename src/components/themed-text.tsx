import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'headline'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

// Display sizes clamp their Dynamic Type growth so a 40px title doesn't hit
// ~124px at accessibility sizes; body text scales freely.
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
    fontSize: 40,
    fontWeight: 700,
    lineHeight: 46,
    fontFamily: Fonts.rounded, // friendly lab-notebook voice
  },
  headline: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: 600,
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 700,
    fontFamily: Fonts.rounded,
  },
  link: {
    lineHeight: 20,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 20,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
