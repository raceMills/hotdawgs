// Checks whether Supabase realtime delivers database changes to the app.
// Listens on pool_config, writes a harmless timestamp (rtProbe), and reports.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const html = readFileSync("index.html", "utf8");
const sb = createClient(html.match(/SUPABASE_URL = "([^"]+)"/)[1], html.match(/SUPABASE_KEY = "([^"]+)"/)[1]);
let got = false;
const ch = sb.channel("rtcheck").on("postgres_changes", { event: "*", schema: "public", table: "pool_config" }, () => { got = true; });
await new Promise((res) => ch.subscribe((s) => { console.log("channel:", s); if (s === "SUBSCRIBED") res(); }));
const { data } = await sb.from("pool_config").select("data").eq("id", "main").maybeSingle();
await sb.from("pool_config").upsert({ id: "main", data: Object.assign({}, data.data, { rtProbe: Date.now() }) });
for (let i = 0; i < 20 && !got; i++) await new Promise(r => setTimeout(r, 500));
console.log(got ? "REALTIME WORKS" : "REALTIME OFF: no change event received in 10s");
process.exit(0);
