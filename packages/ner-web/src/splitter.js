/**
 * Word splitting, with character offsets.
 *
 * This is what makes GLiNER work for a span-based tool without needing offsets
 * from the tokenizer. The model reasons over words, and this splitter knows
 * where each word starts and ends in the original text.
 *
 * The pattern mirrors the Python GLiNER one, `\w+(?:[-_]\w+)*|\S`. In Python
 * `\w` is Unicode by default, while in JavaScript it means `[A-Za-z0-9_]`.
 * Writing `\w` here would split "Mélenchon" into three words and silently
 * change the model input on any accented text, so the classes are spelled out
 * and the `u` flag is required.
 */

const WORD = /[\p{L}\p{N}_]+(?:[-_][\p{L}\p{N}_]+)*|\S/gu;

/**
 * @typedef {object} Word
 * @property {string} text  The word as it appears in the text.
 * @property {number} start Start offset, inclusive.
 * @property {number} end   End offset, exclusive.
 */

/**
 * Split a text into words carrying their position.
 *
 * @param {string} text The text to split.
 * @returns {Word[]} The words, in text order.
 */
export function splitWords(text) {
  const words = [];
  WORD.lastIndex = 0;
  let match;
  while ((match = WORD.exec(text)) !== null) {
    words.push({ text: match[0], start: match.index, end: WORD.lastIndex });
  }
  return words;
}
