import { chromium } from "playwright";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 900 } });
page.on("pageerror", (e) => console.log("  [pageerror]", String(e.message).slice(0, 200)));
await page.addInitScript(() => localStorage.setItem("piighost-hub-locale", "fr"));
const t0 = Date.now();
await page.goto("https://piighost-wasm.athroniaeth.cloud/");
console.log("isolé :", await page.evaluate(() => crossOriginIsolated));
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((x) => x.textContent?.trim() === "Anonymiser" && !x.disabled),
  null, { timeout: 400000 });
console.log("moteur prêt en", ((Date.now() - t0) / 1000).toFixed(1), "s (sans modèle)");
await page.getByRole("button", { name: /^Anonymiser$/ }).click();
await page.waitForFunction(() => document.body.textContent?.includes("<<"), null, { timeout: 60000 });
console.log("règles seules :", (await page.locator("main ul li").allInnerTexts()).length, "entités");

const id = "knowledgator/gliner-pii-small-v1.0";
await page.selectOption("main select", id);
await page.getByRole("button", { name: /^Charger$/ }).click();
const t1 = Date.now();
await page.waitForFunction((x) => document.querySelector("main section")?.textContent?.includes(x), id, { timeout: 600000 });
console.log("modèle chargé depuis le Hub en", ((Date.now() - t1) / 1000).toFixed(1), "s");
await page.getByRole("button", { name: /^Anonymiser$/ }).click();
await page.waitForFunction(() => document.body.textContent?.includes("ms modèle"), null, { timeout: 180000 });
await page.waitForTimeout(400);
console.log("statut :", await page.locator("main p.text-xs").first().innerText());
console.log("entités :", (await page.locator("main ul li").allInnerTexts()).length);
await page.screenshot({ path: "shot-prod2.png" });
await b.close();
