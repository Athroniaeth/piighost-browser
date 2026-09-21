/**
 * Test de parité : le portage JS doit reproduire le décodeur GLiNER Python.
 *
 * La référence est produite par ref/make_gold.py sur le même fichier ONNX.
 * Toute divergence de span est une fuite potentielle, donc les spans sont
 * comparés strictement et seuls les scores tolèrent un écart numérique.
 */
import * as ort from "onnxruntime-node";
import fs from "node:fs";
import { GlinerWeb } from "../src/gliner/index.js";

const REPO = process.argv[2] ?? "/home/ubuntu/piighost-browser/ref/repo_gliner-pii-small-v1.0";
const GOLD = process.argv[3] ?? "./gold.json";
const TOLERANCE = 1e-4;

const gold = JSON.parse(fs.readFileSync(new URL(GOLD, import.meta.url), "utf8"));
const g = await GlinerWeb.load({
  model: fs.readFileSync(`${REPO}/model.onnx`),
  tokenizerJson: JSON.parse(fs.readFileSync(`${REPO}/tokenizer.json`, "utf8")),
  tokenizerConfig: JSON.parse(fs.readFileSync(`${REPO}/tokenizer_config.json`, "utf8")),
  ort,
  sessionOptions: { executionProviders: ["cpu"] },
});

let cases = 0, entities = 0, failures = 0;
let maxDelta = 0;

for (const { text, entities: want } of gold.cases) {
  cases++;
  const got = await g.extract(text, gold.labels, { threshold: gold.threshold, flat: true });
  const label = JSON.stringify(text.slice(0, 44));

  if (got.length !== want.length) {
    failures++;
    console.log(`FAIL ${label}\n  nombre d'entités : attendu ${want.length}, obtenu ${got.length}`);
    console.log(`  attendu : ${want.map((e) => `${e.label}[${e.start},${e.end}]`).join(" ")}`);
    console.log(`  obtenu  : ${got.map((e) => `${e.label}[${e.start},${e.end}]`).join(" ")}`);
    continue;
  }

  for (let i = 0; i < want.length; i++) {
    entities++;
    const a = want[i], b = got[i];
    const delta = Math.abs(a.score - b.score);
    if (delta > maxDelta) maxDelta = delta;
    if (a.start !== b.start || a.end !== b.end || a.label !== b.label || a.text !== b.text) {
      failures++;
      console.log(`FAIL ${label}\n  attendu ${a.label} ${JSON.stringify(a.text)} [${a.start},${a.end}]`);
      console.log(`  obtenu  ${b.label} ${JSON.stringify(b.text)} [${b.start},${b.end}]`);
    } else if (delta > TOLERANCE) {
      failures++;
      console.log(`FAIL ${label}\n  score ${a.label} [${a.start},${a.end}] : ${a.score} vs ${b.score} (écart ${delta.toExponential(2)})`);
    }
  }
}

console.log(`\n${REPO.split("/").pop()} | ${cases} cas, ${entities} entités comparées, écart de score max ${maxDelta.toExponential(2)}`);
console.log(failures === 0 ? "PARITÉ OK" : `${failures} DIVERGENCES`);
process.exit(failures === 0 ? 0 : 1);
