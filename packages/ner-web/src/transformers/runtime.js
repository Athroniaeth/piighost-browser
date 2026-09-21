/**
 * The model-agnostic runner on top of transformers.js.
 *
 * transformers.js loads the model and the tokenizer, so any architecture it
 * handles works here without another line. Its token-classification pipeline
 * is not used, since it returns no positions: the model is driven directly,
 * with our own ids encoded unit by unit, and decoded here.
 *
 * The library is imported dynamically so it stays an optional dependency. A
 * project that only uses GLiNER never downloads it. A caller may also inject an
 * already imported module, which a bundled worker should do: a dynamic import
 * there produced a second module instance and the worker lost the state its
 * initialisation had set.
 */

import { decodeBio } from "./decoder.js";
import { encodeUnits } from "./encoder.js";

export class TransformersNer {
  /**
   * @param {object} parts
   * @param {any} parts.model
   * @param {any} parts.tokenizer
   */
  constructor({ model, tokenizer }) {
    this.model = model;
    this.tokenizer = tokenizer;
    this.idToLabel = model.config.id2label;
    this.classCount = Object.keys(this.idToLabel).length;
    this.needsTokenTypeIds = (model.sessions?.model?.inputNames ?? []).includes(
      "token_type_ids",
    );
    this._Tensor = null;
  }

  /**
   * Load a token-classification model and its tokenizer.
   *
   * @param {object} options
   * @param {string} options.model Hub id, or a local path.
   * @param {string} [options.dtype] Quantisation, for instance q8 or fp16.
   * @param {string} [options.device] wasm, webgpu or cpu, depending on the host.
   * @param {any} [options.transformers] An already imported module, to inject.
   * @returns {Promise<TransformersNer>}
   */
  static async load({ model, dtype = "q8", device, transformers }) {
    const lib = transformers ?? (await import("@huggingface/transformers"));
    const options = device ? { dtype, device } : { dtype };
    const [tokenizer, loaded] = await Promise.all([
      lib.AutoTokenizer.from_pretrained(model),
      lib.AutoModelForTokenClassification.from_pretrained(model, options),
    ]);
    const runner = new TransformersNer({ model: loaded, tokenizer });
    runner._Tensor = lib.Tensor;
    return runner;
  }

  /** The labels this model can emit, BIO prefixes stripped. */
  get labels() {
    const names = Object.values(this.idToLabel).map((name) =>
      String(name).replace(/^[BI]-/, ""),
    );
    return [...new Set(names)].filter((name) => name !== "O");
  }

  /**
   * Extract the entities of a text.
   *
   * @param {string} text The text to scan.
   * @param {string[]} [labels] Labels to keep, all of them if the list is empty.
   * @param {object} [options]
   * @param {number} [options.threshold] Confidence threshold, in [0, 1].
   * @returns {Promise<import("./decoder.js").Entity[]>}
   */
  async extract(text, labels = [], { threshold = 0.5 } = {}) {
    const { ids, firstTokenOfUnit, units } = encodeUnits(text, this.tokenizer);
    if (units.length === 0) return [];

    const Tensor = this._Tensor;
    const length = ids.length;
    const feeds = {
      input_ids: new Tensor("int64", BigInt64Array.from(ids, BigInt), [1, length]),
      attention_mask: new Tensor("int64", BigInt64Array.from(ids, () => 1n), [1, length]),
    };
    // A BERT-family model declares token_type_ids. One sequence is passed, so
    // zeros, but omitting it leaves the input to whatever the compatibility
    // layer invents.
    if (this.needsTokenTypeIds) {
      feeds.token_type_ids = new Tensor(
        "int64",
        BigInt64Array.from(ids, () => 0n),
        [1, length],
      );
    }
    const output = await this.model(feeds);

    const entities = decodeBio(
      output.logits.data,
      this.classCount,
      units,
      firstTokenOfUnit,
      this.idToLabel,
      text,
      threshold,
    );
    if (labels.length === 0) return entities;
    const wanted = new Set(labels);
    return entities.filter((entity) => wanted.has(entity.label));
  }
}
