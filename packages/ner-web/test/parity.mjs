/**
 * Parity test: the JavaScript port must reproduce the Python GLiNER decoder.
 *
 * The reference comes from ref/make_gold.py on the same ONNX file. Any span
 * divergence is a potential leak, so spans are compared strictly and only the
 * scores tolerate a numerical deviation.
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
    console.log(`FAIL ${label}\n  nombre d'entités : expected ${want.length}, got ${got.length}`);
    console.log(`  expected : ${want.map((e) => `${e.label}[${e.start},${e.end}]`).join(" ")}`);
    console.log(`  got  : ${got.map((e) => `${e.label}[${e.start},${e.end}]`).join(" ")}`);
    continue;
  }

  for (let i = 0; i < want.length; i++) {
    entities++;
    const a = want[i], b = got[i];
    const delta = Math.abs(a.score - b.score);
    if (delta > maxDelta) maxDelta = delta;
    if (a.start !== b.start || a.end !== b.end || a.label !== b.label || a.text !== b.text) {
      failures++;
      console.log(`FAIL ${label}\n  expected ${a.label} ${JSON.stringify(a.text)} [${a.start},${a.end}]`);
      console.log(`  got  ${b.label} ${JSON.stringify(b.text)} [${b.start},${b.end}]`);
    } else if (delta > TOLERANCE) {
      failures++;
      console.log(`FAIL ${label}\n  score ${a.label} [${a.start},${a.end}] : ${a.score} vs ${b.score} (écart ${delta.toExponential(2)})`);
    }
  }
}

console.log(`\n${REPO.split("/").pop()} | ${cases} cases, ${entities} entities compared, max score deviation ${maxDelta.toExponential(2)}`);
console.log(failures === 0 ? "PARITY OK" : `${failures} DIVERGENCES`);
process.exit(failures === 0 ? 0 : 1);
