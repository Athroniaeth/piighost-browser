/**
 * Découpage en unités et encodage, pour récupérer les décalages que
 * transformers.js ne donne pas.
 *
 * Le pipeline token-classification de transformers.js ne rend ni start ni end,
 * et son tokeniseur n'accepte pas return_offsets_mapping : le champ est un TODO
 * ouvert depuis deux ans. Reconstruire les positions en recollant les morceaux
 * de sous-tokens serait heuristique, et casserait sur les accents et les
 * caractères hors vocabulaire, c'est-à-dire exactement là où un span faux
 * laisse fuir une valeur.
 *
 * On prend donc l'autre chemin : découper d'abord en unités qui portent leurs
 * positions, puis encoder chaque unité séparément. Recoller ces encodages donne
 * la même séquence d'identifiants que l'encodage du texte entier, et l'on sait
 * en prime quel sous-token appartient à quelle unité.
 *
 * Les unités doivent être celles du modèle, pas les nôtres. Le pré-tokeniseur
 * déclaré dans tokenizer.json est donc interrogé : pour un modèle BERT il rend
 * Jean, -, Luc là où un découpage par mots rendrait Jean-Luc, et grouper au
 * mauvais grain décale les spans. Quand il est inatteignable ou que ses
 * morceaux ne s'alignent pas sur le texte, on retombe sur le découpage par
 * mots, qui reste correct pour les tokeniseurs qui n'isolent pas la
 * ponctuation.
 */

import { splitWords } from "../splitter.js";

/** Préfixes que certains pré-tokeniseurs ajoutent pour marquer l'espace. */
const MARKERS = /^[Ġ▁]/;

/**
 * Rend les identifiants d'un texte, quelle que soit la bibliothèque.
 *
 * transformers.js rend un tableau, @huggingface/tokenizers rend un objet
 * portant un champ ids. Les deux sont acceptés pour que l'encodeur serve les
 * deux moteurs sans adaptateur à l'appel.
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
 * Découpe le texte avec le pré-tokeniseur du modèle, positions comprises.
 *
 * Les morceaux rendus sont des sous-chaînes du texte, alors on les y retrouve
 * par un balayage vers l'avant. Un morceau introuvable signale un
 * pré-tokeniseur qui transforme au lieu de découper, et l'appelant retombe
 * alors sur le découpage par mots.
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
 * @property {number[]} ids Identifiants de la séquence complète.
 * @property {number[]} firstTokenOfUnit Index du premier sous-token de chaque
 *   unité, ou -1 quand l'unité n'a produit aucun token.
 * @property {import("../splitter.js").Word[]} units Les unités et leurs positions.
 */

/**
 * Mesure ce que le post-processeur du tokeniseur ajoute autour d'un texte.
 *
 * On ne peut pas supposer un token de chaque côté : selon le modèle il peut n'y
 * en avoir aucun, ou plusieurs. On mesure une fois plutôt que de couper à
 * l'aveugle.
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
 * Encode un texte unité par unité, en gardant la trace des unités.
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
