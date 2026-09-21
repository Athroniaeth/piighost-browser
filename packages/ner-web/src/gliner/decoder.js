/**
 * Decoding logits into entities carrying character offsets.
 *
 * The two GLiNER architectures have different output layouts, and getting one
 * wrong raises nothing: the model simply returns incoherent scores. Both are
 * therefore spelled out here.
 *
 *   token-level: [batch, words, classes, 3], the last dimension holding
 *                (start, end, inside)
 *   span-level:  [batch, words, max_width, classes]
 */

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * @typedef {object} Entity
 * @property {string} text  The entity text, sliced from the source.
 * @property {number} start Start offset, inclusive.
 * @property {number} end   End offset, exclusive.
 * @property {string} label The label kept.
 * @property {number} score Confidence, in [0, 1].
 */

/**
 * Do two spans overlap?
 *
 * @param {Entity} a
 * @param {Entity} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return !(a.start >= b.end || b.start >= a.end);
}

/**
 * Is one span entirely contained in the other?
 *
 * @param {Entity} a
 * @param {Entity} b
 * @returns {boolean}
 */
function nested(a, b) {
  return (a.start <= b.start && a.end >= b.end) || (b.start <= a.start && b.end >= a.end);
}

/**
 * Keep the most confident entities and drop those that overlap them.
 *
 * In flat mode every overlap is removed. Otherwise only partial overlaps are,
 * so a nested entity stays admissible.
 *
 * @param {Entity[]} entities
 * @param {boolean} flat
 * @returns {Entity[]} The entities kept, sorted by position.
 */
export function greedySelect(entities, flat) {
  const conflicts = flat ? overlaps : (a, b) => overlaps(a, b) && !nested(a, b);
  const byScore = [...entities].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const candidate of byScore) {
    if (!kept.some((other) => conflicts(candidate, other))) {
      kept.push(candidate);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Decode a token-level model's output.
 *
 * Reproduces the reference GLiNER BIO decoder: keep the start and end
 * positions above the threshold, pair them at equal class, require the whole
 * inside of the span to be above the threshold too, and take the span score as
 * the minimum of all those scores.
 *
 * @param {Float32Array|number[]} logits
 * @param {import("../splitter.js").Word[]} words
 * @param {string[]} labels
 * @param {string} text
 * @param {number} threshold
 * @param {boolean} flat
 * @returns {Entity[]}
 */
export function decodeTokenLevel(logits, words, labels, text, threshold, flat) {
  const wordCount = words.length;
  const classCount = labels.length;
  const at = (word, cls, kind) => sigmoid(logits[(word * classCount + cls) * 3 + kind]);

  const starts = [];
  const ends = [];
  for (let word = 0; word < wordCount; word++) {
    for (let cls = 0; cls < classCount; cls++) {
      if (at(word, cls, 0) > threshold) starts.push([word, cls]);
      if (at(word, cls, 1) > threshold) ends.push([word, cls]);
    }
  }

  const candidates = [];
  for (const [startWord, cls] of starts) {
    for (const [endWord, endCls] of ends) {
      if (endWord < startWord || endCls !== cls) continue;

      let score = Math.min(at(startWord, cls, 0), at(endWord, cls, 1));
      let broken = false;
      for (let word = startWord; word <= endWord; word++) {
        const inside = at(word, cls, 2);
        if (inside <= threshold) {
          broken = true;
          break;
        }
        if (inside < score) score = inside;
      }
      if (broken) continue;

      const start = words[startWord].start;
      const end = words[endWord].end;
      candidates.push({ text: text.slice(start, end), start, end, label: labels[cls], score });
    }
  }
  return greedySelect(candidates, flat);
}

/**
 * Decode a span-level model's output.
 *
 * @param {Float32Array|number[]} logits
 * @param {import("../splitter.js").Word[]} words
 * @param {string[]} labels
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} threshold
 * @param {boolean} flat
 * @returns {Entity[]}
 */
export function decodeSpanLevel(logits, words, labels, text, maxWidth, threshold, flat) {
  const wordCount = words.length;
  const classCount = labels.length;
  const candidates = [];

  for (let startWord = 0; startWord < wordCount; startWord++) {
    for (let width = 0; width < maxWidth; width++) {
      const endWord = startWord + width;
      if (endWord >= wordCount) break;
      for (let cls = 0; cls < classCount; cls++) {
        const score = sigmoid(logits[((startWord * maxWidth + width) * classCount) + cls]);
        if (score <= threshold) continue;
        const start = words[startWord].start;
        const end = words[endWord].end;
        candidates.push({ text: text.slice(start, end), start, end, label: labels[cls], score });
      }
    }
  }
  return greedySelect(candidates, flat);
}
