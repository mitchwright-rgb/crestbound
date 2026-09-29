import { activeSeriesForDay, seriesSchedule, type SeriesRoute } from '@/app/series-routes';
import type { DailyObjectiveId } from '@/app/game-rules';
import { database, ensureSchema } from '@/lib/db';

type SeriesWeekOverride = {
  week_id: string;
  series_id: string;
  sunday: string;
  title: string;
  route_name: string;
  objective_id: DailyObjectiveId;
  message_url: string | null;
};

export type ActiveSeries = NonNullable<ReturnType<typeof activeSeriesForDay>>;

function saturdayAfter(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export async function effectiveSeriesSchedule(): Promise<readonly SeriesRoute[]> {
  if (!process.env.DATABASE_URL) return seriesSchedule;
  await ensureSchema();
  const rows = await database().prepare(`SELECT week_id, series_id, sunday, title, route_name, objective_id, message_url
    FROM series_week_overrides ORDER BY sunday`).all<SeriesWeekOverride>();
  if (!rows.results.length) return seriesSchedule;
  const overrides = new Map(rows.results.map((row) => [row.week_id, row]));
  return seriesSchedule.map((series) => {
    const weeks = series.weeks.map((week) => {
      const override = overrides.get(week.id);
      if (!override || override.series_id !== series.id) return week;
      return {
        ...week,
        sunday: override.sunday,
        title: override.title,
        routeName: override.route_name,
        objective: override.objective_id,
        messageUrl: override.message_url || undefined,
      };
    }).sort((a, b) => a.sunday.localeCompare(b.sunday));
    return { ...series, startsOn: weeks[0].sunday, endsOn: saturdayAfter(weeks.at(-1)!.sunday), weeks };
  });
}

export async function effectiveActiveSeriesForDay(day: string): Promise<ActiveSeries | null> {
  const schedule = await effectiveSeriesSchedule();
  const series = schedule.find((candidate) => day >= candidate.startsOn && day <= candidate.endsOn);
  if (!series) return null;
  let weekIndex = 0;
  for (let index = 0; index < series.weeks.length; index += 1) {
    if (series.weeks[index].sunday <= day) weekIndex = index;
  }
  return { series, week: series.weeks[weekIndex], weekIndex };
}
