import { database, ensureSchema } from '@/lib/db';
import { dailyCourseIds, defaultDailyRoute, routeConditionIds, type DailyRouteConfig } from '@/lib/daily-route';
import type { DailyObjectiveId, ModifierId } from '@/app/game-rules';

const modifiers = new Set<ModifierId>(['clear', 'tailwind', 'moonstep', 'sparkstorm']);
const objectives = new Set<DailyObjectiveId>(['sprint', 'light_hunt', 'clean_run', 'skyline_mastery']);

export async function effectiveDailyRoute(day: string): Promise<DailyRouteConfig> {
  const fallback = defaultDailyRoute(day);
  if (!process.env.DATABASE_URL) return fallback;
  await ensureSchema();
  const row = await database().prepare(`SELECT course_id, modifier_id, objective_id, condition_id
    FROM daily_route_overrides WHERE day_key = ?`).bind(day).first<{ course_id: string; modifier_id: string; objective_id: string; condition_id: string }>();
  if (!row) return fallback;
  const courseIndex = dailyCourseIds.indexOf(row.course_id as DailyRouteConfig['courseId']);
  if (courseIndex < 0 || !modifiers.has(row.modifier_id as ModifierId) || !objectives.has(row.objective_id as DailyObjectiveId) || !routeConditionIds.includes(row.condition_id as DailyRouteConfig['conditionId'])) return fallback;
  return {
    ...fallback,
    courseIndex,
    courseId: row.course_id as DailyRouteConfig['courseId'],
    modifierId: row.modifier_id as ModifierId,
    objectiveId: row.objective_id as DailyObjectiveId,
    conditionId: row.condition_id as DailyRouteConfig['conditionId'],
    overridden: true,
  };
}
