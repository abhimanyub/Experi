// Chart colors: validated categorical palette (dataviz reference instance).
// Phase N wears categorical slot N — color follows the phase, never its rank in a filtered view.

export const PhasePalette = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
} as const;

export function phaseColor(scheme: 'light' | 'dark', index: number): string {
  const palette = PhasePalette[scheme];
  return palette[index % palette.length];
}
