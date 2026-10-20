import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The commit the server is running; open tabs compare it with their own build. */
export function GET() {
  return NextResponse.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
