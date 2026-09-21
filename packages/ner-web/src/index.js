/**
 * Deux exécuteurs NER, un seul contrat de sortie.
 *
 * Chacun rend des spans portant des décalages caractère, la forme que le
 * BridgeDetector de piighost consomme. Ils sont interchangeables : le choix se
 * fait sur la famille de modèle, pas sur ce que le pipeline en attend.
 */

export { splitWords } from "./splitter.js";
export { GlinerWeb } from "./gliner/index.js";
export { TransformersNer } from "./transformers/index.js";
