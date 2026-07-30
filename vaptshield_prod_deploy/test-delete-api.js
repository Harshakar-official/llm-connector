const http = require('http');
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query("SELECT id, org_id FROM pending_alerts LIMIT 1");
    if (rows.length === 0) {
      console.log("No pending alerts to delete.");
      return;
    }
    const alert = rows[0];
    console.log("Attempting to delete alert:", alert.id);

    // Call the API endpoint
    const res = await fetch(`http://localhost:3000/api/scan-findings/${alert.id}`, {
      method: 'DELETE',
      headers: {
        'Cookie': `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token=test`, // Provide a mock or just let it fail auth
      }
    });

    console.log("API status:", res.status);
    console.log("API response:", await res.text());

    const { rows: afterRows } = await pool.query("SELECT id FROM pending_alerts WHERE id = $1", [alert.id]);
    console.log("Is it still in DB?", afterRows.length > 0);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
test();
