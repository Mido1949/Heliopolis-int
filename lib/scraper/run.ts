import { ApifyClient } from 'apify-client';
import type { ScrapedBusiness } from '@/lib/leads/intake';

export interface ScrapedResult {
  place_name: string | null; category: string | null; phone: string | null;
  address: string | null; rating: number | null; reviews_count: number | null;
  website: string | null; latitude?: number | null; longitude?: number | null;
}

export async function runScrape(target: { query: string; region: string }): Promise<ScrapedResult[]> {
  const { query, region } = target;
  const searchString = region ? `${query} in ${region}` : query;
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (apifyToken) {
    const client = new ApifyClient({ token: apifyToken });

    const input = {
      searchStringsArray: [searchString],
      maxCrawledPlacesPerSearch: 5,
      language: "ar",
      proxyConfig: { useApifyProxy: true },
    };

    const run = await client.actor("compass/crawler-google-places").call(input);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const results: ScrapedResult[] = (items as Array<Record<string, unknown>>).map((item) => ({
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

    return results;
  }

  // MOCK FALLBACK (Since no API Key is provided)
  console.log('No APIFY_API_TOKEN found. Using mock data for', searchString);

  await new Promise(resolve => setTimeout(resolve, 2000));

  return [
    {
      place_name: `شركة ${query} العالمية - ${region || 'المركز الرئيسي'}`,
      category: 'HVAC Contractor',
      phone: '+20 100 123 4567',
      address: `123 شارع التسعين, ${region || 'القاهرة'}`,
      rating: 4.8,
      reviews_count: 124,
      website: 'https://example-hvac.com',
    },
    {
      place_name: `مؤسسة المهندس للتكييف - ${region || 'الفرع الأول'}`,
      category: 'Air Conditioning System Supplier',
      phone: '+20 111 987 6543',
      address: `45 شارع النزهة, ${region || 'القاهرة'}`,
      rating: 4.5,
      reviews_count: 85,
      website: 'https://almohandes-ac.local',
    },
    {
      place_name: `${query} جروب للصيانة`,
      category: 'HVAC Contractor',
      phone: '+20 122 345 6789',
      address: `المنطقة الصناعية, ${region || 'القاهرة'}`,
      rating: 4.2,
      reviews_count: 42,
      website: 'https://group-hvac.org',
    },
    {
      place_name: `معرض التكييف المركزي - ${region || 'مصر'}`,
      category: 'HVAC Store',
      phone: '+20 100 000 1111',
      address: `المعادي, ${region || 'القاهرة'}`,
      rating: 3.9,
      reviews_count: 12,
      website: null,
    },
    {
      place_name: `خبراء ${query} للمقاولات`,
      category: 'Contractor',
      phone: '+20 155 555 5555',
      address: `مدينة نصر, ${region || 'القاهرة'}`,
      rating: 5.0,
      reviews_count: 310,
      website: 'https://hvac-experts-eg.com',
    },
  ];
}

export function toBusinesses(results: ScrapedResult[]): ScrapedBusiness[] {
  return results.map(r => ({
    name: r.place_name || undefined,
    phone: r.phone || undefined,
    address: r.address || undefined,
    category: r.category || undefined,
    website: r.website || undefined,
    source: 'Scraper',
  }));
}
