// Un texte plus long que la fenêtre du modèle : que se passe-t-il ?
import { TransformersNer } from "./src/transformers/index.js";
import { env } from "@huggingface/transformers";
env.cacheDir = "./.cache";
const ner = await TransformersNer.load({ model: "onnx-community/bert-small-pii-detection-ONNX", dtype: "fp32" });
const unit = "Jean Dupont habite a Lyon et son mail est jean@example.com. ";
for (const n of [1, 20, 60]) {
  const text = unit.repeat(n) + "Le dernier client est Marie Curie a Paris.";
  try {
    const out = await ner.extract(text, [], { threshold: 0.5 });
    const last = out[out.length - 1];
    console.log(`${String(text.length).padStart(5)} car. -> ${String(out.length).padStart(3)} entités | dernière: ${last ? `${last.label} [${last.start},${last.end}]` : "(aucune)"}`);
  } catch (e) {
    console.log(`${String(text.length).padStart(5)} car. -> ERREUR ${String(e.message).slice(0, 120)}`);
  }
}
