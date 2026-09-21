/**
 * Décodage BIO, reproduit d'après le pipeline token-classification de
 * référence.
 *
 * Chaque mot prend le libellé de son premier sous-token, ce que la
 * bibliothèque appelle la stratégie first. Les mots voisins portant le même
 * libellé sont ensuite regroupés en une entité, un préfixe B ouvrant toujours
 * un nouveau groupe. Le score du groupe est la moyenne des scores de ses mots,
 * comme en Python, pour que la parité soit vérifiable chiffre par chiffre.
 */

/**
 * Sépare le préfixe BIO du libellé.
 *
 * Un libellé sans préfixe est traité comme un I, ce que fait la référence :
 * seul un B force l'ouverture d'un groupe.
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
 * Normalise un vecteur de logits en probabilités.
 *
 * Le maximum est retranché avant l'exponentielle, sinon un logit élevé déborde.
 *
 * @param {Float32Array|number[]} logits
 * @param {number} offset Début du vecteur dans le tableau.
 * @param {number} count Nombre de classes.
 * @returns {{index: number, score: number}} La classe la plus probable.
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
 * Décode les logits d'un modèle de token-classification en entités.
 *
 * @param {Float32Array|number[]} logits Aplatis, en [tokens, classes].
 * @param {number} classCount Nombre de classes du modèle.
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
