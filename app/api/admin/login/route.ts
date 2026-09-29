import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminIsConfigured, makeAdminSession, validAdminPassword } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  if (!adminIsConfigured()) return NextResponse.redirect(new URL('/admin/login?error=setup', request.url), 303);
  const allowance = await rateLimit(request, 'admin-login', 'staff', 8, 15 * 60_000);
  if (!allowance.allowed) return NextResponse.redirect(new URL('/admin/login?error=rate', request.url), 303);
  const data = await request.formData();
  if (!validAdminPassword(String(data.get('password') ?? ''))) return NextResponse.redirect(new URL('/admin/login?error=invalid', request.url), 303);
  const response = NextResponse.redirect(new URL('/admin', request.url), 303);
  response.cookies.set(ADMIN_COOKIE, makeAdminSession(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: 8 * 60 * 60,
  });
  return response;
}
