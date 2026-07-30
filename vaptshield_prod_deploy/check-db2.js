const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ypgtxilmkiwitsiythpm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZ3R4aWxta2l3aXRzaXl0aHBtIiwicm9sZSI6ImNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODIyMDk3NSwiZXhwIjoyMDkzNzk2OTc1fQ.KdyCF5SO-vAtFJanZxQVRF8ZGazZDnHuQomnYpMiQlY'
);

async function check() {
  const { data: vulns } = await supabase
    .from("vulnerabilities")
    .select("id, title, status, project_id, found_by")
    .eq("org_id", '00e56846-b7b1-43ce-96a7-7ddce76d2461');
    
  console.log("Vulnerabilities (total):", vulns ? vulns.length : 0);
  console.log("First few vulns:", vulns ? vulns.slice(0, 5) : []);
  
  const { data: alerts } = await supabase
    .from("pending_alerts")
    .select("id, alert_name, status, task_id")
    .eq("org_id", '00e56846-b7b1-43ce-96a7-7ddce76d2461');
    
  console.log("Pending Alerts (total):", alerts ? alerts.length : 0);
  console.log("First few alerts:", alerts ? alerts.slice(0, 5) : []);
}
check();
