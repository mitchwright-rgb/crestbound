import { redirect } from 'next/navigation';
import { adminIsConfigured, requireAdmin } from '@/lib/admin-auth';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await requireAdmin()) redirect('/admin');
  const { error } = await searchParams;
  const configured = adminIsConfigured();
  return <main className={styles.login}><section className={styles.loginCard}>
    <p className={styles.eyebrow}>CRESTBOUND // STAFF</p>
    <h1>Admin Console</h1>
    <p>Schedule daily routes and stronger gameplay conditions without changing code.</p>
    {!configured && <p className={styles.error}>Admin access is not configured on this deployment yet.</p>}
    {error === 'invalid' && <p className={styles.error}>That password did not match.</p>}
    {error === 'rate' && <p className={styles.error}>Too many attempts. Wait 15 minutes and try again.</p>}
    <form method="post" action="/api/admin/login">
      <label htmlFor="password">STAFF PASSWORD</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required minLength={12} disabled={!configured} />
      <button type="submit" disabled={!configured}>Open Console</button>
    </form>
  </section></main>;
}
