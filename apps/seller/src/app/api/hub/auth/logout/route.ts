import { NextResponse } from 'next/server';
import { clearHubCookies } from '@/lib/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await clearHubCookies();
  return NextResponse.json({ success: true });
}
