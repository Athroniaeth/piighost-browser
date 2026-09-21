"""The same uint8 ONNX file, decoded by the official Python GLiNER."""
import json

from gliner import GLiNER

TEXT = (
    "Bonjour, je suis Jean Dupont, j'habite 12 rue de la Paix à Lyon. "
    "Joignable au 06 12 34 56 78 ou jean.dupont@example.com. "
    "Mon IBAN est FR7630006000011234567890189. "
    "Jean Dupont travaille chez Acme Corporation."
)
LABELS = ["person", "email address", "phone number", "location", "organization", "iban"]

model = GLiNER.from_pretrained(
    "onnxrepo", load_onnx_model=True, load_tokenizer=True, onnx_model_file="model.onnx"
)
ents = model.predict_entities(TEXT, LABELS, threshold=0.3, flat_ner=True)
print(f"{'ONNX uint8 via decodeur Python':=^70}")
for e in ents:
    print(f"  {e['label']:15} {e['text']!r:32} [{e['start']},{e['end']}] {e['score']:.4f}")
json.dump(
    [{k: (round(float(v), 6) if k == "score" else v) for k, v in e.items()} for e in ents],
    open("onnx_uint8.json", "w"),
    ensure_ascii=False,
    indent=1,
)
