// Streak: consecutive days with at least one logged observation, ending today
// (or yesterday, so an unlogged morning doesn't read as a broken streak).

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeStreak(activity: Record<number, boolean>, now: number): number {
  const today = new Date(now).setHours(0, 0, 0, 0);
  let cursor = activity[today] ? today : today - DAY_MS;
  let streak = 0;
  while (activity[cursor]) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export const STREAK_GOAL = 7;

export function streakGoalCopy(streak: number): string {
  return streak >= STREAK_GOAL ? 'a full week!' : `${STREAK_GOAL - streak} days to a full week`;
}
