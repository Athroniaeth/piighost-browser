/**
 * Un texte plus long que la fenêtre du modèle ne doit pas perdre sa fin.
 *
 * Un encodeur a un nombre fini de positions. Les dépasser doit soit échouer,
 * et l'appelant découpe alors le texte, soit analyser quand même jusqu'au bout.
 * Ce qui est interdit est la troisième issue : réussir en n'ayant lu qu'un
 * préfixe, ce qui laisse les PII de la fin en clair sans rien signaler.
 *
 * Le repère est une entité placée au tout dernier caractère du texte. Si
 * l'exécuteur rend un résultat sans elle, il a tronqué en silence.
 *
 * Ce cas manquait au jeu de parité, et le défaut est parti en production.
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
 * Analyse un texte, en distinguant un refus d'un résultat.
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

/** Vérifie qu'un exécuteur lit un texte court, puis qu'il ne tronque pas. */
async function check(name, runner, labels, repeats) {
  const short = await attempt(runner, `${FILLER}${MARKER}.`, labels);
  if (short.refused || short.entities.length === 0) {
    failures++;
    console.log(`FAIL ${name} : un texte court doit produire des entités`);
    return;
  }
  console.log(`  ${name} : texte court, ${short.entities.length} entités`);

  const text = `${FILLER.repeat(repeats)}${MARKER}.`;
  const long = await attempt(runner, text, labels);
  if (long.refused) {
    console.log(`  ${name} : ${text.length} caractères refusés, à l'appelant de découper`);
    return;
  }
  const tail = long.entities.some((entity) => entity.start > text.length - MARKER.length - 4);
  if (tail) {
    console.log(`  ${name} : ${text.length} caractères analysés jusqu'à la fin`);
  } else {
    failures++;
    console.log(
      `FAIL ${name} : ${text.length} caractères ont rendu ${long.entities.length} entités, ` +
        "mais aucune dans la fin du texte, donc elle a été tronquée en silence",
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
// Un modèle de token-classification impose ses libellés, on les garde tous.
await check("transformers", transformers, [], 200);

console.log(failures === 0 ? "\nFENÊTRE OK" : `\n${failures} DÉFAUTS`);
process.exit(failures === 0 ? 0 : 1);
