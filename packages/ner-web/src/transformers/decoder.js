/**
 * BIO decoding, reproduced from the reference token-classification pipeline.
 *
 * Each unit takes the label of its first sub-token, what the library calls the
 * first strategy. Neighbouring units carrying the same label are then grouped
 * into one entity, a B prefix always opening a new group. The group score is
 * the mean of its units' scores, as in Python, so parity is checkable digit by
 * digit.
 */

/**
 * Separate the BIO prefix from the label.
 *
 * A label with no prefix is treated as an I, as the reference does: only a B
 * forces a new group open.
 *
 * @param {string} name
 * @returns {{prefix: string, tag: string}}
 */
function splitTag(name) {
  if (name.startsWith("B-")) return { prefix: "B", tag: name.slice(2) };
  if (name.startsWith("I-")) return { prefix: "I", tag: name.slice(2) };
  return { prefix: "I", tag: name };
}

/**
 * Normalise a logit vector into probabilities.
 *
 * The maximum is subtracted before the exponential, otherwise a large logit
 * overflows.
 *
 * @param {Float32Array|number[]} logits
 * @param {number} offset Where the vector starts in the array.
 * @param {number} count Number of classes.
 * @returns {{index: number, score: number}} The most likely class.
 */
function argmaxSoftmax(logits, offset, count) {
  let highest = -Infinity;
  for (let index = 0; index < count; index++) {
    const value = logits[offset + index];
    if (value > highest) highest = value;
  }

  let total = 0;
  let best = 0;
  let bestExp = -Infinity;
  for (let index = 0; index < count; index++) {
    const exponent = Math.exp(logits[offset + index] - highest);
    total += exponent;
    if (exponent > bestExp) {
      bestExp = exponent;
      best = index;
    }
  }
  return { index: best, score: bestExp / total };
}

/**
 * @typedef {object} Entity
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {string} label
 * @property {number} score
 */

/**
 * Decode a token-classification model's logits into entities.
 *
 * @param {Float32Array|number[]} logits Flattened, as [tokens, classes].
 * @param {number} classCount Number of classes the model has.
 * @param {import("../splitter.js").Word[]} units
 * @param {number[]} firstTokenOfUnit
 * @param {Record<number, string>} idToLabel
 * @param {string} text
 * @param {number} threshold
 * @returns {Entity[]}
 */
export function decodeBio(
  logits,
  classCount,
  units,
  firstTokenOfUnit,
  idToLabel,
  text,
  threshold,
) {
  const tagged = [];
  for (let index = 0; index < units.length; index++) {
    const token = firstTokenOfUnit[index];
    if (token < 0) continue;
    const { index: classIndex, score } = argmaxSoftmax(
      logits,
      token * classCount,
      classCount,
    );
    tagged.push({ unit: index, name: idToLabel[classIndex] ?? "O", score });
  }

  const groups = [];
  let current = null;
  for (const entry of tagged) {
    const { prefix, tag } = splitTag(entry.name);
    const continues =
      current !== null && current.tag === tag && prefix !== "B";
    if (continues) {
      current.entries.push(entry);
      continue;
    }
    if (current !== null) groups.push(current);
    current = { tag, entries: [entry] };
  }
  if (current !== null) groups.push(current);

  const entities = [];
  for (const group of groups) {
    if (group.tag === "O") continue;
    const scores = group.entries.map((entry) => entry.score);
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    if (mean <= threshold) continue;
    const start = units[group.entries[0].unit].start;
    const end = units[group.entries[group.entries.length - 1].unit].end;
    entities.push({
      text: text.slice(start, end),
      start,
      end,
      label: group.tag,
      score: mean,
    });
  }
  return entities;
}
