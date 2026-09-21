"""Construit le catalogue de modeles a partir du Hub, tailles reelles comprises.

Ecrire les tailles a la main, c'est les voir diverger. Le script interroge
l'API, verifie que les fichiers annonces existent vraiment, et refuse une
entree incomplete plutot que de la laisser casser dans l'interface.
"""

import json
import sys
import urllib.request

CANDIDATES = [
    # (id, moteur, fichier ONNX prefere, ordre de repli)
    ("knowledgator/gliner-pii-edge-v1.0", "gliner", ["onnx/model_quint8.onnx"]),
    ("knowledgator/gliner-pii-small-v1.0", "gliner", ["onnx/model_quint8.onnx"]),
    ("knowledgator/gliner-pii-base-v1.0", "gliner", ["onnx/model_quint8.onnx"]),
    ("knowledgator/gliner-pii-large-v1.0", "gliner", ["onnx/model_quint8.onnx"]),
    ("onnx-community/gliner_small-v2.1", "gliner", ["onnx/model_uint8.onnx"]),
    ("onnx-community/gliner_medium-v2.1", "gliner", ["onnx/model_uint8.onnx"]),
    ("onnx-community/gliner_multi_pii-v1", "gliner", ["onnx/model_uint8.onnx"]),
    ("onnx-community/gliner_large-v2.1", "gliner", ["onnx/model_uint8.onnx"]),
    ("onnx-community/bert-small-pii-detection-ONNX", "transformers", ["onnx/model_uint8.onnx"]),
    ("onnx-community/multilang-pii-ner-ONNX", "transformers", ["onnx/model_uint8.onnx"]),
    ("onnx-community/piiranha-v1-detect-personal-information-ONNX", "transformers", ["onnx/model_uint8.onnx"]),
    ("Xenova/bert-base-NER", "transformers", ["onnx/model_quantized.onnx"]),
    ("protectai/lakshyakh93-deberta_finetuned_pii-onnx", "transformers", ["onnx/model.onnx"]),
]

# transformers.js ne nomme pas les fichiers, il les deduit d'un dtype. La
# correspondance est celle de sa table de suffixes.
DTYPE_JS = {
    "onnx/model_uint8.onnx": "uint8",
    "onnx/model_quint8.onnx": "uint8",
    "onnx/model_quantized.onnx": "q8",
    "onnx/model_int8.onnx": "int8",
    "onnx/model.onnx": "fp32",
}

DTYPE_OF = {
    "onnx/model_uint8.onnx": "uint8",
    "onnx/model_quint8.onnx": "quint8",
    "onnx/model_quantized.onnx": "quantized",
    "onnx/model_int8.onnx": "int8",
    "onnx/model.onnx": "fp32",
}


def fetch_json(url: str) -> dict:
    """Lit une reponse JSON de l'API du Hub."""
    with urllib.request.urlopen(url, timeout=30) as answer:  # noqa: S310
        return json.load(answer)


def build() -> list[dict]:
    """Rend une entree par modele reellement utilisable."""
    entries = []
    for model_id, engine, preferred in CANDIDATES:
        try:
            info = fetch_json(f"https://huggingface.co/api/models/{model_id}?blobs=true")
        except Exception as exc:  # noqa: BLE001
            print(f"  ignore {model_id}: {exc}", file=sys.stderr)
            continue

        sizes = {f["rfilename"]: f.get("size") or 0 for f in info.get("siblings", [])}
        weights = next((name for name in preferred if sizes.get(name)), None)
        if weights is None:
            print(f"  ignore {model_id}: aucun poids parmi {preferred}", file=sys.stderr)
            continue

        required = ["tokenizer.json", "tokenizer_config.json"]
        if engine == "gliner":
            required.append("gliner_config.json")
        else:
            required.append("config.json")
        missing = [name for name in required if name not in sizes]
        if missing:
            print(f"  ignore {model_id}: manque {missing}", file=sys.stderr)
            continue

        extra = sum(sizes.get(name, 0) for name in required)
        entry = {
            "id": model_id,
            "engine": engine,
            "weights": weights,
            "dtype": DTYPE_OF.get(weights, "?"),
            "megabytes": round((sizes[weights] + extra) / 1e6),
        }
        if engine == "transformers":
            entry["dtypeJs"] = DTYPE_JS.get(weights, "q8")
        if engine == "gliner":
            config = fetch_json(
                f"https://huggingface.co/{model_id}/resolve/main/gliner_config.json"
            )
            entry["maxWidth"] = config.get("max_width", 12)
            entry["spanMode"] = config.get("span_mode", "?")
        entries.append(entry)
        print(f"  {model_id:58} {entry['megabytes']:>5} Mo  {engine}", file=sys.stderr)
    return entries


if __name__ == "__main__":
    catalog = build()
    catalog.sort(key=lambda entry: (entry["engine"], entry["megabytes"]))
    with open("app/src/lib/catalog.json", "w") as handle:
        json.dump(catalog, handle, ensure_ascii=False, indent=1)
    print(f"\n{len(catalog)} modeles retenus", file=sys.stderr)
