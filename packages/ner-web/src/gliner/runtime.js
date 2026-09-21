/**
 * The runner: tokenizer, processor, ONNX session and decoder, assembled.
 *
 * ONNX Runtime is injected rather than imported, so the caller picks its build
 * variant. Bundling ORT into an application bundle breaks its worker creation
 * path, so it has to come from its own distribution.
 */

import { Tokenizer } from "@huggingface/tokenizers";

import { decodeSpanLevel, decodeTokenLevel } from "./decoder.js";
import { buildSpans, encode, measureSpecialTokens } from "./processor.js";

const TOKEN_LEVEL = "token_level";
const SPAN_LEVEL = "span_level";

/**
 * Detect the architecture from the inputs the graph actually declares.
 *
 * The repository config announces a `span_mode`, but the graph is what counts:
 * a span-level model asks for `span_idx`, a token-level one does not.
 *
 * @param {string[]} inputNames
 * @returns {string}
 */
function detectMode(inputNames) {
  return inputNames.includes("span_idx") ? SPAN_LEVEL : TOKEN_LEVEL;
}

export class GlinerWeb {
  /**
   * @param {object} parts
   * @param {import("onnxruntime-common").InferenceSession} parts.session
   * @param {Tokenizer} parts.tokenizer
   * @param {any} parts.ort
   * @param {number} parts.maxWidth
   */
  constructor({ session, tokenizer, ort, maxWidth }) {
    this.session = session;
    this.tokenizer = tokenizer;
    this.ort = ort;
    this.maxWidth = maxWidth;
    this.mode = detectMode(session.inputNames);
    this.special = measureSpecialTokens(tokenizer);
  }

  /**
   * Load a model and its tokenizer.
   *
   * @param {object} options
   * @param {ArrayBuffer|Uint8Array|string} options.model ONNX weights, or their URL.
   * @param {object} options.tokenizerJson Contents of tokenizer.json.
   * @param {object} options.tokenizerConfig Contents of tokenizer_config.json.
   * @param {any} options.ort The onnxruntime-web module to use.
   * @param {number} [options.maxWidth] Maximum span width, in words.
   * @param {object} [options.sessionOptions] Options passed to the ONNX session.
   * @returns {Promise<GlinerWeb>}
   */
  static async load({
    model,
    tokenizerJson,
    tokenizerConfig,
    ort,
    maxWidth = 12,
    sessionOptions = { executionProviders: ["wasm"] },
  }) {
    const session = await ort.InferenceSession.create(model, sessionOptions);
    const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    return new GlinerWeb({ session, tokenizer, ort, maxWidth });
  }

  /**
   * Extract the entities of a text.
   *
   * @param {string} text The text to scan.
   * @param {string[]} labels The labels queried.
   * @param {object} [options]
   * @param {number} [options.threshold] Confidence threshold, in [0, 1].
   * @param {boolean} [options.flat] Forbid any overlap between entities.
   * @returns {Promise<import("./decoder.js").Entity[]>}
   */
  async extract(text, labels, { threshold = 0.5, flat = true } = {}) {
    const { inputIds, attentionMask, wordsMask, words } = encode(
      text,
      labels,
      this.tokenizer,
      this.special,
    );
    if (words.length === 0) return [];

    const { Tensor } = this.ort;
    const length = inputIds.length;
    const int64 = (values) => BigInt64Array.from(values, BigInt);

    const feeds = {
      input_ids: new Tensor("int64", int64(inputIds), [1, length]),
      attention_mask: new Tensor("int64", int64(attentionMask), [1, length]),
      words_mask: new Tensor("int64", int64(wordsMask), [1, length]),
      text_lengths: new Tensor("int64", int64([words.length]), [1, 1]),
    };

    if (this.mode === SPAN_LEVEL) {
      const { spanIdx, spanMask } = buildSpans(words.length, this.maxWidth);
      feeds.span_idx = new Tensor("int64", int64(spanIdx.flat()), [1, spanIdx.length, 2]);
      feeds.span_mask = new Tensor(
        "bool",
        Uint8Array.from(spanMask, (keep) => (keep ? 1 : 0)),
        [1, spanMask.length],
      );
    }

    const output = await this.session.run(feeds);
    const logits = output[this.session.outputNames[0]].data;

    return this.mode === SPAN_LEVEL
      ? decodeSpanLevel(logits, words, labels, text, this.maxWidth, threshold, flat)
      : decodeTokenLevel(logits, words, labels, text, threshold, flat);
  }
}
