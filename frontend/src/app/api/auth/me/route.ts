import { NextResponse } from 'next/server';
import { getAuthUser, extractTokenFromRequest } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required' },
      { status: 401 }
    );
  }
  let token = extractTokenFromRequest(request);
  if (!token) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      token = cookieStore.get('ch_session')?.value || cookieStore.get('el_token')?.value || null;
    } catch {}
  }
  return NextResponse.json({ user, token });
}
