import type { DailyObjectiveId } from './game-rules';

export type SeriesWeek = {
  id: string;
  sunday: string;
  title: string;
  routeName: string;
  objective: DailyObjectiveId;
};

export type SeriesRoute = {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  startsOn: string;
  endsOn: string;
  messageUrl: string;
  seriesUrl: string;
  weeks: readonly SeriesWeek[];
};

export const declarationsSeries: SeriesRoute = {
  id: 'declarations-2026',
  name: 'Declarations',
  eyebrow: 'NOW AT SUNCREST',
  description: 'Take a stand across a limited weekly route inspired by Suncrest’s current message series.',
  startsOn: '2026-08-16',
  endsOn: '2026-09-19',
  messageUrl: 'https://suncrest.org/messages',
  seriesUrl: 'https://suncrest.org/media/series/vjn62f2/declarations',
  weeks: [
    { id: 'declarations-2026-w1', sunday: '2026-08-16', title: 'Take Responsibility', routeName: 'Own the Rooftops', objective: 'skyline_mastery' },
    { id: 'declarations-2026-w2', sunday: '2026-08-23', title: 'Be Consistent', routeName: 'The First Word', objective: 'clean_run' },
    { id: 'declarations-2026-w3', sunday: '2026-08-30', title: 'Forgive', routeName: 'Release the Weight', objective: 'light_hunt' },
    { id: 'declarations-2026-w4', sunday: '2026-09-06', title: 'Seek Wisdom', routeName: 'Choose the High Road', objective: 'sprint' },
    { id: 'declarations-2026-w5', sunday: '2026-09-13', title: 'The One', routeName: 'Make It Count', objective: 'skyline_mastery' },
  ],
};

export const upcomingSeries = [
  { name: 'At The Movies', startsOn: '2026-09-20' },
  { name: 'Soundtrack', startsOn: '2026-10-11' },
  { name: 'Trust Issues', startsOn: '2026-11-01' },
  { name: 'Behold', startsOn: '2026-12-06' },
] as const;

export function activeSeriesForDay(day: string) {
  if (day < declarationsSeries.startsOn || day > declarationsSeries.endsOn) return null;
  let weekIndex = 0;
  for (let index = 0; index < declarationsSeries.weeks.length; index += 1) {
    if (declarationsSeries.weeks[index].sunday <= day) weekIndex = index;
  }
  return { series: declarationsSeries, week: declarationsSeries.weeks[weekIndex], weekIndex };
}
export function seriesWeekSeed(sunday: string) {
  return Math.floor(new Date(`${sunday}T12:00:00Z`).getTime() / 86400000);
}

export function completedSeriesWeekIds(storage: Pick<Storage, 'getItem'>, seriesId: string) {
  try {
    const value = JSON.parse(storage.getItem(`crestbound-series-complete-${seriesId}`) ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}
