/**
 * Le catalogue de modèles, et ce qu'il faut pour en essayer un autre.
 *
 * catalog.json est produit par tools/build-catalog.py, qui interroge le Hub :
 * les tailles y sont mesurées, pas recopiées, et une entrée dont les fichiers
 * manquent n'y entre pas.
 */

import catalog from "./catalog.json";

export type ModelEntry = {
  id: string;
  engine: "gliner" | "transformers";
  weights: string;
  dtype: string;
  megabytes: number;
  dtypeJs?: string;
  maxWidth?: number;
  spanMode?: string;
};

export const CATALOG = catalog as ModelEntry[];

/** Les libellés demandés à un GLiNER, en langue naturelle comme il les attend. */
export const GLINER_LABELS: Record<string, string> = {
  PERSON: "person",
  LOCATION: "location",
  ORGANIZATION: "organization",
};

/**
 * Rend la carte de libellés à passer au pipeline pour un modèle donné.
 *
 * GLiNER accepte n'importe quel libellé, on lui demande donc ce que les règles
 * ne savent pas faire. Un modèle de token-classification impose les siens, on
 * les reprend tels quels en écartant ce que les règles couvrent déjà mieux.
 */
export function labelsFor(
  engine: string,
  modelLabels: string[],
): Record<string, string> {
  if (engine === "gliner") return GLINER_LABELS;
  const map: Record<string, string> = {};
  for (const label of modelLabels) map[label] = label;
  return map;
}

/** Une entrée saisie à la main, pour un modèle hors catalogue. */
export function customEntry(
  id: string,
  engine: "gliner" | "transformers",
  weights: string,
): ModelEntry {
  return {
    id: id.trim(),
    engine,
    weights,
    dtype: "?",
    megabytes: 0,
    dtypeJs: engine === "transformers" ? weightsToDtype(weights) : undefined,
  };
}

/** Le dtype que transformers.js déduit d'un nom de fichier. */
function weightsToDtype(weights: string): string {
  const table: Record<string, string> = {
    "onnx/model.onnx": "fp32",
    "onnx/model_fp16.onnx": "fp16",
    "onnx/model_quantized.onnx": "q8",
    "onnx/model_int8.onnx": "int8",
    "onnx/model_uint8.onnx": "uint8",
    "onnx/model_q4.onnx": "q4",
  };
  return table[weights] ?? "q8";
}
