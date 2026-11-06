import { NextResponse } from 'next/server';
import { getAuthUser, extractTokenFromRequest } from '@/lib/server/auth';

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized: Authentication required' },
      { status: 401 }
    );
  }
  const token = extractTokenFromRequest(request);
  return NextResponse.json({ user, token });
}
