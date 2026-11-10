// Dumps the whole pool database (settings + every week) to backup.json.
// The weekly Backup workflow encrypts it and keeps it on the "backups" branch.
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("index.html", "utf8");
const DB = html.match(/SUPABASE_URL = "([^"]+)"/)[1];
const KEY = html.match(/SUPABASE_KEY = "([^"]+)"/)[1];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function all(table) {
  const r = await fetch(`${DB}/rest/v1/${table}?select=*`, { headers: H });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  return r.json();
}
const out = { takenAt: new Date().toISOString(), pool_config: await all("pool_config"), pool_weeks: await all("pool_weeks") };
writeFileSync("backup.json", JSON.stringify(out));
console.log(`Backed up ${out.pool_config.length} settings row(s) and ${out.pool_weeks.length} week row(s).`);
