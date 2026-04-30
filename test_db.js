const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = 'https://wrmqrvqixtrasajjfbge.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
  console.log('Testing boqs fetch:');
  const { data, error } = await supabase
    .from("boqs")
    .select("*, lead:leads(name), boq_items(*, product:products(*))")
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("Error:", error);
  console.log("Data length:", data?.length);
  if (data?.length) {
       console.log(data[0]);
  }
}

testFetch();
