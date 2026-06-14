import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runScrape } from '@/lib/scraper/run';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, location } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    let results;
    try {
      results = await runScrape({ query, region: location || '' });
    } catch {
      return NextResponse.json({ error: 'Failed to scrape using Apify.' }, { status: 500 });
    }

    const inserts = results.map(r => ({
      ...r,
      imported: false,
    }));

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('scraped_leads')
        .insert(inserts);

      if (insertError) {
        console.error('Supabase raw insert error:', insertError);
        return NextResponse.json({ error: 'Failed to save leads to database' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      count: inserts.length,
      mocked: !process.env.APIFY_API_TOKEN,
    });

  } catch (error) {
    console.error('Scraper error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
