'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { database, ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { dailyCourseIds, routeConditionIds } from '@/lib/daily-route';

const modifiers = ['clear', 'tailwind', 'moonstep', 'sparkstorm'];
const objectives = ['sprint', 'light_hunt', 'clean_run', 'skyline_mastery'];
const dayPattern = /^20\d{2}-\d{2}-\d{2}$/;

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
