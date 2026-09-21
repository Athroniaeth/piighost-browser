/**
 * The model catalogue, and what it takes to try another one.
 *
 * catalog.json is produced by tools/build-catalog.py, which queries the Hub.
 * Sizes are measured rather than copied, and an entry whose files are missing
 * does not get in.
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

/** The labels asked of a GLiNER, in natural language as it expects them. */
export const GLINER_LABELS: Record<string, string> = {
  PERSON: "person",
  LOCATION: "location",
  ORGANIZATION: "organization",
};

/**
 * Return the label map to pass the pipeline for a given model.
 *
 * GLiNER accepts any label, so it is asked for what the rules cannot do. A
 * token-classification model imposes its own, which are taken as they come.
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

/** A hand-typed entry, for a model outside the catalogue. */
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

/** The dtype transformers.js infers from a filename. */
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
