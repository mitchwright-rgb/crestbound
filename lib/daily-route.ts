import { dailyObjectiveForSerial, type DailyObjectiveId, type ModifierId } from '../app/game-rules.ts';
import { dailyChallengeIdForDay } from './daily-challenge.ts';

export const dailyCourseIds = ['goldline', 'crosswind', 'nightshift'] as const;
export type DailyCourseId = typeof dailyCourseIds[number];

export const routeConditionIds = ['standard', 'light_rush', 'rooftop_rumble', 'checkpoint_charge'] as const;
export type RouteConditionId = typeof routeConditionIds[number];

export const routeConditionSpecs: Record<RouteConditionId, { name: string; description: string }> = {
  standard: { name: 'Classic Route', description: 'The balanced Crestbound route mix.' },
  light_rush: { name: 'Light Rush', description: 'Extra Light rewards the high road in every section.' },
  rooftop_rumble: { name: 'Rooftop Rumble', description: 'More enemy encounters make Dash timing matter.' },
  checkpoint_charge: { name: 'Checkpoint Charge', description: 'Storm Lights near checkpoints recharge Dash and shield Sunny.' },
};

export type DailyRouteConfig = {
  day: string;
  serial: number;
  courseIndex: number;
  courseId: DailyCourseId;
  modifierId: ModifierId;
  objectiveId: DailyObjectiveId;
  conditionId: RouteConditionId;
  challengeId: string;
  overridden: boolean;
};

export function defaultDailyRoute(day: string): DailyRouteConfig {
  const serial = Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 86400000);
  const courseIndex = ((serial % dailyCourseIds.length) + dailyCourseIds.length) % dailyCourseIds.length;
  const modifiers: ModifierId[] = ['clear', 'tailwind', 'moonstep', 'sparkstorm'];
  const conditions: RouteConditionId[] = ['standard', 'light_rush', 'rooftop_rumble', 'checkpoint_charge'];
  return {
    day,
    serial,
    courseIndex,
    courseId: dailyCourseIds[courseIndex],
    modifierId: modifiers[((serial + courseIndex) % modifiers.length + modifiers.length) % modifiers.length],
    objectiveId: dailyObjectiveForSerial(serial, courseIndex),
    conditionId: conditions[((serial * 5 + courseIndex) % conditions.length + conditions.length) % conditions.length],
    challengeId: dailyChallengeIdForDay(day),
    overridden: false,
  };
}
