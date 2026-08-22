// Chart colors (dark remix): phase A wears the ember red, phase B the streak
// amber, then green / pink / blue / cream. Phase N wears categorical slot N —
// color follows the phase, never its rank in a filtered view.

const remix = ['#E0574A', '#FFB454', '#4CC38A', '#D92A63', '#8FB4E8', '#F6EDE4'] as const;

export const PhasePalette = {
  light: remix,
  dark: remix,
} as const;

export function phaseColor(scheme: 'light' | 'dark', index: number): string {
  const palette = PhasePalette[scheme];
  return palette[index % palette.length];
}
