/**
 * Parity for the transformers engine: the JavaScript port must reproduce the
 * reference token-classification pipeline, character offsets included.
 *
 * The reference comes from ref/gold_transformers.py, which runs the same ONNX
 * file through optimum. Comparing against the PyTorch repository instead would
 * be meaningless: for this model the two declare a different number of labels
 * and their outputs have nothing in common. Spans and labels are compared
 * strictly, only the scores tolerate a deviation.
 */
import fs from "node:fs";
import { TransformersNer } from "../src/transformers/index.js";
import { env } from "@huggingface/transformers";

env.cacheDir = "./.cache";

const MODEL = "onnx-community/bert-small-pii-detection-ONNX";
const TOLERANCE = 2e-3;

const gold = JSON.parse(fs.readFileSync(new URL("./gold-transformers.json", import.meta.url), "utf8"));
const ner = await TransformersNer.load({ model: MODEL, dtype: "fp32" });

let cases = 0, entities = 0, failures = 0, maxDelta = 0;

for (const { text, entities: want } of gold.cases) {
  cases++;
  const got = await ner.extract(text, [], { threshold: gold.threshold });
  const label = JSON.stringify(text.slice(0, 44));

  if (got.length !== want.length) {
    failures++;
    console.log(`FAIL ${label}`);
    console.log(`  expected : ${want.map((e) => `${e.label}[${e.start},${e.end}]`).join(" ") || "(rien)"}`);
    console.log(`  got  : ${got.map((e) => `${e.label}[${e.start},${e.end}]`).join(" ") || "(rien)"}`);
    continue;
  }

  for (let i = 0; i < want.length; i++) {
    entities++;
    const a = want[i], b = got[i];
    const delta = Math.abs(a.score - b.score);
    if (delta > maxDelta) maxDelta = delta;
    if (a.start !== b.start || a.end !== b.end || a.label !== b.label || a.text !== b.text) {
      failures++;
      console.log(`FAIL ${label}`);
      console.log(`  expected ${a.label} ${JSON.stringify(a.text)} [${a.start},${a.end}]`);
      console.log(`  got  ${b.label} ${JSON.stringify(b.text)} [${b.start},${b.end}]`);
    } else if (delta > TOLERANCE) {
      failures++;
      console.log(`FAIL ${label} : score ${a.label} ${a.score} vs ${b.score} (écart ${delta.toExponential(2)})`);
    }
  }
}

console.log(`\ntransformers | ${cases} cases, ${entities} entities compared, max score deviation ${maxDelta.toExponential(2)}`);
console.log(failures === 0 ? "PARITY OK" : `${failures} DIVERGENCES`);
process.exit(failures === 0 ? 0 : 1);
