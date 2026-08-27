import { NextResponse } from 'next/server';

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/apple-touch-icon.png', request.url), 308);
}
