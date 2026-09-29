import { redirect } from 'next/navigation';
import { dailyObjectiveSpecs } from '@/app/game-rules';
import { difficultyStatus, loadAdminAnalytics } from '@/lib/admin-analytics';
import { requireAdmin } from '@/lib/admin-auth';
import { chicagoKeys, database, ensureSchema } from '@/lib/db';
import { dailyCourseIds, routeConditionSpecs } from '@/lib/daily-route';
import { effectiveSeriesSchedule } from '@/lib/series-route-data';
import { clearDailyRoute, clearSeriesWeek, saveDailyRoute, saveSeriesWeek } from './actions';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

type Override = { day_key: string; course_id: string; modifier_id: string; objective_id: string; condition_id: keyof typeof routeConditionSpecs; updated_at: number };
const courseNames: Record<string, string> = { goldline: 'Goldline Rooftops', crosswind: 'Crosswind Heights', nightshift: 'Night Shift' };
const modifierNames: Record<string, string> = { clear: 'Clear Skies', tailwind: 'Tailwind', moonstep: 'Moonstep', sparkstorm: 'Spark Storm' };
const percent = (value: number) => `${Math.round(value)}%`;
const duration = (value: number) => {
  if (!value) return '—';
  const totalSeconds = Math.round(value / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};
function daysBefore(day: string, count: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - count); return date.toISOString().slice(0, 10); }

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ saved?: string; cleared?: string; seriesSaved?: string; seriesCleared?: string; error?: string }> }) {
  if (!await requireAdmin()) redirect('/admin/login');
  await ensureSchema();
  const params = await searchParams;
  const db = database();
  const keys = chicagoKeys();
  const [stats, overrides, seriesOverrides, seriesSchedule, analytics] = await Promise.all([
    db.prepare(`SELECT COUNT(*) completions, COUNT(DISTINCT player_id) players, COALESCE(SUM(sparks), 0) lights FROM crest_scores WHERE day_key = ?`).bind(keys.day).first<{ completions: number; players: number; lights: number }>(),
    db.prepare(`SELECT day_key, course_id, modifier_id, objective_id, condition_id, updated_at FROM daily_route_overrides WHERE day_key >= ? ORDER BY day_key DESC LIMIT 60`).bind(daysBefore(keys.day, 30)).all<Override>(),
    db.prepare('SELECT week_id FROM series_week_overrides').all<{ week_id: string }>(),
    effectiveSeriesSchedule(),
    loadAdminAnalytics(14),
  ]);
  const overriddenWeeks = new Set(seriesOverrides.results.map((row) => row.week_id));
  const visibleMessageRoutes = seriesSchedule.filter((series) => series.endsOn >= keys.day);
  return <main className={styles.shell}><div className={styles.frame}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CRESTBOUND // OWNER</p><h1>Game Control</h1><p>See how people are playing, tune future routes, and manage Message Routes. Automatic rotation stays active unless you publish a dated override.</p></div><form method="post" action="/api/admin/logout"><button className={styles.logout}>Sign Out</button></form></header>
    {(params.saved || params.seriesSaved) && <p className={styles.notice}>Saved. New runs will use the updated configuration on its scheduled date.</p>}
    {(params.cleared || params.seriesCleared) && <p className={styles.notice}>Override removed. Automatic scheduling is active again.</p>}
    {params.error && <p className={`${styles.notice} ${styles.errorNotice}`}>That change was not saved. Check every field and try again.</p>}
    <section className={styles.stats} aria-label="Today's activity"><div className={styles.stat}><small>TODAY&apos;S FINISHES</small><b>{stats?.completions ?? 0}</b></div><div className={styles.stat}><small>UNIQUE RUNNERS</small><b>{stats?.players ?? 0}</b></div><div className={styles.stat}><small>LIGHT COLLECTED</small><b>{stats?.lights ?? 0}</b></div></section>

    <details className={styles.panel} open><summary><span><small>LAST 14 DAYS</small><b>Gameplay Health</b></span><em>{analytics.starts} STARTS</em></summary>
      <p>Use these signals together. Small samples are labeled “Learning” so one difficult run does not trigger a false alarm.</p>
      <div className={styles.healthGrid}>
        <article><small>COMPLETION RATE</small><b>{percent(analytics.completionRate)}</b><span>{analytics.finishes} finished · {analytics.abandoned} abandoned</span></article>
        <article><small>AVERAGE FINISH</small><b>{duration(analytics.avgTimeMs)}</b><span>{analytics.avgHits.toFixed(1)} hits per finish</span></article>
        <article><small>LIGHT FOUND</small><b>{percent(analytics.avgLightPercent)}</b><span>Average share collected</span></article>
        <article><small>MESSAGE ROUTES</small><b>{analytics.seriesFinishes}/{analytics.seriesStarts}</b><span>Finishes from starts</span></article>
      </div>
      <div className={styles.analyticsSplit}>
        <section><h3>Route + Twist Performance</h3><div className={styles.performanceTable}><div className={styles.tableHead}><span>ROUTE MIX</span><span>FINISH</span><span>TIME</span><span>LIGHT</span><span>HEALTH</span></div>{analytics.performance.length ? analytics.performance.map((row) => { const status = difficultyStatus(row); return <div className={styles.tableRow} key={`${row.course_id}-${row.modifier_id}-${row.condition_id}`}><span><b>{courseNames[row.course_id] ?? row.course_id}</b><small>{modifierNames[row.modifier_id] ?? row.modifier_id} · {routeConditionSpecs[row.condition_id as keyof typeof routeConditionSpecs]?.name ?? row.condition_id}</small></span><span>{row.finishes}/{row.starts}</span><span>{duration(row.avg_time_ms ?? 0)}</span><span>{percent(row.avg_light_percent ?? 0)}</span><strong data-status={status}>{status}</strong></div> }) : <p className={styles.empty}>No route data yet. Analytics will fill in as people play.</p>}</div></section>
        <section><h3>Device Mix</h3><div className={styles.deviceList}>{analytics.devices.length ? analytics.devices.map((item) => <div key={item.device}><b>{item.device === 'touch' ? 'PHONE / TOUCH' : item.device.toUpperCase()}</b><span>{item.starts} starts</span><i style={{ width: `${Math.max(8, item.starts / Math.max(1, analytics.starts) * 100)}%` }} /></div>) : <p className={styles.empty}>Device data appears after the next run.</p>}</div><p className={styles.insight}><b>Difficulty guide:</b> Healthy means enough players are finishing without excessive damage. Watch and Too Hard flag combinations worth testing—not automatic proof of a problem.</p></section>
      </div>
    </details>

    <details className={styles.panel}><summary><span><small>DAILY GAME</small><b>Schedule a Route</b></span><em>AUTOMATIC BY DEFAULT</em></summary>
      <p>Only publish when you want a specific date to differ from the automatic rotation.</p>
      <form action={saveDailyRoute} className={styles.routeForm}>
        <label>DATE<input name="day" type="date" defaultValue={keys.day} required /></label>
        <label>COURSE<select name="courseId" defaultValue="goldline">{dailyCourseIds.map((id) => <option key={id} value={id}>{courseNames[id]}</option>)}</select></label>
        <label>TWIST<select name="modifierId" defaultValue="clear">{Object.entries(modifierNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>SCORING CHALLENGE<select name="objectiveId" defaultValue="skyline_mastery">{Object.entries(dailyObjectiveSpecs).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
        <label>ROUTE CONDITION<select name="conditionId" defaultValue="standard">{Object.entries(routeConditionSpecs).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
        <button type="submit">Publish Route Configuration</button>
      </form>
      <div className={styles.conditionGuide}>{Object.entries(routeConditionSpecs).map(([id, item]) => <article key={id}><b>{item.name}</b><span>{item.description}</span></article>)}</div>
    </details>

    <details className={styles.panel}><summary><span><small>SUNCREST CONTENT</small><b>Message Route Calendar</b></span><em>{visibleMessageRoutes.reduce((count, series) => count + series.weeks.length, 0)} ROUTES</em></summary>
      <p>Routes generate automatically. Only change dates, message details, or a direct link when Suncrest&apos;s published information changes.</p>
      <div className={styles.seriesList}>{visibleMessageRoutes.map((series) => <details className={styles.seriesGroup} key={series.id} open={keys.day >= series.startsOn && keys.day <= series.endsOn}><summary><b>{series.name} <small>{series.kind === 'special' ? 'SPECIAL ROUTE' : 'MESSAGE SERIES'}</small></b><span>{series.startsOn} → {series.endsOn}</span></summary>{series.weeks.map((week) => <form action={saveSeriesWeek} className={styles.seriesWeekForm} key={week.id}>
        <input type="hidden" name="weekId" value={week.id} />
        <label>SUNDAY<input type="date" name="sunday" defaultValue={week.sunday} required /></label>
        <label>MESSAGE TITLE<input name="title" defaultValue={week.title} maxLength={80} required /></label>
        <label>ROUTE NAME<input name="routeName" defaultValue={week.routeName} maxLength={80} required /></label>
        <input type="hidden" name="objectiveId" value={week.objective} />
        <label className={styles.messageField}>DIRECT MESSAGE LINK · OPTIONAL<input type="url" name="messageUrl" defaultValue={week.messageUrl ?? ''} placeholder="https://suncrest.org/media/..." /></label>
        <button type="submit">{overriddenWeeks.has(week.id) ? 'Update Week' : 'Customize Week'}</button>
        {overriddenWeeks.has(week.id) && <button className={styles.inlineReset} formAction={clearSeriesWeek}>Use Automatic Details</button>}
      </form>)}</details>)}</div>
    </details>

    <details className={styles.panel}><summary><span><small>AUDIT + RECOVERY</small><b>Override History</b></span><em>{overrides.results.length} SAVED</em></summary>
      <p>Past overrides remain visible for context. Removing one restores the automatic rotation for that date.</p>
      <div className={styles.schedule}>{overrides.results.length === 0 ? <p className={styles.empty}>No manual overrides. Automatic daily rotation is active.</p> : overrides.results.map((item) => <div className={styles.row} key={item.day_key}><b>{item.day_key}</b><span>{courseNames[item.course_id] ?? item.course_id} · {modifierNames[item.modifier_id] ?? item.modifier_id}</span><span>{dailyObjectiveSpecs[item.objective_id as keyof typeof dailyObjectiveSpecs]?.name ?? item.objective_id}</span><small>{routeConditionSpecs[item.condition_id]?.name ?? item.condition_id}</small><form action={clearDailyRoute}><input type="hidden" name="day" value={item.day_key} /><button className={styles.clearButton}>Use Automatic Rotation</button></form></div>)}</div>
    </details>
  </div></main>;
}
