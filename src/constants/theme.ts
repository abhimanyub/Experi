/**
 * Red Glass — dark remix palette (Claude Design "Red Glass Redesign").
 * The app is dark-only: warm near-black ground, cream text and primary
 * buttons, ember red accent, amber streak, green success. Both scheme keys
 * carry the same values so `useTheme` keeps working everywhere.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#F6EDE4',
  background: '#131211',
  backgroundElement: '#1D1B18',
  backgroundSelected: '#2B2723',
  textSecondary: '#A3948A',
  textFaint: '#6E6158',
  tint: '#E2705F',
  tintStrong: '#E0574A',
  tintSoft: 'rgba(224,87,74,0.12)',
  onTint: '#17130E',
  cream: '#F6EDE4',
  onCream: '#17130E',
  cardBorder: 'rgba(255,255,255,0.06)',
  success: '#4CC38A',
  successSoft: 'rgba(76,195,138,0.14)',
  warning: '#FFB454',
  warningSoft: 'rgba(255,180,84,0.12)',
} as const;

export const Colors = {
  light: palette,
  dark: palette,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Bricolage Grotesque display faces (loaded in the root layout). */
export const Display = {
  bold: 'BricolageGrotesque_700Bold',
  extraBold: 'BricolageGrotesque_800ExtraBold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
