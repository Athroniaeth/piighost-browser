import json
from transformers import AutoTokenizer, pipeline

MODEL = "gravitee-io/bert-small-pii-detection"
TEXT = "Jean-Luc Melenchon, 12 rue de la Paix, tel 06 12 34 56 78."

tok = AutoTokenizer.from_pretrained(MODEL)
enc = tok(TEXT, return_offsets_mapping=True)
print("tokens et offsets vus par Python :")
toks = tok.convert_ids_to_tokens(enc["input_ids"])
for t, (a, b), wid in zip(toks, enc["offset_mapping"], enc.word_ids()):
    print(f"  {str(wid):>4}  {t:<14} [{a},{b}]  {TEXT[a:b]!r}")

ner = pipeline("token-classification", model=MODEL, aggregation_strategy="none")
print("\nlabels bruts :")
for e in ner(TEXT):
    print(f"  {e['entity']:<18} {e['word']!r:14} [{e['start']},{e['end']}] {e['score']:.3f}")
