"""Reference Python du pipeline token-classification, sur le MEME fichier ONNX.

Comparer le portage JS a un modele PyTorch different serait sans valeur : le
depot ONNX et le depot PyTorch de ce modele n'ont meme pas le meme nombre de
libelles. optimum charge donc l'export ONNX dans le vrai pipeline HuggingFace,
et les deux cotes executent les memes poids.
"""
import json

from optimum.onnxruntime import ORTModelForTokenClassification
from transformers import AutoTokenizer, pipeline

MODEL = "onnx-community/bert-small-pii-detection-ONNX"
TEXTS = [
    "Jean Dupont habite a Lyon.",
    "Contactez Marie Curie (marie.curie@labo.fr) au 06 11 22 33 44.",
    "Jean-Luc Melenchon, 12 rue de la Paix, tel 06 12 34 56 78.",
    "Zoe Beranger a ecrit a zoe.b@mairie-saint-etienne.fr hier.",
    "Dr. Smith saw John Doe on 2024-03-15 at Mercy Hospital, London.",
    "Ma carte 4111 1111 1111 1111 expire en 2027, IP 192.168.1.42.",
    "",
]
THRESHOLD = 0.5

model = ORTModelForTokenClassification.from_pretrained(MODEL, subfolder="onnx", file_name="model.onnx")
tokenizer = AutoTokenizer.from_pretrained(MODEL)
ner = pipeline(
    "token-classification", model=model, tokenizer=tokenizer,
    aggregation_strategy="first",
)

cases = []
for text in TEXTS:
    ents = ner(text) if text.strip() else []
    cases.append({
        "text": text,
        "entities": [
            {"text": text[e["start"]:e["end"]], "start": int(e["start"]),
             "end": int(e["end"]), "label": e["entity_group"],
             "score": round(float(e["score"]), 6)}
            for e in ents if float(e["score"]) > THRESHOLD
        ],
    })

json.dump({"model": MODEL, "threshold": THRESHOLD, "cases": cases},
          open("../packages/ner-web/test/gold-transformers.json", "w"),
          ensure_ascii=False, indent=1)
for c in cases:
    print(f"--- {c['text'][:50]!r}")
    for e in c["entities"]:
        print(f"    {e['label']:16} {e['text']!r:30} [{e['start']},{e['end']}] {e['score']:.4f}")
