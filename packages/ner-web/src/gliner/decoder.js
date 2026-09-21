/**
 * Décodage des logits en entités portant des décalages caractère.
 *
 * Les deux architectures GLiNER ont des dispositions de sortie différentes, et
 * s'y tromper ne lève aucune erreur : le modèle rend simplement des scores
 * incohérents. Les dispositions sont donc écrites ici explicitement.
 *
 *   token-level : [batch, mots, classes, 3], la dernière dimension portant
 *                 (début, fin, intérieur)
 *   span-level  : [batch, mots, largeur_max, classes]
 */

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * @typedef {object} Entity
 * @property {string} text  Le texte exact de l'entité, tranché dans la source.
 * @property {number} start Décalage de début, inclusif.
 * @property {number} end   Décalage de fin, exclusif.
 * @property {string} label Le libellé retenu.
 * @property {number} score Confiance, dans [0, 1].
 */

/**
 * Deux spans se recouvrent-ils, au sens des indices de mots ?
 *
 * @param {Entity} a
 * @param {Entity} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return !(a.start >= b.end || b.start >= a.end);
}

/**
 * Un span est-il entièrement contenu dans l'autre ?
 *
 * @param {Entity} a
 * @param {Entity} b
 * @returns {boolean}
 */
function nested(a, b) {
  return (a.start <= b.start && a.end >= b.end) || (b.start <= a.start && b.end >= a.end);
}

/**
 * Retient les entités les plus sûres et écarte celles qui les recouvrent.
 *
 * En mode plat, tout recouvrement est éliminé. Sinon, seuls les recouvrements
 * partiels le sont, une entité imbriquée restant admissible.
 *
 * @param {Entity[]} entities
 * @param {boolean} flat
 * @returns {Entity[]} Les entités retenues, triées par position.
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
 * Décode la sortie d'un modèle token-level.
 *
 * Reproduit le décodeur BIO du GLiNER de référence : on retient les positions
 * de début et de fin au-dessus du seuil, on les apparie à classe égale, on
 * exige que tout l'intérieur du span soit lui aussi au-dessus du seuil, et le
 * score du span est le minimum de tous ces scores.
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
 * Décode la sortie d'un modèle span-level.
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
