# piighost-browser

piighost running entirely in the browser, NER model included. No data leaves
the machine.

Live at **https://piighost-wasm.athroniaeth.cloud/**

## What runs

```
browser
├── Pyodide 314.0.7 (CPython 3.14.2 / wasm32)
│   └── piighost 1.8.0, the PyPI wheel, installed by micropip, unmodified
│       └── BridgeDetector ────┐  shipped by piighost
└── ONNX Runtime Web 1.30      │
    └── @piighost/ner-web ─────┘  returns character spans
```

The split is the point. piighost's rules keep everything with a fixed shape,
an email, a phone number, an IBAN, a card, an IP. The model only takes the
unstructured part, people, places and organisations. That is what makes an
86 MB model enough where a generalist would have to recognise everything.

## Measured

Chromium 153, 16 logical cores, no GPU.

```
Bonjour, je suis <<PERSON:1>>, j'habite <<LOCATION:1>> à <<LOCATION:2>>.
Joignable au <<FR_PHONE:1>> ou <<EMAIL:1>>. Mon IBAN est <<FR_IBAN:1>>.
<<PERSON:2>> travaille chez <<ORGANIZATION:1>>.

  <<PERSON:1>>        <- PERSON        'Jean Dupont'
  <<LOCATION:1>>      <- LOCATION      '12 rue de la Paix'
  <<LOCATION:2>>      <- LOCATION      'Lyon'
  <<FR_PHONE:1>>      <- FR_PHONE      '06 12 34 56 78'
  <<EMAIL:1>>         <- EMAIL         'jean.dupont@example.com'
  <<PERSON:2>>        <- PERSON        'Jean-Luc Mélenchon'
  <<ORGANIZATION:1>>  <- ORGANIZATION  'Acme Corporation'

ROUND TRIP EXACT: True
```

| Step | Duration |
|---|---|
| Engine ready, no model | 4.3 s |
| Model fetched from the Hub and session created | 3.8 s |
| GLiNER inference, 214 characters, 3 labels | see below |
| Full anonymisation, rules and model | 173 ms |

Thread scaling, same text:

| Threads | Median |
|---|---|
| 1, which is also the case without cross-origin isolation | 321 ms |
| 2 | 196 ms |
| 4 | 153 ms |
| 8 | 116 ms |

Without `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, ONNX
Runtime silently falls back to a single thread. This model stays usable there,
unlike the 349 MB multilingual one which went from 876 to 235 ms. Cross-origin
isolation is therefore an optimisation rather than a prerequisite, which leaves
embedding in a third-party page open.

## Model catalogue

The interface fetches the model from the Hub on demand rather than bundling it,
so you can try one the catalogue does not know by naming its repository, its
engine and its ONNX file.

| Repository | Engine | Size | Quantisation |
|---|---|---|---|
| `knowledgator/gliner-pii-edge-v1.0` | gliner | 49 MB | quint8 |
| `knowledgator/gliner-pii-small-v1.0` | gliner | 86 MB | quint8 |
| `onnx-community/gliner_small-v2.1` | gliner | 192 MB | uint8 |
| `knowledgator/gliner-pii-base-v1.0` | gliner | 205 MB | quint8 |
| `onnx-community/gliner_medium-v2.1` | gliner | 264 MB | uint8 |
| `onnx-community/gliner_multi_pii-v1` | gliner | 365 MB | uint8 |
| `knowledgator/gliner-pii-large-v1.0` | gliner | 657 MB | quint8 |
| `onnx-community/gliner_large-v2.1` | gliner | 662 MB | uint8 |
| `onnx-community/bert-small-pii-detection-ONNX` | transformers | 29 MB | uint8 |
| `Xenova/bert-base-NER` | transformers | 110 MB | quantized |
| `onnx-community/multilang-pii-ner-ONNX` | transformers | 296 MB | uint8 |
| `onnx-community/piiranha-v1-detect-personal-information-ONNX` | transformers | 334 MB | uint8 |

`tools/build-catalog.py` regenerates this list from the Hub. Sizes are measured
rather than copied, and a repository whose files are missing does not get in.

Fetching cross-origin from the Hub stays compatible with cross-origin
isolation, so the eight threads are kept. Verified in the browser: HuggingFace
reflects the `Origin` header, and a request in CORS mode satisfies
`COEP: require-corp` without needing `Cross-Origin-Resource-Policy`.

## First-visit budget

| Artefact | gzip |
|---|---|
| Pyodide, wasm, stdlib and glue | 6.32 MB |
| micropip and the piighost wheel | 0.27 MB |
| ONNX Runtime Web 1.30, CPU only | 3.69 MB |
| `@huggingface/tokenizers` and `@piighost/ner-web` | 0.02 MB |
| **Total, no model** | **10.3 MB** |

The model adds to that, 29 to 662 MB depending on which one you load. The rules
work without loading any, and already cover emails, phone numbers, IBANs, cards
and IPs.

Everything is cached by the Cache API under a versioned name, models included,
so switching model does not throw the previous one away and a second visit
re-downloads nothing.

## Picking a model

Compared against the reference Python GLiNER on the same texts.

| Model | Size | PERSON | LOCATION | ORG | Spans |
|---|---|---|---|---|---|
| `gliner_multi_pii-v1` fp32 | 1157 MB | 1.00 | — | 1.00 | exact |
| `gliner_multi_pii-v1` uint8 | 349 MB | 0.45 | — | 0.42 | phone and email lost |
| `gliner-pii-edge` quint8 | 44 MB | 0.61 | 0.49 | 0.74 | email truncated |
| **`gliner-pii-small` quint8** | **79 MB** | **0.72** | **0.54** | **0.76** | **exact** |

`gliner-pii-small` is the only browser-sized candidate that takes the
quantisation without breaking its spans. The multilingual model loses the phone
number and the email in uint8, which for a de-identification tool is the worst
way to fail. The `edge` model truncates the email, so it leaks part of it.

Threshold in use: **0.35**. This model's scores top out far lower than an
unquantised GLiNER, and 0.5 would detect almost nothing.

## Two engines, one contract

`@piighost/ner-web` exposes two interchangeable runners. Both return
`{text, start, end, label, score}`, the shape `BridgeDetector` consumes, so the
Python pipeline does not know which one is running.

| Engine | For | Built on |
|---|---|---|
| `GlinerWeb` | GLiNER 1 models, labels named at call time | ONNX Runtime Web, `@huggingface/tokenizers` |
| `TransformersNer` | any token-classification model transformers.js can load | `@huggingface/transformers` |

`TransformersNer` is model-agnostic: transformers.js handles the architecture
and this package adds only what it is missing. What it is missing happens to be
exactly what a span-based tool needs.

### The gap TransformersNer fills

The `token-classification` pipeline in transformers.js returns **no character
offsets**. `start` and `end` are a two-year-old `// TODO`, and its tokenizer has
no `return_offsets_mapping`. Its output looks like
`{entity_group: "EMAIL_ADDRESS", word: "jean. dupont @ example. com"}`, a
detokenised string that cannot be located in the source.

Rather than gluing sub-tokens back together, which breaks on accents and
out-of-vocabulary characters, the runner splits the text with the **model's own
pre-tokenizer**, aligns each piece onto the source by scanning forward, then
encodes piece by piece. The resulting ids are identical to encoding the whole
text, verified, and every sub-token is traced back to its unit.

Granularity matters. For a BERT model the pre-tokenizer returns `Jean`, `-`,
`Luc` where a word split would return `Jean-Luc`, and grouping at the wrong
granularity shifts the spans.

## Why a hand-written GLiNER runner

`gliner` on npm, GLiNER.js, is the only published browser path for GLiNER. It
was not reused, for three verified defects:

1. **Wrong token-level logits layout.** The graph emits
   `[batch, words, classes, 3]` and GLiNER.js reads
   `[3, batch, words, classes]`. It raises nothing and returns incoherent
   scores. On the `edge` model, "Dupont" came out as `organization` at 0.03.
2. **ASCII word splitting.** Its pattern uses `\w`, which in JavaScript means
   `[A-Za-z0-9_]` while in Python it is Unicode. "Mélenchon" became three
   words, which changes the model's input on any accented text.
3. **Frozen dependencies** on `@xenova/transformers` 2.17.2 and
   `onnxruntime-web` 1.19.2, both over a year old. Its ORT breaks when bundled,
   which rules out multi-threading, and its tokenizer rejects `tokenizer.json`
   files in the current merges format.

The hand-written runner is 216 lines excluding comments and reproduces the
reference decoder.

## Parity with Python

`packages/ner-web/test/parity.mjs` compares the JavaScript output against the
official Python GLiNER on the same ONNX file. The set covers accented French, a
hyphenated name, an email on a sub-domain, CJK, the empty string and a
whitespace-only string.

Both GLiNER architectures are covered, on two different tokenizer families,
because getting the output layout wrong raises nothing and only produces
incoherent scores.

```
gold.json       | 10 cases,  29 entities, max deviation 4.90e-07
  GLiNER token-level, BPE tokenizer (ettin-encoder-68m)
gold-span.json  |  4 cases,   8 entities, max deviation 4.79e-07
  GLiNER span-level, Unigram tokenizer (mdeberta-v3-base)
gold-long.json  |  3 cases, 128 entities, max deviation 5.10e-07
  texts from 231 to 1600 characters
transformers    |  7 cases,  19 entities, max deviation 5.00e-07
  BIO token classification, BERT pre-tokenizer
PARITY OK
```

`test/window.mjs` covers separately what parity cannot see: a text longer than
the model's window must not lose its tail. Failing is acceptable, the caller
then chunks, and reading to the end is acceptable too. Succeeding on a prefix
alone is not, since the values at the end would stay in clear with nothing to
signal it. The marker is an entity placed at the last character. On 14 229
characters GLiNER reads to the end and the transformers engine refuses.

That case was missing, and the defect reached production before anyone saw it.

One trap met along the way, and it holds for any model: **a model's ONNX export
is not the model**. For `bert-small-pii-detection` the PyTorch repository
declares 51 labels and the `onnx-community` export declares 49, and their
outputs have nothing in common. Comparing the JavaScript port against PyTorch
produced eight divergences that did not exist. The reference must run on the
exact ONNX file the browser loads, which is what `ref/gold_transformers.py`
does through optimum.

Spans are compared strictly, since a one-character drift is a potential leak.
Only the scores tolerate a numerical deviation.

Switching model means pointing the catalogue at it and running these tests
against the new model's Python output. Parity says the decoding is faithful, it
does not say the model is good. Quality is measured separately.

## Layout

```
packages/ner-web/        two NER runners, one output contract
  src/splitter.js        word splitting with offsets, Unicode correct
  src/gliner/            GLiNER 1, token-level and span-level
    processor.js         prompt, word-by-word encoding, words_mask, spans
    decoder.js           both architectures, greedy selection
    runtime.js           ONNX session, architecture detection, extract()
  src/transformers/      any token-classification model
    encoder.js           pre-tokenizer units, aligned onto the source
    decoder.js           BIO aggregation, first strategy, mean score
    runtime.js           drives the model directly, not its pipeline
  test/parity.mjs                 GLiNER regression against Python
  test/parity-transformers.mjs    BIO regression against Python
  test/window.mjs                 the model window must not drop the tail
app/                     the public interface, Svelte 5, Vite, Tailwind v4
  src/lib/worker.ts      the engine: ONNX, Pyodide, piighost, weight cache
  src/lib/engine.svelte.ts  the worker client, on the main thread
  src/lib/models.ts      the catalogue and the label maps
  src/App.svelte         the page, the design system's workshop grammar
  public/py/pipeline.py  the piighost pipeline that consumes the bridge
  Dockerfile, nginx.conf, redeploy.sh
demo/                    the original prototype, no interface
  web/index.html         assembly and raw measurements
ref/                     the reference Python environment, gliner and CPU torch
tools/build-catalog.py   regenerates the catalogue from the Hub
```

## Reproducing

```bash
cd ref && uv sync && uv run python make_gold.py       # Python reference
cd ../packages/ner-web && npm install
node test/parity.mjs                                   # parity against Python
node test/window.mjs                                   # model window

cd ../../app && npm install && npm run build
node serve-dist.mjs &                                  # cross-origin isolated
node drive-prod2.mjs
```

Weights are not versioned. The parity suites need a local copy of the reference
model:

```bash
curl -L -o ref/repo_gliner-pii-small-v1.0/model.onnx \
  https://huggingface.co/knowledgator/gliner-pii-small-v1.0/resolve/main/onnx/model_quint8.onnx
```

## Deployment

nginx behind Coolify's Traefik, on the `coolify` network. The `piighost-wasm`
container is not managed by Coolify, it is started by hand. To republish after
a change:

```bash
cd app && ./redeploy.sh
```

### Two infrastructure details that cost time

- **`.mjs` is not in nginx's MIME table.** Served as
  `application/octet-stream`, and with `X-Content-Type-Options: nosniff` the
  browser refuses to execute it as a module. Pyodide and ONNX Runtime's
  threaded worker are both `.mjs`, so the engine hung on "ONNX session" with
  nothing in the console. The Dockerfile extends the table.
- **A `types` block inside a `server` replaces the inherited table**, it does
  not extend it. The first deployment served `index.html` as
  `application/octet-stream`. `default_type` is enough for `.onnx` and `.whl`.

## Why Pyodide lives in a worker

Under Emscripten, `asyncio.to_thread` does not raise even though there are no
threads. It runs the callable on the calling thread and blocks the event loop
for its whole duration, so Pyodide on the main thread freezes the interface as
soon as a detector works. The worker is structural, not a comfort.

## Browsers

| Engine | Isolation | Threads | GLiNER | transformers | Cache across visits |
|---|---|---|---|---|---|
| Chromium 153 | yes | 8 | yes | yes | yes |
| WebKit 26.6, Safari 26 | yes | 8 | yes | yes | **no** |

WebKit passes on everything else: `crossOriginIsolated`, `SharedArrayBuffer`,
module workers, Pyodide, ONNX Runtime in WebAssembly, identical rendering.
Timings are in the same range, 237 ms for GLiNER and 143 ms for transformers.

Two reservations.

**The cache does not survive a reload under WebKit.** Measured: four entries
right after loading, zero after a reload, while `navigator.storage` still
reports 86 MB of usage against a one-gigabyte quota. The model is therefore
re-downloaded on every visit. Whether a real Safari behaves the same, or
whether this belongs to Playwright's ephemeral context, has not been checked.

**iOS is not tested**, and that is where the quotas bite hardest.

### Running the WebKit tests

Playwright does not validate Ubuntu 25.04 for WebKit, which wants `libicu74`
while the distribution ships `libicu76`. The binaries work once the library
sits beside them:

```bash
npx playwright install webkit
sudo "$(command -v node)" node_modules/playwright-core/cli.js install-deps webkit  # fails on libicu74, harmlessly
curl -sL -o /tmp/icu.deb http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu74_74.2-1ubuntu3_amd64.deb
dpkg-deb -x /tmp/icu.deb /tmp/icu74
cp /tmp/icu74/usr/lib/x86_64-linux-gnu/libicu*.so.74* ~/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib/

PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node drive-webkit.mjs
```

## Releasing @piighost/ner-web

Publishing goes through npm trusted publishing, so no token is stored anywhere.
The workflow filename is part of the configuration on npmjs.com, so renaming
`.github/workflows/publish-ner-web.yml` breaks it.

```bash
cd packages/ner-web && npm version minor --no-git-tag-version
cd ../.. && git commit -am "release(ner-web): x.y.z"
git tag ner-web-vx.y.z && git push && git push --tags
```

## Left to do

- **Understand the WebKit cache**, and check it against a real Safari.
- **iOS**, not tested.
