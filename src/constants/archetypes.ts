// Archetype identity: emoji + viz-palette color, used on template picker,
// experiment cards, and history. One glanceable identity per experiment kind.

import { Archetype } from '../domain/types';

export const ArchetypeIdentity: Record<
  Archetype,
  { emoji: string; label: string; light: string; dark: string }
> = {
  health: { emoji: '🌿', label: 'Health & body', light: '#1baf7a', dark: '#199e70' },
  routine: { emoji: '🔁', label: 'Routine', light: '#2a78d6', dark: '#3987e5' },
  cost_benefit: { emoji: '💸', label: 'Cost & benefit', light: '#eda100', dark: '#c98500' },
  custom: { emoji: '🧪', label: 'Custom', light: '#4a3aa7', dark: '#9085e9' },
};

export const TEMPLATE_EMOJI: Record<string, string> = {
  food_elimination: '🥛',
  routine_swap: '🔁',
  make_vs_buy: '☕',
  sleep_substance: '😴',
  custom: '🧪',
};
