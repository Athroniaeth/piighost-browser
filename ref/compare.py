"""Compare les candidats taille navigateur au fp32 de reference."""
import json
import sys

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
    print(f"{' ' + tag + ' ':=^74}")
    for text in TEXTS:
        ents = model.predict_entities(text, LABELS, threshold=0.3, flat_ner=True)
        for e in ents:
            print(f"  {e['label']:14} {e['text']!r:32} [{e['start']:>3},{e['end']:>3}] {e['score']:.4f}")
        print("  " + "-" * 62)


which = sys.argv[1]
if which == "edge-q8":
    m = GLiNER.from_pretrained("repo_gliner-pii-edge-v1.0", load_onnx_model=True,
                               load_tokenizer=True, onnx_model_file="model.onnx")
    run(m, "gliner-pii-edge quint8 (44 Mo)")
elif which == "small-q8":
    m = GLiNER.from_pretrained("repo_gliner-pii-small-v1.0", load_onnx_model=True,
                               load_tokenizer=True, onnx_model_file="model.onnx")
    run(m, "gliner-pii-small quint8 (79 Mo)")
elif which == "small-fp32":
    m = GLiNER.from_pretrained("knowledgator/gliner-pii-small-v1.0")
    m.eval()
    run(m, "gliner-pii-small fp32 (327 Mo)")
