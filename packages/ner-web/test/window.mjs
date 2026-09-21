/**
 * A text longer than the model's window must not lose its tail.
 *
 * An encoder has a finite number of positions. Overflowing them must either
 * fail, and the caller then chunks the text, or still read through to the end.
 * The forbidden third outcome is succeeding on a prefix alone, which leaves the
 * PII at the end in clear with nothing to signal it.
 *
 * The marker is an entity placed at the very last character. A runner that
 * returns a result without it has truncated silently.
 *
 * This case was missing from the parity set, and the defect reached production.
 */
import * as ort from "onnxruntime-node";
import fs from "node:fs";
import { env } from "@huggingface/transformers";

import { GlinerWeb } from "../src/gliner/index.js";
import { TransformersNer } from "../src/transformers/index.js";

env.cacheDir = "./.cache";

const REPO = "/home/ubuntu/piighost-browser/ref/repo_gliner-pii-small-v1.0";
const FILLER = "Le dossier avance normalement et rien de particulier n'est a signaler. ";
const MARKER = "Le referent est Zoe Beranger";
const GLINER_LABELS = ["person", "location", "phone number"];

let failures = 0;

/**
 * Scan a text, telling a refusal apart from a result.
 *
 * @returns {Promise<{refused: true} | {entities: object[]}>}
 */
async function attempt(runner, text, labels) {
  try {
    return { entities: await runner.extract(text, labels, { threshold: 0.4 }) };
  } catch {
    return { refused: true };
  }
}

/** Check a runner reads a short text, then that it does not truncate. */
async function check(name, runner, labels, repeats) {
  const short = await attempt(runner, `${FILLER}${MARKER}.`, labels);
  if (short.refused || short.entities.length === 0) {
    failures++;
    console.log(`FAIL ${name}: a short text must produce entities`);
    return;
  }
  console.log(`  ${name}: short text, ${short.entities.length} entities`);

  const text = `${FILLER.repeat(repeats)}${MARKER}.`;
  const long = await attempt(runner, text, labels);
  if (long.refused) {
    console.log(`  ${name}: ${text.length} characters refused, the caller must chunk`);
    return;
  }
  const tail = long.entities.some((entity) => entity.start > text.length - MARKER.length - 4);
  if (tail) {
    console.log(`  ${name}: ${text.length} characters read to the end`);
  } else {
    failures++;
    console.log(
      `FAIL ${name}: ${text.length} characters returned ${long.entities.length} entities, ` +
        "but none in the tail, so it was silently truncated",
    );
  }
}

const gliner = await GlinerWeb.load({
  model: fs.readFileSync(`${REPO}/model.onnx`),
  tokenizerJson: JSON.parse(fs.readFileSync(`${REPO}/tokenizer.json`, "utf8")),
  tokenizerConfig: JSON.parse(fs.readFileSync(`${REPO}/tokenizer_config.json`, "utf8")),
  ort,
  sessionOptions: { executionProviders: ["cpu"] },
});
await check("gliner", gliner, GLINER_LABELS, 200);

const transformers = await TransformersNer.load({
  model: "onnx-community/bert-small-pii-detection-ONNX",
  dtype: "fp32",
});
// A token-classification model imposes its labels, so keep them all.
await check("transformers", transformers, [], 200);

console.log(failures === 0 ? "\nWINDOW OK" : `\n${failures} DEFECTS`);
process.exit(failures === 0 ? 0 : 1);
