"""gliner-pii-edge: the fp32 reference against its 46 MB quint8 export."""
import json

from gliner import GLiNER

TEXTS = [
    "Bonjour, je suis Jean Dupont, j'habite 12 rue de la Paix à Lyon. "
    "Joignable au 06 12 34 56 78 ou jean.dupont@example.com. "
    "Mon IBAN est FR7630006000011234567890189. "
    "Jean Dupont travaille chez Acme Corporation.",
    "Contactez Marie Curie (marie.curie@labo.fr) au 06 11 22 33 44 a Paris.",
]
LABELS = ["person", "email address", "phone number", "location", "organization", "iban"]


def run(model, tag):
    print(f"{' ' + tag + ' ':=^72}")
    rows = []
    for text in TEXTS:
        ents = model.predict_entities(text, LABELS, threshold=0.3, flat_ner=True)
        for e in ents:
            print(f"  {e['label']:15} {e['text']!r:32} [{e['start']},{e['end']}] {e['score']:.4f}")
            rows.append({k: (round(float(v), 6) if k == "score" else v) for k, v in e.items()})
        print("  " + "-" * 60)
    return rows


fp32 = GLiNER.from_pretrained("knowledgator/gliner-pii-edge-v1.0")
fp32.eval()
gold = run(fp32, "gliner-pii-edge fp32 (181 Mo)")
json.dump(gold, open("edge_fp32.json", "w"), ensure_ascii=False, indent=1)
