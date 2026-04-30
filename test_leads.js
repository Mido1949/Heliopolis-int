const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = 'https://wrmqrvqixtrasajjfbge.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetchLeads() {
  console.log('Testing leads fetch:');
  const { data, error, count } = await supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(3);
  console.log("Error:", error);
  console.log("Count:", count);
  console.log("Data length:", data?.length);
  if (data?.length) {
       console.log(data[0]);
  }
}

testFetchLeads();
