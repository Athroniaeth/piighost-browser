/**
 * Découpage en mots, avec les décalages caractère.
 *
 * C'est la pièce qui rend GLiNER compatible avec un modèle à spans sans avoir
 * besoin des décalages du tokeniseur : le modèle raisonne sur des mots, et
 * c'est ce découpeur qui sait où chaque mot commence et finit dans le texte
 * d'origine.
 *
 * Le motif reproduit celui du GLiNER Python, `\w+(?:[-_]\w+)*|\S`. En Python
 * `\w` est Unicode par défaut, alors qu'en JavaScript il vaut `[A-Za-z0-9_]`.
 * Écrire `\w` ici découperait « Mélenchon » en trois mots et changerait
 * silencieusement l'entrée du modèle sur tout texte accentué, donc les classes
 * sont explicites et le drapeau `u` est obligatoire.
 */

const WORD = /[\p{L}\p{N}_]+(?:[-_][\p{L}\p{N}_]+)*|\S/gu;

/**
 * @typedef {object} Word
 * @property {string} text  Le mot tel qu'il apparaît dans le texte.
 * @property {number} start Décalage de début, inclusif.
 * @property {number} end   Décalage de fin, exclusif.
 */

/**
 * Découpe un texte en mots porteurs de leur position.
 *
 * @param {string} text Le texte à découper.
 * @returns {Word[]} Les mots, dans l'ordre du texte.
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
