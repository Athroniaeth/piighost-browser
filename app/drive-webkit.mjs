import { webkit } from "playwright";

const b = await webkit.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 900 } });
page.on("pageerror", (e) => console.log("  [pageerror]", String(e.message).slice(0, 220)));
page.on("console", (m) => { if (m.type() === "error") console.log("  [err]", m.text().slice(0, 220)); });
await page.addInitScript(() => localStorage.setItem("piighost-hub-locale", "fr"));

const t0 = Date.now();
await page.goto("https://piighost-wasm.athroniaeth.cloud/");
const caps = await page.evaluate(() => ({
  isolated: crossOriginIsolated,
  sab: typeof SharedArrayBuffer !== "undefined",
  caches: typeof caches !== "undefined",
  cores: navigator.hardwareConcurrency,
  wasm: typeof WebAssembly !== "undefined",
  worker: typeof Worker !== "undefined",
}));
console.log("capacités :", JSON.stringify(caps));

try {
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((x) => x.textContent?.trim() === "Anonymiser" && !x.disabled),
    null, { timeout: 400000, polling: 1000 });
  console.log("moteur prêt en", ((Date.now() - t0) / 1000).toFixed(1), "s");
} catch {
  console.log("== moteur jamais prêt ==");
  console.log("colonne 1 :", (await page.locator("main section").first().innerText()).slice(0, 300).replace(/\n/g, " | "));
  await b.close();
  process.exit(1);
}
console.log("threads annoncés :", await page.locator("header").innerText().then((t) => t.replace(/\n/g, " ")));

await page.getByRole("button", { name: /^Anonymiser$/ }).click();
await page.waitForFunction(() => document.body.textContent?.includes("<<"), null, { timeout: 120000, polling: 500 });
console.log("règles seules :", (await page.locator("main ul li").allInnerTexts()).length, "entités");

const id = "knowledgator/gliner-pii-small-v1.0";
await page.selectOption("main select", id);
await page.getByRole("button", { name: /^Charger$/ }).click();
const t1 = Date.now();
try {
  await page.waitForFunction((x) => document.querySelector("main section")?.textContent?.includes(x), id, { timeout: 600000, polling: 1000 });
  console.log("modèle chargé en", ((Date.now() - t1) / 1000).toFixed(1), "s");
} catch {
  console.log("== modèle jamais chargé ==");
  console.log("colonne 1 :", (await page.locator("main section").first().innerText()).slice(0, 300).replace(/\n/g, " | "));
  await b.close();
  process.exit(1);
}
await page.getByRole("button", { name: /^Anonymiser$/ }).click();
await page.waitForFunction(() => document.body.textContent?.includes("ms modèle"), null, { timeout: 180000, polling: 500 });
await page.waitForTimeout(400);
console.log("statut :", await page.locator("main p.text-xs").first().innerText());
console.log("entités :", (await page.locator("main ul li").allInnerTexts()).length);
await page.screenshot({ path: "shot-webkit.png" });
await b.close();
