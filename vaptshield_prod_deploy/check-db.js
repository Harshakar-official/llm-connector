const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const res = await pool.query(`SELECT id, title, status, project_id, found_by FROM vulnerabilities WHERE org_id = '00e56846-b7b1-43ce-96a7-7ddce76d2461'`);
  console.log("Vulnerabilities:", res.rows);
  
  const res2 = await pool.query(`SELECT id, alert_name, status, task_id FROM pending_alerts WHERE org_id = '00e56846-b7b1-43ce-96a7-7ddce76d2461'`);
  console.log("Pending Alerts:", res2.rows.slice(0, 20));
  
  pool.end();
}
check();
