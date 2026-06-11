import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ found: false });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profiles, error } = await adminClient
    .from('profiles')
    .select('id, name, role, email')
    .ilike('name', `%${name.trim()}%`)
    .limit(5);

  if (error || !profiles?.length) {
    return NextResponse.json({ found: false });
  }

  const users = profiles
    .filter((p) => p.email)
    .map((p) => ({ name: p.name, role: p.role, email: p.email }));

  if (!users.length) return NextResponse.json({ found: false });

  return NextResponse.json({ found: true, users });
}
