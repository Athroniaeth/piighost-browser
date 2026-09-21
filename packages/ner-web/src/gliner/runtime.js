/**
 * L'exécuteur : assemble tokeniseur, processeur, session ONNX et décodeur.
 *
 * ONNX Runtime est injecté plutôt qu'importé, pour que l'appelant choisisse sa
 * variante de build. Empaqueter ORT dans un bundle applicatif casse son chemin
 * de création des workers, donc il doit venir de sa propre distribution.
 */

import { Tokenizer } from "@huggingface/tokenizers";

import { decodeSpanLevel, decodeTokenLevel } from "./decoder.js";
import { buildSpans, encode, measureSpecialTokens } from "./processor.js";

const TOKEN_LEVEL = "token_level";
const SPAN_LEVEL = "span_level";

/**
 * Détecte l'architecture à partir des entrées réellement déclarées par le graphe.
 *
 * La configuration du dépôt annonce un `span_mode`, mais c'est le graphe qui
 * fait foi : un modèle span-level réclame `span_idx`, un token-level non.
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
   * Charge un modèle et son tokeniseur.
   *
   * @param {object} options
   * @param {ArrayBuffer|Uint8Array|string} options.model Poids ONNX, ou leur URL.
   * @param {object} options.tokenizerJson Contenu de tokenizer.json.
   * @param {object} options.tokenizerConfig Contenu de tokenizer_config.json.
   * @param {any} options.ort Le module onnxruntime-web à utiliser.
   * @param {number} [options.maxWidth] Largeur maximale d'un span, en mots.
   * @param {object} [options.sessionOptions] Options passées à la session ONNX.
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
   * Extrait les entités d'un texte.
   *
   * @param {string} text Le texte à analyser.
   * @param {string[]} labels Les libellés interrogés.
   * @param {object} [options]
   * @param {number} [options.threshold] Seuil de confiance, dans [0, 1].
   * @param {boolean} [options.flat] Interdire tout recouvrement entre entités.
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
