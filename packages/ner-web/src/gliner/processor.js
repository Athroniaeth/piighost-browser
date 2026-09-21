/**
 * Construction des entrées du graphe ONNX.
 *
 * GLiNER voit une seule séquence : une invite qui énumère les libellés
 * demandés, puis le texte. Chaque mot est encodé séparément pour que
 * `words_mask` puisse pointer le premier sous-token de chaque mot, ce que le
 * modèle utilise pour ramener les sous-tokens à des mots.
 */

import { splitWords } from "../splitter.js";

const ENT_TOKEN = "<<ENT>>";
const SEP_TOKEN = "<<SEP>>";

/**
 * Mesure ce que le post-processeur du tokeniseur ajoute autour d'un texte.
 *
 * On ne peut pas supposer un token de chaque côté : selon le modèle le
 * post-processeur peut n'en ajouter aucun, ou plusieurs. On mesure donc une
 * fois sur la chaîne vide plutôt que de découper à l'aveugle.
 *
 * @param {{encode: (text: string) => {ids: number[]}}} tokenizer
 * @returns {{prefix: number, suffix: number, cls: number, sep: number}}
 */
export function measureSpecialTokens(tokenizer) {
  const empty = tokenizer.encode("").ids;
  const probe = tokenizer.encode("a").ids;
  // Ce que l'encodage de la chaîne vide contient est exactement l'enrobage.
  const prefix = empty.length === 0 ? 0 : 1;
  const suffix = empty.length >= 2 ? empty.length - prefix : 0;
  if (probe.length <= prefix + suffix) {
    throw new Error(
      "Le tokeniseur n'a produit aucun token pour un mot non vide ; " +
        "l'enrobage détecté est incohérent.",
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
 * Encode un texte et sa liste de libellés en une séquence prête pour le modèle.
 *
 * `wordsMask` vaut 0 sur l'invite et sur les sous-tokens de continuation, et
 * porte l'indice du mot, numéroté à partir de 1, sur son premier sous-token.
 *
 * @param {string} text Le texte à analyser.
 * @param {string[]} labels Les libellés interrogés, dans l'ordre.
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
 * Énumère les spans candidats pour un modèle span-level.
 *
 * Un span est une paire d'indices de mots. Le masque écarte ceux qui
 * dépasseraient la fin du texte, que le modèle ne doit pas noter.
 *
 * @param {number} wordCount Nombre de mots du texte.
 * @param {number} maxWidth Largeur maximale d'un span, en mots.
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
