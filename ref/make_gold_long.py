"""Reference Python sur des textes longs, le trou du jeu de parite initial.

Un encodeur a une fenetre de positions finie et la depasser fait echouer
l'inference. Le jeu court ne montait pas assez haut pour l'atteindre, donc le
portage JS a pu partir en production avec ce defaut.
"""
import json

from gliner import GLiNER

UNIT = (
    "Jean Dupont habite au 12 rue de la Paix a Lyon, joignable au 06 12 34 56 78. "
)
TEXTS = [
    UNIT * 3,
    UNIT * 8 + "La derniere cliente est Marie Curie, a Paris.",
    UNIT * 20 + "Le dossier est suivi par Zoe Beranger chez Acme Corporation.",
]
LABELS = ["person", "email address", "phone number", "location", "organization", "iban"]

model = GLiNER.from_pretrained(
    "repo_gliner-pii-small-v1.0", load_onnx_model=True, load_tokenizer=True,
    onnx_model_file="model.onnx",
)

cases = []
for text in TEXTS:
    ents = model.predict_entities(text, LABELS, threshold=0.3, flat_ner=True)
    cases.append({
        "text": text,
        "entities": [
            {"text": e["text"], "start": e["start"], "end": e["end"],
             "label": e["label"], "score": round(float(e["score"]), 6)}
            for e in ents
        ],
    })
    print(f"  {len(text):>5} caracteres -> {len(ents)} entites")

json.dump({"labels": LABELS, "threshold": 0.3, "cases": cases},
          open("../packages/ner-web/test/gold-long.json", "w"),
          ensure_ascii=False, indent=1)
