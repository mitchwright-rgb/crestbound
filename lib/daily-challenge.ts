export const DAILY_LAYOUT_VERSION = 1;

export function dailyChallengeIdForDay(day: string) {
  return `${day}-layout-${DAILY_LAYOUT_VERSION}`;
}
