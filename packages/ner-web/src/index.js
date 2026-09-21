/**
 * Two NER runners, one output contract.
 *
 * Each returns spans carrying character offsets, the shape piighost's
 * BridgeDetector consumes. They are interchangeable: the choice is made on the
 * model family, not on what the pipeline expects.
 */

export { splitWords } from "./splitter.js";
export { GlinerWeb } from "./gliner/index.js";
export { TransformersNer } from "./transformers/index.js";
