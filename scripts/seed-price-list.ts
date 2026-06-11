// scripts/seed-price-list.ts
// Seed the price_list table with 97 official GCHV models from price_list_seed.json
// Run with: npx tsx scripts/seed-price-list.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY env var to bypass RLS for admin operations.
// Reads SUPABASE_URL from .env.local (NEXT_PUBLIC_SUPABASE_URL).

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

interface RawItem {
  model: string;
  capacity_kw: number | string;
  description: string;
  price_usd: number;
}

interface PriceItem {
  model: string;
  capacity_kw: number;
  description: string;
  price_usd: number;
}

// Load from the official GCHV price list JSON
const raw: RawItem[] = JSON.parse(
  readFileSync(resolve(process.cwd(), 'price_list_seed.json'), 'utf-8')
);

// Normalize: "/" capacity_kw (HRV/ventilator units) → 0
const PRICE_LIST: PriceItem[] = raw.map((item) => ({
  model: item.model,
  capacity_kw: item.capacity_kw === '/' ? 0 : Number(item.capacity_kw),
  description: item.description,
  price_usd: item.price_usd,
}));

async function main() {
  console.log(`Seeding ${PRICE_LIST.length} items to price_list...`);

  // Upsert in batches of 50 to avoid payload size issues
  const BATCH = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < PRICE_LIST.length; i += BATCH) {
    const slice = PRICE_LIST.slice(i, i + BATCH);
    const { error } = await supabase
      .from('price_list')
      .upsert(slice, { onConflict: 'model' });
    if (error) {
      console.error(`Batch ${i}-${i + BATCH} failed:`, error.message);
      errors += slice.length;
    } else {
      inserted += slice.length;
      console.log(`  ✓ ${i + slice.length}/${PRICE_LIST.length}`);
    }
  }

  console.log(`\nDone: ${inserted} inserted/updated, ${errors} errors.`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
