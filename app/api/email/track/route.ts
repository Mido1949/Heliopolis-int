import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('cid');
  const recipientId = searchParams.get('rid');

  if (campaignId && recipientId) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // 1. Update recipient status to 'opened'
    const { data: recipient } = await supabase
      .from('email_recipients')
      .select('status')
      .eq('id', recipientId)
      .single();

    if (recipient && recipient.status !== 'opened') {
      const now = new Date().toISOString();
      
      // Update recipient
      await supabase
        .from('email_recipients')
        .update({ status: 'opened', opened_at: now })
        .eq('id', recipientId);

      // 2. Increment campaign opened_count
      // Note: This is an optimistic increment. In pro systems, you'd use an RPC to be atomic.
      const { data: campaign } = await supabase
        .from('email_campaigns')
        .select('opened_count')
        .eq('id', campaignId)
        .single();
        
      if (campaign) {
        await supabase
          .from('email_campaigns')
          .update({ opened_count: (campaign.opened_count || 0) + 1 })
          .eq('id', campaignId);
      }
    }
  }

  // Return a 1x1 transparent pixel
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new NextResponse(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
