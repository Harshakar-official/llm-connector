require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    await pool.query('DELETE FROM pending_alerts WHERE id = $1 AND org_id = $2', ['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000']);
    console.log("Success");
  } catch (e) {
    console.error("Error:", e);
  }
  pool.end();
}
run();
