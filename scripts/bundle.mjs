// Joins the app's feature files into one app.js so phones make one request
// instead of a dozen. Run after editing any of them: node scripts/bundle.mjs
// (the Bundle workflow also runs it on every push).
import { readFileSync, writeFileSync } from "node:fs";
export const FILES = ["draft", "stats", "extras", "history", "home", "club", "egg", "fun", "records", "watch", "party", "calm", "tips", "settle"];
const parts = FILES.map(f => `\n/* ===== ${f}.js ===== */\n;` + readFileSync(`${f}.js`, "utf8"));
writeFileSync("app.js", "// Built by scripts/bundle.mjs from the files listed there. Edit those, not this.\n" + parts.join("\n"));
console.log(`app.js: ${FILES.length} files, ${Math.round(parts.join("").length / 1024)} KB`);
