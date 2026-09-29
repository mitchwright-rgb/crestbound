import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';
import { dailyCourseIds, routeConditionSpecs } from '@/lib/daily-route';
import { clearDailyRoute, saveDailyRoute } from './actions';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

type Override = { day_key: string; course_id: string; modifier_id: string; objective_id: string; condition_id: keyof typeof routeConditionSpecs; updated_at: number };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; cleared?: string; error?: string }> }) {
  if (!await requireAdmin()) redirect('/admin/login');
  await ensureSchema();
  const params = await searchParams;
  const db = database();
  const keys = chicagoKeys();
  const [stats, overrides] = await Promise.all([
    db.prepare(`SELECT COUNT(*) completions, COUNT(DISTINCT player_id) players, COALESCE(SUM(sparks), 0) lights
      FROM crest_scores WHERE day_key = ?`).bind(keys.day).first<{ completions: number; players: number; lights: number }>(),
    db.prepare(`SELECT day_key, course_id, modifier_id, objective_id, condition_id, updated_at
      FROM daily_route_overrides WHERE day_key >= ? ORDER BY day_key ASC LIMIT 30`).bind(keys.day).all<Override>(),
  ]);
  return <main className={styles.shell}><div className={styles.frame}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CRESTBOUND // STAFF</p><h1>Route Control</h1><p>Publish a route mix from one place. The game and ranked verification use the same schedule, so a staff change cannot create an unpostable run.</p></div><form method="post" action="/api/admin/logout"><button className={styles.logout}>Sign Out</button></form></header>
    {params.saved && <p className={styles.notice}>Route published. New runs for that date will use this configuration.</p>}
    {params.cleared && <p className={styles.notice}>Override cleared. That date is back on the automatic rotation.</p>}
    {params.error && <p className={styles.notice}>That route was not saved. Check every field and try again.</p>}
    <section className={styles.stats} aria-label="Today's activity"><div className={styles.stat}><small>TODAY&apos;S FINISHES</small><b>{stats?.completions ?? 0}</b></div><div className={styles.stat}><small>UNIQUE RUNNERS</small><b>{stats?.players ?? 0}</b></div><div className={styles.stat}><small>LIGHT COLLECTED</small><b>{stats?.lights ?? 0}</b></div></section>
    <section className={styles.panel}><h2>Schedule a Daily Route</h2><p>Pick the recognizable course and twist, the scoring challenge, and one route condition that changes what players encounter.</p>
      <form action={saveDailyRoute} className={styles.routeForm}>
        <label>DATE<input name="day" type="date" defaultValue={keys.day} required /></label>
        <label>COURSE<select name="courseId" defaultValue="goldline">{dailyCourseIds.map((id) => <option key={id} value={id}>{id === 'goldline' ? 'Goldline Rooftops' : id === 'crosswind' ? 'Crosswind Heights' : 'Night Shift'}</option>)}</select></label>
        <label>TWIST<select name="modifierId" defaultValue="clear"><option value="clear">Clear Skies</option><option value="tailwind">Tailwind</option><option value="moonstep">Moonstep</option><option value="sparkstorm">Spark Storm</option></select></label>
        <label>SCORING CHALLENGE<select name="objectiveId" defaultValue="skyline_mastery"><option value="sprint">Skyline Sprint</option><option value="light_hunt">Light Hunt</option><option value="clean_run">Perfect Landing</option><option value="skyline_mastery">Skyline Mastery</option></select></label>
        <label>ROUTE CONDITION<select name="conditionId" defaultValue="standard">{Object.entries(routeConditionSpecs).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
        <button type="submit">Publish Route Configuration</button>
      </form>
      <div className={styles.conditionGuide}>{Object.entries(routeConditionSpecs).map(([id, item]) => <article key={id}><b>{item.name}</b><span>{item.description}</span></article>)}</div>
      <div className={styles.schedule}><h2>Upcoming Overrides</h2>{overrides.results.length === 0 ? <p className={styles.empty}>No manual overrides. Automatic daily rotation is active.</p> : overrides.results.map((item) => <div className={styles.row} key={item.day_key}><b>{item.day_key}</b><span>{item.course_id} · {item.modifier_id}</span><span>{item.objective_id}</span><small>{routeConditionSpecs[item.condition_id]?.name ?? item.condition_id}</small><form action={clearDailyRoute}><input type="hidden" name="day" value={item.day_key} /><button className={styles.clearButton}>Use Automatic Rotation</button></form></div>)}</div>
    </section>
  </div></main>;
}
