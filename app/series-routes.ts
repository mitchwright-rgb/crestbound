import type { DailyObjectiveId } from './game-rules';

export type SeriesWeek = {
  id: string;
  sunday: string;
  title: string;
  routeName: string;
  objective: DailyObjectiveId;
  messageUrl?: string;
};

export type MessageRoute = {
  id: string;
  kind: 'series' | 'special';
  name: string;
  shortName: string;
  eyebrow: string;
  description: string;
  startsOn: string;
  endsOn: string;
  messageUrl: string;
  seriesUrl: string | null;
  theme: 'declarations' | 'movies' | 'questions' | 'soundtrack' | 'trust' | 'behold';
  wordmarkKicker: string;
  mechanicName: string;
  mechanicAction: string;
  mechanicHelp: string;
  weeks: readonly SeriesWeek[];
};

// The legacy name stays exported because persisted scores and API paths use
// the original Series Route vocabulary. The public product is Message Routes.
export type SeriesRoute = MessageRoute;

export const declarationsSeries: MessageRoute = {
  id: 'declarations-2026',
  kind: 'series',
  name: 'Declarations',
  shortName: 'DECLARATIONS',
  eyebrow: 'NOW AT SUNCREST',
  description: 'Take a stand across a limited weekly route inspired by Suncrest’s current message series.',
  startsOn: '2026-08-16',
  endsOn: '2026-09-19',
  messageUrl: 'https://suncrest.org/messages',
  seriesUrl: 'https://suncrest.org/media/series/vjn62f2/declarations',
  theme: 'declarations',
  wordmarkKicker: 'TAKE A STAND',
  mechanicName: 'DECLARATION BEACONS',
  mechanicAction: 'ACTIVATE 3 DECLARATION BEACONS',
  mechanicHelp: 'Each clears the hazards ahead · all 3 earn +200',
  weeks: [
    { id: 'declarations-2026-w1', sunday: '2026-08-16', title: 'Take Responsibility', routeName: 'Own the Rooftops', objective: 'skyline_mastery' },
    { id: 'declarations-2026-w2', sunday: '2026-08-23', title: 'Be Consistent', routeName: 'The First Word', objective: 'clean_run' },
    { id: 'declarations-2026-w3', sunday: '2026-08-30', title: 'Forgive', routeName: 'Release the Weight', objective: 'light_hunt' },
    { id: 'declarations-2026-w4', sunday: '2026-09-06', title: 'Seek Wisdom', routeName: 'Choose the High Road', objective: 'sprint' },
    { id: 'declarations-2026-w5', sunday: '2026-09-13', title: 'The One', routeName: 'Make It Count', objective: 'skyline_mastery' },
  ],
};

export const messageRouteSchedule: readonly MessageRoute[] = [
  declarationsSeries,
  {
    id: 'at-the-movies-2026', kind: 'series', name: 'At The Movies', shortName: 'AT THE MOVIES', eyebrow: 'NOW AT SUNCREST',
    description: 'Step into two limited routes inspired by Suncrest’s At The Movies message series.',
    startsOn: '2026-09-20', endsOn: '2026-10-03', messageUrl: 'https://suncrest.org/messages',
    seriesUrl: 'https://suncrest.org/media/series/7y4r7gc/at-the-movies', theme: 'movies',
    wordmarkKicker: 'FEATURE PRESENTATION', mechanicName: 'MARQUEE MARKS',
    mechanicAction: 'LIGHT 3 MARQUEE MARKS', mechanicHelp: 'Each opens the route ahead · all 3 earn +200',
    weeks: [
      { id: 'at-the-movies-2026-w1', sunday: '2026-09-20', title: 'The Dark Knight', routeName: 'Signal in the Shadows', objective: 'clean_run' },
      { id: 'at-the-movies-2026-w2', sunday: '2026-09-27', title: 'Rudy', routeName: 'Never Quit Climb', objective: 'skyline_mastery' },
    ],
  },
  {
    id: 'ask-me-anything-2026', kind: 'special', name: 'Ask Me Anything', shortName: 'ASK ME ANYTHING', eyebrow: 'ONE WEEK AT SUNCREST',
    description: 'Bring your questions to a one-week Message Route inspired by Suncrest’s Ask Me Anything weekend.',
    startsOn: '2026-10-04', endsOn: '2026-10-10', messageUrl: 'https://suncrest.org/messages',
    seriesUrl: 'https://suncrest.org/messages', theme: 'questions', wordmarkKicker: 'WHAT DO YOU WANT TO KNOW?',
    mechanicName: 'QUESTION MARKS', mechanicAction: 'FIND 3 QUESTION MARKS',
    mechanicHelp: 'Each clears the uncertainty ahead · all 3 earn +200',
    weeks: [
      { id: 'ask-me-anything-2026-w1', sunday: '2026-10-04', title: 'Ask Me Anything', routeName: 'The Question Run', objective: 'light_hunt' },
    ],
  },
  {
    id: 'soundtrack-2026', kind: 'series', name: 'Soundtrack', shortName: 'SOUNDTRACK', eyebrow: 'COMING TO SUNCREST',
    description: 'Find the rhythm across weekly routes inspired by Suncrest’s Soundtrack series.',
    startsOn: '2026-10-11', endsOn: '2026-10-31', messageUrl: 'https://suncrest.org/messages', seriesUrl: null,
    theme: 'soundtrack', wordmarkKicker: 'TURN IT UP', mechanicName: 'BEAT MARKERS',
    mechanicAction: 'HIT 3 BEAT MARKERS', mechanicHelp: 'Stay on beat through the route · all 3 earn +200',
    weeks: [
      { id: 'soundtrack-2026-w1', sunday: '2026-10-11', title: 'Week One', routeName: 'Opening Track', objective: 'sprint' },
      { id: 'soundtrack-2026-w2', sunday: '2026-10-18', title: 'Week Two', routeName: 'Find the Beat', objective: 'light_hunt' },
      { id: 'soundtrack-2026-w3', sunday: '2026-10-25', title: 'Week Three', routeName: 'Final Chorus', objective: 'skyline_mastery' },
    ],
  },
  {
    id: 'trust-issues-2026', kind: 'series', name: 'Trust Issues', shortName: 'TRUST ISSUES', eyebrow: 'COMING TO SUNCREST',
    description: 'Test your footing across weekly routes inspired by Suncrest’s Trust Issues series.',
    startsOn: '2026-11-01', endsOn: '2026-11-28', messageUrl: 'https://suncrest.org/messages', seriesUrl: null,
    theme: 'trust', wordmarkKicker: 'WATCH YOUR STEP', mechanicName: 'TRUST POINTS',
    mechanicAction: 'REACH 3 TRUST POINTS', mechanicHelp: 'Commit to the path ahead · all 3 earn +200',
    weeks: [
      { id: 'trust-issues-2026-w1', sunday: '2026-11-01', title: 'Week One', routeName: 'First Step', objective: 'clean_run' },
      { id: 'trust-issues-2026-w2', sunday: '2026-11-08', title: 'Week Two', routeName: 'Leap of Faith', objective: 'skyline_mastery' },
      { id: 'trust-issues-2026-w3', sunday: '2026-11-15', title: 'Week Three', routeName: 'Hold the Line', objective: 'sprint' },
      { id: 'trust-issues-2026-w4', sunday: '2026-11-22', title: 'Week Four', routeName: 'Solid Ground', objective: 'light_hunt' },
    ],
  },
  {
    id: 'behold-2026', kind: 'series', name: 'Behold', shortName: 'BEHOLD', eyebrow: 'COMING TO SUNCREST',
    description: 'Look again across weekly routes inspired by Suncrest’s Behold series.',
    startsOn: '2026-12-06', endsOn: '2026-12-26', messageUrl: 'https://suncrest.org/messages', seriesUrl: null,
    theme: 'behold', wordmarkKicker: 'LOOK AGAIN', mechanicName: 'WONDER POINTS',
    mechanicAction: 'DISCOVER 3 WONDER POINTS', mechanicHelp: 'Find what others overlook · all 3 earn +200',
    weeks: [
      { id: 'behold-2026-w1', sunday: '2026-12-06', title: 'Week One', routeName: 'A New View', objective: 'light_hunt' },
      { id: 'behold-2026-w2', sunday: '2026-12-13', title: 'Week Two', routeName: 'Wonder Above', objective: 'skyline_mastery' },
      { id: 'behold-2026-w3', sunday: '2026-12-20', title: 'Week Three', routeName: 'Light Arrives', objective: 'clean_run' },
    ],
  },
];

// Compatibility exports keep existing run IDs, database rows, and API clients
// valid while the interface moves to the broader Message Routes name.
export const seriesSchedule = messageRouteSchedule;
export const seriesCourseIds = messageRouteSchedule.map((route) => route.id);
export const upcomingSeries = messageRouteSchedule.slice(1).map(({ name, startsOn }) => ({ name, startsOn }));

export function activeSeriesForDay(day: string) {
  const series = messageRouteSchedule.find((candidate) => day >= candidate.startsOn && day <= candidate.endsOn);
  if (!series) return null;
  let weekIndex = 0;
  for (let index = 0; index < series.weeks.length; index += 1) {
    if (series.weeks[index].sunday <= day) weekIndex = index;
  }
  return { series, week: series.weeks[weekIndex], weekIndex };
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
