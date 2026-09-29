import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'crestbound_admin';
const SESSION_SECONDS = 8 * 60 * 60;

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}
export function adminIsConfigured() {
  return Boolean(process.env.CRESTBOUND_ADMIN_PASSWORD && process.env.CRESTBOUND_ADMIN_SESSION_SECRET);
}

export function validAdminPassword(password: string) {
  const expected = process.env.CRESTBOUND_ADMIN_PASSWORD;
  if (!expected || password.length < 12) return false;
  return timingSafeEqual(digest(password), digest(expected));
}

function signature(expires: string) {
  const secret = process.env.CRESTBOUND_ADMIN_SESSION_SECRET;
  if (!secret) return '';
  return createHmac('sha256', secret).update(expires).digest('base64url');
}

export function makeAdminSession() {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${expires}.${signature(expires)}`;
}

export function validAdminSession(value?: string) {
  if (!value) return false;
  const [expires, supplied] = value.split('.');
  if (!expires || !supplied || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = signature(expires);
  if (!expected || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function requireAdmin() {
  const store = await cookies();
  return validAdminSession(store.get(ADMIN_COOKIE)?.value);
}
