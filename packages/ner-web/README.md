# @piighost/ner-web

Browser NER runners that return character spans, ready for
[piighost](https://github.com/Athroniaeth/piighost)'s `BridgeDetector`.

Two interchangeable engines, one output shape. Both return
`{text, start, end, label, score}` with offsets into the text you passed in,
which is what a span-based de-identification pipeline needs and what the
published browser NER stacks do not give you.

```bash
npm install @piighost/ner-web onnxruntime-web
```

## GLiNER

Runs a GLiNER 1 model, token-level or span-level, detected from the graph.
Labels are named at call time.

```js
import * as ort from "onnxruntime-web/wasm";
import { GlinerWeb } from "@piighost/ner-web/gliner";

const gliner = await GlinerWeb.load({
  model: new Uint8Array(weights),   // onnx/model_quint8.onnx
  tokenizerJson,                    // tokenizer.json
  tokenizerConfig,                  // tokenizer_config.json
  ort,
});

await gliner.extract("Jean Dupont lives in Lyon.", ["person", "location"], {
  threshold: 0.35,
});
// [{ text: "Jean Dupont", start: 0, end: 11, label: "person", score: 0.72 }, ...]
```

The published JavaScript port of GLiNER was not reused. It reads token-level
logits as `[3, batch, words, classes]` where the graph emits
`[batch, words, classes, 3]`, and it splits words on JavaScript's `\w`, which is
ASCII, so "Mélenchon" becomes three words. Neither mistake raises, both just
return wrong spans.

## Token classification

Runs any token-classification model `transformers.js` can load. The library
handles the architecture, this package adds the part it is missing.

```js
import { TransformersNer } from "@piighost/ner-web/transformers";

const ner = await TransformersNer.load({
  model: "onnx-community/bert-small-pii-detection-ONNX",
  dtype: "q8",
});

await ner.extract(text, [], { threshold: 0.5 });
```

`transformers.js` returns no character offsets: `start` and `end` on its
`token-classification` pipeline are a two-year-old TODO, and its tokenizer has
no `return_offsets_mapping`. Rather than gluing sub-tokens back together, which
breaks on accents and out-of-vocabulary characters, this runner splits the text
with the model's own pre-tokenizer, aligns each piece onto the source, and
encodes piece by piece. The resulting ids are identical to encoding the whole
text, and every sub-token is traced back to its unit.

## Correctness

Both engines are checked against the reference Python decoder running the same
ONNX file. Spans are compared strictly, since a one-character drift is a leaked
value, and scores agree to 5e-7 across GLiNER token-level, GLiNER span-level,
long texts and BIO token classification.

A model window that overflows must not lose the tail of the text silently.
Failing is fine, the caller then chunks, and `BridgeDetector` does that with
`max_chars`.

MIT.
