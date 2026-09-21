/**
 * Building the ONNX graph inputs.
 *
 * GLiNER sees one sequence: a prompt listing the requested labels, then the
 * text. Each word is encoded separately so `words_mask` can point at the first
 * sub-token of every word, which the model uses to pool sub-tokens back into
 * words.
 */

import { splitWords } from "../splitter.js";

const ENT_TOKEN = "<<ENT>>";
const SEP_TOKEN = "<<SEP>>";

/**
 * Measure what the tokenizer's post-processor wraps a text with.
 *
 * One token on each side cannot be assumed: depending on the model the
 * post-processor may add none, or several. So it is measured once on the empty
 * string rather than trimmed blindly.
 *
 * @param {{encode: (text: string) => {ids: number[]}}} tokenizer
 * @returns {{prefix: number, suffix: number, cls: number, sep: number}}
 */
export function measureSpecialTokens(tokenizer) {
  const empty = tokenizer.encode("").ids;
  const probe = tokenizer.encode("a").ids;
  // Whatever encoding the empty string yields is exactly the wrapping.
  const prefix = empty.length === 0 ? 0 : 1;
  const suffix = empty.length >= 2 ? empty.length - prefix : 0;
  if (probe.length <= prefix + suffix) {
    throw new Error(
      "The tokenizer produced no token for a non-empty word, so the " +
        "wrapping detected above is inconsistent.",
    );
  }
  return {
    prefix,
    suffix,
    cls: empty[0],
    sep: empty[empty.length - 1],
  };
}

/**
 * @typedef {object} Encoded
 * @property {number[]} inputIds
 * @property {number[]} attentionMask
 * @property {number[]} wordsMask
 * @property {import("../splitter.js").Word[]} words
 */

/**
 * Encode a text and its labels into a sequence the model can take.
 *
 * `wordsMask` is 0 over the prompt and over continuation sub-tokens, and holds
 * the word index, numbered from 1, on that word's first sub-token.
 *
 * @param {string} text The text to scan.
 * @param {string[]} labels The labels queried, in order.
 * @param {{encode: (text: string) => {ids: number[]}}} tokenizer
 * @param {{prefix: number, suffix: number, cls: number, sep: number}} special
 * @returns {Encoded}
 */
export function encode(text, labels, tokenizer, special) {
  const words = splitWords(text);

  const prompt = [];
  for (const label of labels) {
    prompt.push(ENT_TOKEN, label);
  }
  prompt.push(SEP_TOKEN);

  const inputIds = [special.cls];
  const attentionMask = [1];
  const wordsMask = [0];

  const encodeWord = (word) => {
    const ids = tokenizer.encode(word).ids;
    return ids.slice(special.prefix, ids.length - special.suffix);
  };

  for (const piece of prompt) {
    for (const id of encodeWord(piece)) {
      inputIds.push(id);
      attentionMask.push(1);
      wordsMask.push(0);
    }
  }

  let counter = 1;
  for (const word of words) {
    const ids = encodeWord(word.text);
    ids.forEach((id, position) => {
      inputIds.push(id);
      attentionMask.push(1);
      wordsMask.push(position === 0 ? counter : 0);
    });
    if (ids.length > 0) counter += 1;
  }

  inputIds.push(special.sep);
  attentionMask.push(1);
  wordsMask.push(0);

  return { inputIds, attentionMask, wordsMask, words };
}

/**
 * Enumerate the candidate spans for a span-level model.
 *
 * A span is a pair of word indices. The mask drops those that would run past
 * the end of the text, which the model must not score.
 *
 * @param {number} wordCount Number of words in the text.
 * @param {number} maxWidth Maximum span width, in words.
 * @returns {{spanIdx: number[][], spanMask: boolean[]}}
 */
export function buildSpans(wordCount, maxWidth) {
  const spanIdx = [];
  const spanMask = [];
  for (let start = 0; start < wordCount; start++) {
    for (let width = 0; width < maxWidth; width++) {
      const end = start + width;
      spanIdx.push([start, Math.min(end, wordCount - 1)]);
      spanMask.push(end < wordCount);
    }
  }
  return { spanIdx, spanMask };
}
