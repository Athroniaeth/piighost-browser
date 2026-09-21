"""Reference output of the official Python GLiNER, to compare the JS port against."""
import json
import sys

from gliner import GLiNER

MODEL = "urchade/gliner_multi_pii-v1"
TEXTS = [
    "Bonjour, je suis Jean Dupont, j'habite 12 rue de la Paix à Lyon. "
    "Joignable au 06 12 34 56 78 ou jean.dupont@example.com. "
    "Mon IBAN est FR7630006000011234567890189. "
    "Jean Dupont travaille chez Acme Corporation.",
    "Contactez Marie Curie (marie.curie@labo.fr) au 06 11 22 33 44 a Paris.",
    "Dr. Smith saw patient John Doe on 2024-03-15 at Mercy Hospital, London.",
]
LABELS = ["person", "email address", "phone number", "location", "organization", "iban"]

model = GLiNER.from_pretrained(MODEL)
model.eval()

out = {"model": MODEL, "labels": LABELS, "results": []}
for text in TEXTS:
    ents = model.predict_entities(text, LABELS, threshold=0.0, flat_ner=True)
    out["results"].append(
        {
            "text": text,
            "entities": [
                {
                    "text": e["text"],
                    "start": e["start"],
                    "end": e["end"],
                    "label": e["label"],
                    "score": round(float(e["score"]), 6),
                }
                for e in ents
            ],
        }
    )

with open("gold.json", "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

for r in out["results"]:
    print("=" * 70)
    print(r["text"][:80])
    for e in r["entities"]:
        print(f"  {e['label']:15} {e['text']!r:35} [{e['start']},{e['end']}] {e['score']:.4f}")
