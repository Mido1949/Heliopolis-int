const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// [sku, name, series, category, cooling_kw, unit_price, stock_quantity, min_stock, specs]
const products = [
  ['GCHV-D22G/HR1-GSB', 'Wall Mounted 2.2kW', 'VRF IU Wall Mounted DC', 'Indoor', 2.2, 462.0, 10, 3],
  ['GCHV-D28G/HR1-GSB', 'Wall Mounted 2.8kW', 'VRF IU Wall Mounted DC', 'Indoor', 2.8, 465.5, 10, 3],
  ['GCHV-D36G/HR1-GSB', 'Wall Mounted 3.6kW', 'VRF IU Wall Mounted DC', 'Indoor', 3.6, 469.0, 10, 3],
  ['GCHV-D45G/HR1-GSC', 'Wall Mounted 4.5kW', 'VRF IU Wall Mounted DC', 'Indoor', 4.5, 514.5, 10, 3],
  ['GCHV-D56G/HR1-GSC', 'Wall Mounted 5.6kW', 'VRF IU Wall Mounted DC', 'Indoor', 5.6, 518.0, 10, 3],
  ['GCHV-D71G/HR1-GSC', 'Wall Mounted 7.0kW', 'VRF IU Wall Mounted DC', 'Indoor', 7.0, 525.0, 10, 3],
  ['CMV-V22Q4/HR1-C', 'Compact Cassette 2.2kW', 'VRF IU Compact 4-way Cassette', 'Indoor', 2.2, 777.0, 8, 3],
  ['CMV-V28Q4/HR1-C', 'Compact Cassette 2.8kW', 'VRF IU Compact 4-way Cassette', 'Indoor', 2.8, 780.5, 8, 3],
  ['CMV-V36Q4/HR1-C', 'Compact Cassette 3.6kW', 'VRF IU Compact 4-way Cassette', 'Indoor', 3.6, 787.5, 8, 3],
  ['CMV-V45Q4/HR1-C', 'Compact Cassette 4.5kW', 'VRF IU Compact 4-way Cassette', 'Indoor', 4.5, 791.0, 8, 3],
  ['CMV-V56QR/HR1',  'Round Cassette 5.6kW',  'VRF IU Round Flow Cassette', 'Indoor', 5.6,  882.0,   8, 3],
  ['CMV-V71QR/HR1',  'Round Cassette 7.1kW',  'VRF IU Round Flow Cassette', 'Indoor', 7.1,  892.5,   8, 3],
  ['CMV-V80QR/HR1',  'Round Cassette 8.0kW',  'VRF IU Round Flow Cassette', 'Indoor', 8.0,  896.0,   8, 3],
  ['CMV-V90QR/HR1',  'Round Cassette 9.0kW',  'VRF IU Round Flow Cassette', 'Indoor', 9.0,  990.5,   6, 3],
  ['CMV-V100QR/HR1', 'Round Cassette 10.0kW', 'VRF IU Round Flow Cassette', 'Indoor', 10.0, 994.0,   6, 3],
  ['CMV-V112QR/HR1', 'Round Cassette 11.2kW', 'VRF IU Round Flow Cassette', 'Indoor', 11.2, 997.5,   6, 3],
  ['CMV-V125QR/HR1', 'Round Cassette 12.5kW', 'VRF IU Round Flow Cassette', 'Indoor', 12.5, 1001.0,  5, 2],
  ['CMV-V140QR/HR1', 'Round Cassette 14.0kW', 'VRF IU Round Flow Cassette', 'Indoor', 14.0, 1004.5,  5, 2],
  ['CMV-V160QR/HR1', 'Round Cassette 16.0kW', 'VRF IU Round Flow Cassette', 'Indoor', 16.0, 1008.0,  5, 2],
  ['CMV-V22TA/HR1-C',  'Short Duct 2.2kW', 'VRF IU Short Duct', 'Indoor', 2.2, 486.5, 8, 3],
  ['CMV-V28TA/HR1-C',  'Short Duct 2.8kW', 'VRF IU Short Duct', 'Indoor', 2.8, 493.5, 8, 3],
  ['CMV-V36TA/HR1-C',  'Short Duct 3.6kW', 'VRF IU Short Duct', 'Indoor', 3.6, 504.0, 8, 3],
  ['CMV-V45TA/HR1-C',  'Short Duct 4.5kW', 'VRF IU Short Duct', 'Indoor', 4.5, 507.5, 8, 3],
  ['CMV-V56TA/HR1-C',  'Short Duct 5.6kW', 'VRF IU Short Duct', 'Indoor', 5.6, 560.0, 6, 3],
  ['CMV-V71TA/HR1-C',  'Short Duct 7.1kW', 'VRF IU Short Duct', 'Indoor', 7.1, 696.5, 6, 3],
  ['CMV-V71TB/HR1-B',  'Medium Duct 7.1kW',  'VRF IU Medium ESP Duct', 'Indoor', 7.1,  766.5,  6, 3],
  ['CMV-V80TB/HR1-B',  'Medium Duct 8.0kW',  'VRF IU Medium ESP Duct', 'Indoor', 8.0,  773.5,  6, 3],
  ['CMV-V90TB/HR1-B',  'Medium Duct 9.0kW',  'VRF IU Medium ESP Duct', 'Indoor', 9.0,  969.5,  5, 2],
  ['CMV-V100TB/HR1-B', 'Medium Duct 10.0kW', 'VRF IU Medium ESP Duct', 'Indoor', 10.0, 973.0,  5, 2],
  ['CMV-V120TB/HR1-B', 'Medium Duct 12.0kW', 'VRF IU Medium ESP Duct', 'Indoor', 12.0, 983.5,  5, 2],
  ['CMV-V150TB/HR1-B', 'Medium Duct 15.0kW', 'VRF IU Medium ESP Duct', 'Indoor', 15.0, 1004.5, 4, 2],
  ['CMV-V71TH/HR1-B',  'High ESP Duct 7.1kW',  'VRF IU High ESP Duct', 'Indoor', 7.1,  997.5,   5, 2],
  ['CMV-V80TH/HR1-B',  'High ESP Duct 8.0kW',  'VRF IU High ESP Duct', 'Indoor', 8.0,  1001.0,  5, 2],
  ['CMV-V90TH/HR1-B',  'High ESP Duct 9.0kW',  'VRF IU High ESP Duct', 'Indoor', 9.0,  1004.5,  5, 2],
  ['CMV-V100TH/HR1-B', 'High ESP Duct 10.0kW', 'VRF IU High ESP Duct', 'Indoor', 10.0, 1127.0,  4, 2],
  ['CMV-V120TH/HR1-B', 'High ESP Duct 12.0kW', 'VRF IU High ESP Duct', 'Indoor', 12.0, 1130.5,  4, 2],
  ['CMV-V150TH/HR1-B', 'High ESP Duct 15.0kW', 'VRF IU High ESP Duct', 'Indoor', 15.0, 1134.0,  4, 2],
  ['CMV-V200TH/HR1-B', 'High ESP Duct 20.0kW', 'VRF IU High ESP Duct', 'Indoor', 20.0, 2100.0,  3, 1],
  ['CMV-V250TH/HR1-B', 'High ESP Duct 25.0kW', 'VRF IU High ESP Duct', 'Indoor', 25.0, 2107.0,  3, 1],
  ['CMV-V280TH/HR1-B', 'High ESP Duct 28.0kW', 'VRF IU High ESP Duct', 'Indoor', 28.0, 2121.0,  3, 1],
  ['CMV-V450TH/HZR1',  'High ESP Duct 45.0kW', 'VRF IU High ESP Duct', 'Indoor', 45.0, 4403.0,  2, 1],
  ['CMV-V560TH/HZR1',  'High ESP Duct 56.0kW', 'VRF IU High ESP Duct', 'Indoor', 56.0, 4462.5,  2, 1],
  ['CMV-V140TF/HR1-B', 'Fresh Air 14.0kW', 'VRF IU Fresh Air Processor', 'Indoor', 14.0, 1235.5,  4, 2],
  ['CMV-V224TF/HR1-B', 'Fresh Air 22.4kW', 'VRF IU Fresh Air Processor', 'Indoor', 22.4, 2313.5,  3, 1],
  ['CMV-V280TF/HR1-B', 'Fresh Air 28.0kW', 'VRF IU Fresh Air Processor', 'Indoor', 28.0, 2327.5,  3, 1],
  ['CMV-V450TF/HZR1',  'Fresh Air 45.0kW', 'VRF IU Fresh Air Processor', 'Indoor', 45.0, 4945.5,  2, 1],
  ['CMV-V560TF/HZR1',  'Fresh Air 56.0kW', 'VRF IU Fresh Air Processor', 'Indoor', 56.0, 5012.0,  2, 1],
  ['QR-X02D',  'HRV 400m³/h',   'HRV', 'Controller', null, 696.5,   3, 1],
  ['QR-X03D',  'HRV 500m³/h',   'HRV', 'Controller', null, 850.5,   3, 1],
  ['QR-X04D',  'HRV 600m³/h',   'HRV', 'Controller', null, 1130.5,  3, 1],
  ['QR-X05D',  'HRV 800m³/h',   'HRV', 'Controller', null, 1372.0,  3, 1],
  ['QR-X06D',  'HRV 1000m³/h',  'HRV', 'Controller', null, 1543.5,  2, 1],
  ['QR-X08D',  'HRV 1300m³/h',  'HRV', 'Controller', null, 1911.0,  2, 1],
  ['QR-X10D',  'HRV 1500m³/h',  'HRV', 'Controller', null, 2446.5,  2, 1],
  ['QR-X13D',  'HRV 2000m³/h',  'HRV', 'Controller', null, 2842.0,  2, 1],
  ['QR-X15DS', 'HRV 2500m³/h',  'HRV', 'Controller', null, 3265.5,  1, 1],
  ['QR-X20DS', 'HRV 3000m³/h',  'HRV', 'Controller', null, 3703.0,  1, 1],
  ['QR-X25DS', 'HRV 4000m³/h',  'HRV', 'Controller', null, 4056.5,  1, 1],
  ['CHV-DH080W/R1',       'Mini VRF 8kW 1PH',   'Mini VRF', 'Outdoor', 8.0,  1771.0, 5, 2],
  ['CHV-DH100W/R1',       'Mini VRF 10kW 1PH',  'Mini VRF', 'Outdoor', 10.0, 2114.0, 5, 2],
  ['GCHV-D125W/HR1-D01',  'Mini VRF 12.5kW 1PH','Mini VRF', 'Outdoor', 12.5, 2485.0, 5, 2],
  ['GCHV-D140W/HR1-F01',  'Mini VRF 14kW 1PH',  'Mini VRF', 'Outdoor', 14.0, 2821.0, 4, 2],
  ['GCHV-D160W/HR1-F01',  'Mini VRF 16kW 1PH',  'Mini VRF', 'Outdoor', 16.0, 2908.5, 4, 2],
  ['GCHV-D125W/HZR1-D01',  'Mini VRF 12.5kW 3PH', 'Mini VRF', 'Outdoor', 12.5, 2565.5, 4, 2],
  ['GCHV-D140W/HZR1-F01',  'Mini VRF 14kW 3PH',   'Mini VRF', 'Outdoor', 14.0, 2863.0, 4, 2],
  ['GCHV-D160W/HZR1-F01',  'Mini VRF 16kW 3PH',   'Mini VRF', 'Outdoor', 16.0, 2961.0, 4, 2],
  ['GCHV-D125W/HZR1-050D', 'Mini VRF 12.5kW 3PH D','Mini VRF','Outdoor', 12.5, 2821.0, 4, 2],
  ['GCHV-D140W/HZR1-050D', 'Mini VRF 14kW 3PH D',  'Mini VRF','Outdoor', 14.0, 2828.0, 4, 2],
  ['GCHV-D160W/HZR1-050D', 'Mini VRF 16kW 3PH D',  'Mini VRF','Outdoor', 16.0, 2933.0, 4, 2],
  ['GCHV-D180W/HZR1-050D', 'Mini VRF 18kW 3PH',    'Mini VRF','Outdoor', 18.0, 3255.0, 3, 1],
  ['GCHV-D200W/HZR1-080',  'Mini VRF 20kW 3PH',    'Mini VRF','Outdoor', 20.0, 3661.0, 3, 1],
  ['GCHV-D224W/HZR1-080',  'Mini VRF 22.4kW 3PH',  'Mini VRF','Outdoor', 22.4, 3755.5, 3, 1],
  ['GCHV-D260W/HZR1-100',  'Mini VRF 26kW 3PH',    'Mini VRF','Outdoor', 26.0, 4231.5, 3, 1],
  ['GCHV-D280W/HZR1-100',  'Mini VRF 28kW 3PH',    'Mini VRF','Outdoor', 28.0, 4851.0, 2, 1],
  ['GCHV-D335W/HZR1-100',  'Mini VRF 33.5kW 3PH',  'Mini VRF','Outdoor', 33.5, 4893.0, 2, 1],
  ['GCHV-E252W/HZR1-DK01', 'PRO VRF 25.2kW',  'CHV PRO Series', 'Outdoor', 25.2, 7574.0,  3, 1],
  ['GCHV-E280W/HZR1-DK01', 'PRO VRF 28.0kW',  'CHV PRO Series', 'Outdoor', 28.0, 7644.0,  3, 1],
  ['GCHV-E335W/HZR1-DK01', 'PRO VRF 33.5kW',  'CHV PRO Series', 'Outdoor', 33.5, 7707.0,  3, 1],
  ['GCHV-E400W/HZR1-DM01', 'PRO VRF 40.0kW',  'CHV PRO Series', 'Outdoor', 40.0, 9250.5,  2, 1],
  ['GCHV-E450W/HZR1-DM01', 'PRO VRF 45.0kW',  'CHV PRO Series', 'Outdoor', 45.0, 9306.5,  2, 1],
  ['GCHV-E500W/HZR1-DM01', 'PRO VRF 50.0kW',  'CHV PRO Series', 'Outdoor', 50.0, 9621.5,  2, 1],
  ['GCHV-E560W/HZR1-DM01', 'PRO VRF 56.0kW',  'CHV PRO Series', 'Outdoor', 56.0, 10325.0, 2, 1],
  ['GCHV-E615W/HZR1-DM01', 'PRO VRF 61.5kW',  'CHV PRO Series', 'Outdoor', 61.5, 10605.0, 2, 1],
  ['GCHV-E670W/HZR1-DS01', 'PRO VRF 67.0kW',  'CHV PRO Series', 'Outdoor', 67.0, 12533.5, 1, 1],
  ['GCHV-E730W/HZR1-DS01', 'PRO VRF 73.0kW',  'CHV PRO Series', 'Outdoor', 73.0, 14962.5, 1, 1],
  ['GCHV-E785W/HZR1-DS01', 'PRO VRF 78.5kW',  'CHV PRO Series', 'Outdoor', 78.5, 15102.5, 1, 1],
  ['GCHV-E850W/HZR1-DS01', 'PRO VRF 85.0kW',  'CHV PRO Series', 'Outdoor', 85.0, 16940.0, 1, 1],
  ['GCHV-E900W/HZR1-DS01', 'PRO VRF 90.0kW',  'CHV PRO Series', 'Outdoor', 90.0, 17160.5, 1, 1],
];

async function seed() {
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // clear previous

  const records = products.map(p => ({
    model: p[0],
    category: p[3],
    capacity_kw: p[4],
    price: p[5],
    stock: p[6],
    min_stock: p[7]
  }));

  const { data, error } = await supabase
    .from('products')
    .insert(records);

  if (error) {
    console.error('Error seeding products:', error);
  } else {
    console.log(`Successfully seeded ${records.length} products to the database!`);
  }
}

seed();
