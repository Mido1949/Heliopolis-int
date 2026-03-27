import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy');

export async function POST(request: Request) {
  try {
    const { campaignId } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 });
    }

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

    // 1. Fetch Campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'Sent') {
      return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 });
    }

    // 2. Fetch Recipients joined with Leads
    const { data: recipients, error: recipientsError } = await supabase
      .from('email_recipients')
      .select('*, lead:leads(email, name)')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    if (recipientsError) {
      return NextResponse.json({ error: 'Failed to fetch recipients' }, { status: 500 });
    }

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'No pending recipients found' }, { status: 400 });
    }

    // 3. Prepare Emails
    const host = request.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const emailsToSend = recipients
      .filter((r) => r.lead?.email) // Ensure lead has an email
      .map((r) => {
        const trackingPixel = `<img src="${baseUrl}/api/email/track?cid=${campaignId}&rid=${r.id}" width="1" height="1" style="display:none;" />`;
        const personalizedBody = campaign.body
          .replace('{{name}}', r.lead.name || 'Customer')
          .replace('</body>', `${trackingPixel}</body>`);
          
        // If </body> tag doesn't exist, just append it
        const finalBody = personalizedBody.includes(trackingPixel) 
          ? personalizedBody 
          : `${personalizedBody}${trackingPixel}`;

        return {
          from: `${campaign.from_name || 'Loomark'} <onboarding@resend.dev>`,
          to: [r.lead.email],
          subject: campaign.subject,
          html: finalBody,
        };
      });

    if (emailsToSend.length === 0) {
      return NextResponse.json({ error: 'No valid email addresses found' }, { status: 400 });
    }

    // 4. Send Emails via Resend
    let sentCount = 0;
    
    // Check if real key exists, otherwise simulate
    if (!process.env.RESEND_API_KEY) {
      console.log('SIMULATING EMAIL SEND - NO RESEND_API_KEY PROVIDED');
      console.log(`Sending ${emailsToSend.length} emails for campaign ${campaign.subject}`);
      sentCount = emailsToSend.length;
    } else {
      try {
        const { error } = await resend.batch.send(emailsToSend);
        if (error) {
          console.error('Resend Error:', error);
          // If Resend fails, we still might want to mark it or throw
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        sentCount = emailsToSend.length; // Assuming all succeeded if no overall error
      } catch (err) {
        console.error('Failed to dispatch to Resend:', err);
        return NextResponse.json({ error: 'Failed to dispatch emails' }, { status: 500 });
      }
    }

    // 5. Update DB Records
    const now = new Date().toISOString();

    // Mark recipients as sent
    await supabase
      .from('email_recipients')
      .update({ status: 'sent', sent_at: now })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    // Mark campaign as sent
    await supabase
      .from('email_campaigns')
      .update({ 
        status: 'Sent', 
        sent_count: sentCount,
        sent_at: now
      })
      .eq('id', campaignId);

    return NextResponse.json({ 
      success: true, 
      sentCount,
      message: `Successfully sent ${sentCount} emails.` 
    });

  } catch (error: unknown) {
    console.error('Email API Error:', error);
    return NextResponse.json(
      { error: (error as Error)?.message || 'Internal logic error' },
      { status: 500 }
    );
  }
}
