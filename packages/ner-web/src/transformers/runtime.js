/**
 * L'exécuteur générique au-dessus de transformers.js.
 *
 * transformers.js charge le modèle et le tokeniseur, donc toute architecture
 * qu'il gère est utilisable ici sans une ligne de plus. On ne lui emprunte pas
 * son pipeline token-classification, qui ne rend aucune position : on pilote le
 * modèle directement, avec nos propres identifiants encodés mot par mot, et on
 * décode nous-mêmes.
 *
 * La bibliothèque est importée dynamiquement pour qu'elle reste une dépendance
 * facultative : un projet qui n'utilise que GLiNER ne la télécharge pas.
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
   * Charge un modèle de token-classification et son tokeniseur.
   *
   * @param {object} options
   * @param {string} options.model Identifiant sur le Hub, ou chemin local.
   * @param {string} [options.dtype] Quantification, par exemple q8 ou fp16.
   * @param {string} [options.device] wasm, webgpu, cpu selon l'hôte.
   * @param {any} [options.transformers] Le module déjà importé, pour l'injecter.
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

  /** Les libellés que ce modèle sait produire, préfixes BIO retirés. */
  get labels() {
    const names = Object.values(this.idToLabel).map((name) =>
      String(name).replace(/^[BI]-/, ""),
    );
    return [...new Set(names)].filter((name) => name !== "O");
  }

  /**
   * Extrait les entités d'un texte.
   *
   * @param {string} text Le texte à analyser.
   * @param {string[]} [labels] Libellés à garder, tous si la liste est vide.
   * @param {object} [options]
   * @param {number} [options.threshold] Seuil de confiance, dans [0, 1].
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
    // Un modèle de la famille BERT déclare token_type_ids. Une seule séquence
    // est passée, donc des zéros, mais l'omettre laisse l'entrée au hasard de
    // ce que la couche de compatibilité invente.
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
