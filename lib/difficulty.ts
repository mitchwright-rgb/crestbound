export type DifficultySignals = { starts: number; finishes: number; avg_hits: number | null };
export type DifficultyStatus = 'LEARNING' | 'HEALTHY' | 'WATCH' | 'TOO HARD';

export function difficultyStatus(row: DifficultySignals): DifficultyStatus {
  if (row.starts < 5) return 'LEARNING';
  const rate = row.finishes / Math.max(1, row.starts);
  if (rate < .25 || (row.avg_hits ?? 0) >= 2.6) return 'TOO HARD';
  if (rate < .4 || (row.avg_hits ?? 0) >= 2.1) return 'WATCH';
  return 'HEALTHY';
}
