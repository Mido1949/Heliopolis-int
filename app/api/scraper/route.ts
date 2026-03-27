import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApifyClient } from 'apify-client';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, location } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const searchString = location ? `${query} in ${location}` : query;
    const apifyToken = process.env.APIFY_API_TOKEN;
    
    interface ScrapedResult {
      place_name: string | null;
      category: string | null;
      phone: string | null;
      address: string | null;
      rating: number | null;
      reviews_count: number | null;
      website: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }

    let results: ScrapedResult[] = [];

    if (apifyToken) {
      // 1. Initialize the ApifyClient
      const client = new ApifyClient({ token: apifyToken });

      // 2. Prepare actor input
      const input = {
        searchStringsArray: [searchString],
        maxCrawledPlacesPerSearch: 5,
        language: "ar",
        proxyConfig: { useApifyProxy: true },
      };

      try {
        // 3. Run the Google Maps Scraper actor (compass/crawler-google-places)
        const run = await client.actor("compass/crawler-google-places").call(input);
        
        // 4. Fetch the results
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        results = (items as Array<Record<string, unknown>>).map((item) => ({
          place_name: (item.title as string) || null,
          category: (item.categoryName as string) || null,
          phone: (item.phone as string) || null,
          address: (item.address as string) || null,
          rating: (item.totalScore as number) || null,
          reviews_count: (item.reviewsCount as number) || null,
          website: (item.website as string) || null,
          latitude: (item.location as Record<string, number>)?.lat || null,
          longitude: (item.location as Record<string, number>)?.lng || null,
        }));
      } catch (error: unknown) {
        console.error('Apify API error:', error);
        return NextResponse.json({ error: 'Failed to scrape using Apify.' }, { status: 500 });
      }
    } else {
      // MOCK FALLBACK (Since no API Key is provided)
      console.log('No APIFY_API_TOKEN found. Using mock data for', searchString);
      
      // Artificial delay to simulate scraping
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      results = [
        {
          place_name: `شركة ${query} العالمية - ${location || 'المركز الرئيسي'}`,
          category: 'HVAC Contractor',
          phone: '+20 100 123 4567',
          address: `123 شارع التسعين, ${location || 'القاهرة'}`,
          rating: 4.8,
          reviews_count: 124,
          website: 'https://example-hvac.com',
        },
        {
          place_name: `مؤسسة المهندس للتكييف - ${location || 'الفرع الأول'}`,
          category: 'Air Conditioning System Supplier',
          phone: '+20 111 987 6543',
          address: `45 شارع النزهة, ${location || 'القاهرة'}`,
          rating: 4.5,
          reviews_count: 85,
          website: 'https://almohandes-ac.local',
        },
        {
          place_name: `${query} جروب للصيانة`,
          category: 'HVAC Contractor',
          phone: '+20 122 345 6789',
          address: `المنطقة الصناعية, ${location || 'القاهرة'}`,
          rating: 4.2,
          reviews_count: 42,
          website: 'https://group-hvac.org',
        },
        {
          place_name: `معرض التكييف المركزي - ${location || 'مصر'}`,
          category: 'HVAC Store',
          phone: '+20 100 000 1111',
          address: `المعادي, ${location || 'القاهرة'}`,
          rating: 3.9,
          reviews_count: 12,
          website: null,
        },
        {
          place_name: `خبراء ${query} للمقاولات`,
          category: 'Contractor',
          phone: '+20 155 555 5555',
          address: `مدينة نصر, ${location || 'القاهرة'}`,
          rating: 5.0,
          reviews_count: 310,
          website: 'https://hvac-experts-eg.com',
        }
      ];
    }

    // Insert results into scraped_leads table
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
      mocked: !apifyToken
    });

  } catch (error) {
    console.error('Scraper error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
