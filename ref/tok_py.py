import json
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("repo_gliner-pii-small-v1.0")
words = ["<<ENT>>", "person", "<<SEP>>", "Bonjour", "Jean", "Dupont", "Mélenchon", "jean.dupont@example.com", "北京"]
out = {w: {"ids": tok.encode(w), "tokens": tok.convert_ids_to_tokens(tok.encode(w))} for w in words}
json.dump(out, open("tok_py.json", "w"), ensure_ascii=False)
for w, v in out.items():
    print(f"{w!r:26} {v['ids']}")
