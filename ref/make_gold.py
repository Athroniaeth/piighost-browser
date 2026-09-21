"""Generate the Python reference for the JavaScript port's parity test."""
import json

from gliner import GLiNER

TEXTS = [
    "Bonjour, je suis Jean Dupont, j'habite 12 rue de la Paix à Lyon. "
    "Joignable au 06 12 34 56 78 ou jean.dupont@example.com. "
    "Mon IBAN est FR7630006000011234567890189. "
    "Jean Dupont travaille chez Acme Corporation.",
    "Contactez Marie Curie (marie.curie@labo.fr) au 06 11 22 33 44 a Paris.",
    "Dr. Smith saw patient John Doe on 2024-03-15 at Mercy Hospital, London.",
    "Jean-Luc Mélenchon et Ségolène Royal ont dîné à l'Élysée avec M. Müller.",
    "Envoyez le dossier à zoé.déjà@mairie-saint-étienne.fr avant vendredi.",
    "北京 office: contact Li Wei at li.wei@example.cn, or call +86 10 1234 5678.",
    "",
    "   ",
    "Acme",
    "L'entreprise Œuvres Réunies SA, sise 3 place de l'Étoile, 75008 Paris, "
    "represente par Mme Anne-Sophie Lefèvre-Durand, joignable au +33 1 42 68 53 00.",
]
LABELS = ["person", "email address", "phone number", "location", "organization", "iban"]

model = GLiNER.from_pretrained(
    "repo_gliner-pii-small-v1.0", load_onnx_model=True, load_tokenizer=True,
    onnx_model_file="model.onnx",
)

gold = []
for text in TEXTS:
    ents = model.predict_entities(text, LABELS, threshold=0.3, flat_ner=True) if text.strip() else []
    gold.append({
        "text": text,
        "entities": [
            {"text": e["text"], "start": e["start"], "end": e["end"],
             "label": e["label"], "score": round(float(e["score"]), 6)}
            for e in ents
        ],
    })

json.dump({"labels": LABELS, "threshold": 0.3, "cases": gold},
          open("../packages/gliner-web/test/gold.json", "w"), ensure_ascii=False, indent=1)
print(f"{len(gold)} cas, {sum(len(c['entities']) for c in gold)} entites")
