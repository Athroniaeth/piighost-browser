import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:8765/index.html";
const timeout = Number(process.argv[3] || 300000);
const b = await chromium.launch();
const page = await b.newPage();
page.on("console", (m) => { const t = m.text(); if (t) console.log("  [b]", t.slice(0, 300)); });
page.on("pageerror", (e) => console.log("  [pageerror]", String(e.message).slice(0, 300)));
await page.goto(url);
try { await page.waitForFunction(() => window.__done !== null, { timeout }); }
catch { console.log("== TIMEOUT =="); }
console.log("\n===== LOG =====");
console.log(await page.$eval("#log", (el) => el.textContent));
await b.close();
