'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { database, ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { dailyCourseIds, routeConditionIds } from '@/lib/daily-route';
import { seriesSchedule } from '@/app/series-routes';

const modifiers = ['clear', 'tailwind', 'moonstep', 'sparkstorm'];
const objectives = ['sprint', 'light_hunt', 'clean_run', 'skyline_mastery'];
const dayPattern = /^20\d{2}-\d{2}-\d{2}$/;
const seriesWeeks = new Map(seriesSchedule.flatMap((series) => series.weeks.map((week) => [week.id, { series, week }] as const)));

function optionalHttpsUrl(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try { return new URL(text).protocol === 'https:' ? text : null; } catch { return null; }
}

export async function saveDailyRoute(formData: FormData) {
  if (!await requireAdmin()) redirect('/admin/login');
  await ensureSchema();
  const day = String(formData.get('day') ?? '');
  const courseId = String(formData.get('courseId') ?? '');
  const modifierId = String(formData.get('modifierId') ?? '');
  const objectiveId = String(formData.get('objectiveId') ?? '');
  const conditionId = String(formData.get('conditionId') ?? '');
  if (!dayPattern.test(day) || !dailyCourseIds.includes(courseId as typeof dailyCourseIds[number]) || !modifiers.includes(modifierId) || !objectives.includes(objectiveId) || !routeConditionIds.includes(conditionId as typeof routeConditionIds[number])) redirect('/admin?error=invalid');
  const now = Date.now();
  const details = JSON.stringify({ day, courseId, modifierId, objectiveId, conditionId });
  const db = database();
  await db.batch([
    db.prepare(`INSERT INTO daily_route_overrides (day_key, course_id, modifier_id, objective_id, condition_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day_key) DO UPDATE SET course_id = excluded.course_id, modifier_id = excluded.modifier_id,
      objective_id = excluded.objective_id, condition_id = excluded.condition_id, updated_at = excluded.updated_at`).bind(day, courseId, modifierId, objectiveId, conditionId, now),
    db.prepare('INSERT INTO admin_audit_log (action, details, created_at) VALUES (?, ?, ?)').bind('route_saved', details, now),
  ]);
  revalidatePath('/');
  revalidatePath('/admin');
  redirect('/admin?saved=1');
}

export async function clearDailyRoute(formData: FormData) {
  if (!await requireAdmin()) redirect('/admin/login');
  await ensureSchema();
  const day = String(formData.get('day') ?? '');
  if (!dayPattern.test(day)) redirect('/admin?error=invalid');
  const now = Date.now();
  const db = database();
  await db.batch([
    db.prepare('DELETE FROM daily_route_overrides WHERE day_key = ?').bind(day),
    db.prepare('INSERT INTO admin_audit_log (action, details, created_at) VALUES (?, ?, ?)').bind('route_cleared', JSON.stringify({ day }), now),
  ]);
  revalidatePath('/');
  revalidatePath('/admin');
  redirect('/admin?cleared=1');
}

export async function saveSeriesWeek(formData: FormData) {
  if (!await requireAdmin()) redirect('/admin/login');
  await ensureSchema();
  const weekId = String(formData.get('weekId') ?? '');
  const configured = seriesWeeks.get(weekId);
  const sunday = String(formData.get('sunday') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const routeName = String(formData.get('routeName') ?? '').trim();
  const objectiveId = String(formData.get('objectiveId') ?? '');
  const messageUrl = optionalHttpsUrl(formData.get('messageUrl'));
  if (!configured || !dayPattern.test(sunday) || title.length < 2 || title.length > 80 || routeName.length < 2 || routeName.length > 80 || !objectives.includes(objectiveId) || messageUrl === null) redirect('/admin?error=series');
  const now = Date.now();
  const details = JSON.stringify({ weekId, seriesId: configured.series.id, sunday, title, routeName, objectiveId, messageUrl });
  const db = database();
  await db.batch([
    db.prepare(`INSERT INTO series_week_overrides (week_id, series_id, sunday, title, route_name, objective_id, message_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(week_id) DO UPDATE SET series_id = excluded.series_id, sunday = excluded.sunday,
      title = excluded.title, route_name = excluded.route_name, objective_id = excluded.objective_id, message_url = excluded.message_url, updated_at = excluded.updated_at`
    ).bind(weekId, configured.series.id, sunday, title, routeName, objectiveId, messageUrl || null, now),
    db.prepare('INSERT INTO admin_audit_log (action, details, created_at) VALUES (?, ?, ?)').bind('series_week_saved', details, now),
  ]);
  revalidatePath('/');
  revalidatePath('/admin');
  redirect('/admin?seriesSaved=1');
}

export async function clearSeriesWeek(formData: FormData) {
  if (!await requireAdmin()) redirect('/admin/login');
  await ensureSchema();
  const weekId = String(formData.get('weekId') ?? '');
  if (!seriesWeeks.has(weekId)) redirect('/admin?error=series');
  const now = Date.now();
  const db = database();
  await db.batch([
    db.prepare('DELETE FROM series_week_overrides WHERE week_id = ?').bind(weekId),
    db.prepare('INSERT INTO admin_audit_log (action, details, created_at) VALUES (?, ?, ?)').bind('series_week_cleared', JSON.stringify({ weekId }), now),
  ]);
  revalidatePath('/');
  revalidatePath('/admin');
  redirect('/admin?seriesCleared=1');
}
