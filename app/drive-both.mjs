import { chromium } from "playwright";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 900 } });
page.on("pageerror", (e) => console.log("  [pageerror]", String(e.message).slice(0, 250)));
page.on("console", (m) => { if (m.type() !== "log") console.log("  [" + m.type() + "]", m.text().slice(0, 200)); });
await page.addInitScript(() => localStorage.setItem("piighost-hub-locale", "fr"));
await page.goto(process.argv[2] ?? "https://piighost-wasm.athroniaeth.cloud/");
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((x) => x.textContent?.trim() === "Anonymiser" && !x.disabled),
  null, { timeout: 300000, polling: 1000 });

for (const id of [
  "knowledgator/gliner-pii-small-v1.0",
  "onnx-community/gliner_multi_pii-v1",
  "onnx-community/bert-small-pii-detection-ONNX",
]) {
  await page.selectOption("main select", id);
  await page.getByRole("button", { name: /^Charger$/ }).click();
  const t0 = Date.now();
  try {
    await page.waitForFunction((x) => document.querySelector("main section")?.textContent?.includes(x), id, { timeout: 120000, polling: 1000 });
  } catch {
    console.log(`ÉCHEC ${id}`);
    console.log("  colonne 1 :", (await page.locator("main section").first().innerText()).split("Charger")[1]?.slice(0, 200).replace(/\n/g, " | "));
    continue;
  }
  const load = ((Date.now() - t0) / 1000).toFixed(1);
  await page.getByRole("button", { name: /^Anonymiser$/ }).click();
  await page.waitForFunction(() => document.body.textContent?.includes("ms modèle"), null, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(400);
  const status = await page.locator("main p.text-xs").first().innerText();
  const n = (await page.locator("main ul li").allInnerTexts()).length;
  console.log(`${id.padEnd(46)} chargé en ${load.padStart(5)} s | ${status.replace(/\n/g, " ")} | ${n} entités`);
}
await b.close();
