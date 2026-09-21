/**
 * Splitting into units and encoding, to recover the offsets transformers.js
 * does not provide.
 *
 * Its token-classification pipeline returns neither start nor end, and its
 * tokenizer does not accept return_offsets_mapping: the field is a TODO open
 * for two years. Rebuilding the positions by gluing sub-token pieces back
 * together would be heuristic, and would break on accents and out-of-vocabulary
 * characters, which is exactly where a wrong span leaks a value.
 *
 * So the other path is taken: split first into units that carry their
 * positions, then encode each unit separately. Concatenating those encodings
 * gives the same id sequence as encoding the whole text, and every sub-token is
 * traced back to its unit.
 *
 * The units have to be the model's, not ours. The pre-tokenizer declared in
 * tokenizer.json is therefore asked: for a BERT model it returns Jean, -, Luc
 * where a word split would return Jean-Luc, and grouping at the wrong
 * granularity shifts the spans. When it is unreachable, or when its pieces do
 * not align onto the text, the word splitter takes over, which stays correct
 * for tokenizers that do not isolate punctuation.
 */

import { splitWords } from "../splitter.js";

/** Prefixes some pre-tokenizers add to mark a leading space. */
const MARKERS = /^[Ġ▁]/;

/**
 * Return a text's ids, whichever library is in use.
 *
 * transformers.js returns an array, @huggingface/tokenizers returns an object
 * carrying an ids field. Both are accepted so the encoder serves both engines
 * without an adapter at the call site.
 *
 * @param {any} tokenizer
 * @param {string} text
 * @returns {number[]}
 */
function encodeIds(tokenizer, text) {
  const encoded = tokenizer.encode(text);
  return Array.isArray(encoded) ? encoded : encoded.ids;
}

/**
 * Split the text with the model's pre-tokenizer, positions included.
 *
 * The pieces it returns are substrings of the text, so they are found by
 * scanning forward. A piece that cannot be found signals a pre-tokenizer that
 * transforms rather than splits, and the caller then falls back to the word
 * splitter.
 *
 * @param {string} text
 * @param {any} tokenizer
 * @returns {import("../splitter.js").Word[] | null}
 */
export function preTokenUnits(text, tokenizer) {
  const inner = tokenizer?._tokenizer ?? tokenizer;
  const pre = inner?.pre_tokenizer;
  if (typeof pre?.pre_tokenize_text !== "function") return null;

  let pieces;
  try {
    pieces = pre.pre_tokenize_text(text);
  } catch {
    return null;
  }
  if (!Array.isArray(pieces)) return null;

  const units = [];
  let cursor = 0;
  for (const piece of pieces) {
    const cleaned = String(piece).replace(MARKERS, "");
    if (cleaned.length === 0) continue;
    const at = text.indexOf(cleaned, cursor);
    if (at < 0) return null;
    units.push({ text: cleaned, start: at, end: at + cleaned.length });
    cursor = at + cleaned.length;
  }
  return units;
}

/**
 * @typedef {object} Encoded
 * @property {number[]} ids Ids of the whole sequence.
 * @property {number[]} firstTokenOfUnit Index of each unit's first sub-token,
 *   or -1 when the unit produced no token.
 * @property {import("../splitter.js").Word[]} units The units and their positions.
 */

/**
 * Measure what the tokenizer's post-processor wraps a text with.
 *
 * One token on each side cannot be assumed: depending on the model there may be
 * none, or several. It is measured once rather than trimmed blindly.
 *
 * @param {any} tokenizer
 * @returns {{prefix: number, suffix: number, opening: number[], closing: number[]}}
 */
export function measureWrapping(tokenizer) {
  const empty = encodeIds(tokenizer, "");
  if (empty.length === 0) {
    return { prefix: 0, suffix: 0, opening: [], closing: [] };
  }
  const prefix = 1;
  return {
    prefix,
    suffix: empty.length - prefix,
    opening: empty.slice(0, prefix),
    closing: empty.slice(prefix),
  };
}

/**
 * Encode a text unit by unit, keeping track of the units.
 *
 * @param {string} text
 * @param {any} tokenizer
 * @returns {Encoded}
 */
export function encodeUnits(text, tokenizer) {
  const units = preTokenUnits(text, tokenizer) ?? splitWords(text);
  const wrapping = measureWrapping(tokenizer);

  const ids = [...wrapping.opening];
  const firstTokenOfUnit = [];

  for (const unit of units) {
    const encoded = encodeIds(tokenizer, unit.text);
    const pieces = encoded.slice(wrapping.prefix, encoded.length - wrapping.suffix);
    firstTokenOfUnit.push(pieces.length > 0 ? ids.length : -1);
    ids.push(...pieces);
  }

  ids.push(...wrapping.closing);
  return { ids, firstTokenOfUnit, units };
}
