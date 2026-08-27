import { database } from '@/lib/db';

export async function rateLimit(request: Request, scope: string, subject: string, limit: number, windowMs: number) {
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const material = `${scope}:${subject}:${forwarded}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const fingerprint = [...new Uint8Array(digest).slice(0, 10)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const bucketKey = `${scope}:${fingerprint}:${bucket}`;
  const expiresAt = (bucket + 1) * windowMs;
  const db = database();
  await db.prepare(`INSERT INTO request_limits (bucket_key, request_count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1`).bind(bucketKey, expiresAt).run();
  const row = await db.prepare('SELECT request_count FROM request_limits WHERE bucket_key = ?').bind(bucketKey).first<{ request_count: number }>();
  if (scope === 'run-finish') await db.prepare('DELETE FROM request_limits WHERE expires_at < ?').bind(now).run();
  return { allowed: (row?.request_count ?? limit + 1) <= limit, retryAfter: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
}
