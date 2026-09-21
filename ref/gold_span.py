"""Reference Python pour un modele GLiNER span-level, pour tester l'autre chemin."""
import json

from gliner import GLiNER

TEXTS = [
    "Bonjour, je suis Jean Dupont, j'habite 12 rue de la Paix à Lyon. "
    "Joignable au 06 12 34 56 78 ou jean.dupont@example.com. "
    "Jean-Luc Mélenchon travaille chez Acme Corporation.",
    "Contactez Marie Curie (marie.curie@labo.fr) au 06 11 22 33 44 a Paris.",
    "Dr. Smith saw patient John Doe at Mercy Hospital, London.",
    "北京 office: contact Li Wei, or call Zoé Béranger.",
]
LABELS = ["person", "email address", "phone number", "location", "organization"]

model = GLiNER.from_pretrained(
    "onnxrepo", load_onnx_model=True, load_tokenizer=True, onnx_model_file="model.onnx"
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
json.dump({"labels": LABELS, "threshold": 0.3, "cases": cases},
          open("../packages/gliner-web/test/gold-span.json", "w"),
          ensure_ascii=False, indent=1)
print(f"{len(cases)} cas, {sum(len(c['entities']) for c in cases)} entites")
