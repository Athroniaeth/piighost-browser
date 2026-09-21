# How this works in the browser

A detailed walk through what runs, who does what, and which part is piighost
and which part is not.

---

## 1. The starting problem

piighost is a Python library and a browser does not run Python, it runs
JavaScript and WebAssembly. So how does a Python library run in a tab?

In two halves.

1. **Python really does run**, through Pyodide, which is the CPython
   interpreter compiled to WebAssembly. Not a rewrite and not an imitation:
   the real CPython, version 3.14.2, in the page.
2. **But not all of Python runs.** A library that depends on machine code
   compiled for Linux or Windows has nothing to execute here. That covers
   PyTorch, Transformers and tokenizers. None exists for WebAssembly, and for
   most of them there is not even a source to recompile.

piighost falls on the good side: its core depends on nothing but the standard
library. Its **model-backed detectors** fall on the bad side. Everything below
follows from that.

---

## 2. Who does what

```
  ┌────────────────────────────── THE BROWSER TAB ─────────────────────────────┐
  │                                                                            │
  │   MAIN THREAD                      │   WEB WORKER (a second thread)         │
  │   ───────────                      │   ────────────────────────             │
  │                                    │                                        │
  │   ┌─────────────────────┐          │   ┌──────────────────────────────┐     │
  │   │  Svelte interface   │ message  │   │  Pyodide                     │     │
  │   │                     │ ───────► │   │  (CPython 3.14 in WASM)      │     │
  │   │  text, samples,     │          │   │                              │     │
  │   │  highlight, list    │ ◄─────── │   │   ┌──────────────────────┐   │     │
  │   └─────────────────────┘  result  │   │   │  piighost 1.8.0      │   │     │
  │                                    │   │   │  (the PyPI wheel,    │   │     │
  │                                    │   │   │   unmodified)        │   │     │
  │                                    │   │   │                      │   │     │
  │                                    │   │   │  RegexDetector       │   │     │
  │                                    │   │   │  BridgeDetector ─────┼───┼──┐  │
  │                                    │   │   │  OverlapResolver     │   │  │  │
  │                                    │   │   │  EntityLinker        │   │  │  │
  │                                    │   │   │  Anonymizer          │   │  │  │
  │                                    │   │   └──────────────────────┘   │  │  │
  │                                    │   └──────────────────────────────┘  │  │
  │                                    │                                     │  │
  │                                    │   ┌──────────────────────────────┐  │  │
  │                                    │   │  @piighost/ner-web  ◄────────┼──┘  │
  │                                    │   │  ONNX Runtime Web            │     │
  │                                    │   │  the NER model               │     │
  │                                    │   │            (JavaScript)      │     │
  │                                    │   └──────────────────────────────┘     │
  └────────────────────────────────────────────────────────────────────────────┘
```

### So is it only piighost?

No. Four pieces, and **one** of them is piighost.

| Piece | Role | Is it piighost? |
|---|---|---|
| **Pyodide** | Runs Python in the page | No, a third-party project |
| **piighost** | The de-identification pipeline | **Yes**, the PyPI wheel as-is |
| **ONNX Runtime Web** + `@piighost/ner-web` | Runs the NER model | No, our JavaScript, but not the library |
| **Svelte interface** | The page you see | No, this demo |

What matters: **piighost is not imitated, it is executed.** The same code as on
your server. Fix a bug in the overlap resolver tomorrow, republish the wheel,
and the browser gets it.

---

## 3. Splitting the work between rules and model

This is the central idea, and what makes the whole thing viable.

There are two kinds of personal data.

```
  WHAT HAS A FIXED SHAPE                   WHAT HAS NONE
  ──────────────────────                   ─────────────

  jean.dupont@example.com                  Jean Dupont
  06 12 34 56 78                           Lyon
  FR7630006000011234567890189              Acme Corporation
  4111 1111 1111 1111                      12 rue de la Paix
  192.168.1.42

  A regular expression describes           No rule describes them. You need
  them exactly. No model, no               a model that understands the
  milliseconds.                            sentence around them.
```

So:

```
                    "Jean Dupont habite à Lyon, tel 06 12 34 56 78"
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
              ┌──────────────────┐            ┌──────────────────┐
              │  RegexDetector   │            │  BridgeDetector  │
              │  (Python, inside │            │  (Python, but    │
              │   piighost)      │            │   delegates)     │
              │                  │            │                  │
              │  ~1 ms           │            │  ~290 ms         │
              └────────┬─────────┘            └────────┬─────────┘
                       │                               │
              FR_PHONE [30,44]              PERSON [0,11] score 0.72
                                            LOCATION [22,26] score 0.54
```

The model therefore has **only three labels to know**: person, location,
organisation. It never has to recognise an IBAN or an email, since the rules
already have them. That is why an 86 MB model is enough where a generalist
would have to do everything, and weigh ten times as much.

---

## 4. A text's full journey

```
  ①  You click "Anonymize"
      │
      │   postMessage({ type: "run", text })
      ▼
  ②  The worker wakes Python up
      │
      │   await pipeline.run(text, threshold, use_model)
      ▼
  ③  piighost runs its two detectors
      │
      ├──► RegexDetector: scans the text, returns spans            [Python]
      │
      └──► BridgeDetector: calls a JavaScript function             [Python]
                │
                │   await js.nerInfer(text, labels, threshold)
                ▼
           ④  On the JavaScript side
                │   - splits the text into units, with their positions
                │   - builds the model input
                │   - ONNX Runtime computes (WebAssembly, 8 threads)
                │   - decodes the scores into spans
                ▼
                │   [{start: 0, end: 11, label: "person", score: 0.72}, ...]
                │
           ⑤  Back in Python
                │   BridgeDetector checks every span, then builds
                │   Detections whose text is re-read from the source
                ▼
  ⑥  piighost runs the rest of its usual pipeline
      │
      │   overlap resolution ─► entity linking ─► replacement
      ▼
  ⑦  The result goes back to the interface
      │
      │   postMessage({ anonymized, hits, timings })
      ▼
  ⑧  The interface highlights, lists, displays
```

The remarkable part is ③ to ⑤: **Python awaits JavaScript**. That works
because a JavaScript promise becomes an awaitable object in Python under
Pyodide. The `await` is real, not simulated.

---

## 5. What crosses the boundary

Very little, deliberately.

```
   PYTHON                                              JAVASCRIPT
   ──────                                              ──────────

   "Jean Dupont habite à Lyon"     ──── text ────►     (the model computes)
   ["person","location","organization"] ── labels ──►
   0.35                            ─── threshold ─►

                                                       [{start:0, end:11,
   Detection(Span(0,11), "PERSON", 0.72)  ◄── spans ──   label:"person",
                                                         score:0.72}, ...]
```

A sentence of a few kilobytes crosses in **0.2 microseconds**. Inference takes
290 milliseconds. The boundary is a million times cheaper than the computation,
so it is not a performance question.

Two precautions on the way back, because JavaScript is foreign code:

- **A span outside the text is refused**, so no truncated value gets through.
  Slicing at the wrong positions would leave part of a name in clear.
- **The detection's text is re-read from the source**, never taken from what
  JavaScript returned. Only the positions are authoritative.

---

## 6. Why a second thread

Without a worker, the tab freezes for the 290 ms of computation: no scrolling,
no typing, a spinning cursor.

There is a subtler reason. In ordinary Python you hand a blocking computation
to another thread with `asyncio.to_thread`. Under WebAssembly there are no
threads, and that function **does not say so**: it runs anyway, on the calling
thread, and blocks everything. Code that believes it freed itself has not.

```
   WITHOUT A WORKER                     WITH A WORKER

   Main thread                          Main thread        Worker
   │                                    │                   │
   ├─ interface                         ├─ interface        │
   ├─ Python                            │   stays fluid     ├─ Python
   ├─ model ██████ 290 ms               │                   ├─ model ██████
   │   ↑ everything frozen              │                   │
```

The fix is therefore structural: Pyodide and the model both live in the worker,
and the main thread only displays.

---

## 7. What gets downloaded, and once

```
   FIRST VISIT                                  LATER VISITS
   ───────────                                  ────────────

   Pyodide            6.3 MB  ┐                 0 bytes
   ONNX Runtime       3.7 MB  │ ~4 s            everything served
   piighost           0.2 MB  ┘                 from the browser's
   ─────────────────────────                    Cache API
   engine            10.3 MB
   + the model    29 to 662 MB, on demand
```

Once that is loaded, **nothing leaves the machine**. No API call, no telemetry.
The text you paste stays in the tab, the analysis happens on the spot, and if
you cut the network everything keeps working.

That is the difference in kind from a de-identification API: there you have to
send the text you wanted to protect to a server, which is precisely what this
avoids.

---

## 8. What the code actually looks like

Here is everything specific to the browser. The rest is ordinary piighost.

```python
from piighost.components.detector.ner import BridgeDetector
from piighost.components.detector.regex import RegexDetector
from piighost.components.detector.patterns import FR_PATTERNS, GENERIC_PATTERNS
from piighost.components.detector.composite import CompositeDetector
from piighost.pipeline import AnonymizationPipeline
import js

pipeline = AnonymizationPipeline(
    detector=CompositeDetector(
        [
            # Fixed shapes, in Python, no model.
            RegexDetector({**GENERIC_PATTERNS, **FR_PATTERNS}),
            # The rest, delegated to the model running in JavaScript.
            BridgeDetector(
                js.nerInfer,
                {"PERSON": "person", "LOCATION": "location",
                 "ORGANIZATION": "organization"},
                threshold=0.35,
                max_chars=1000,
            ),
        ]
    ),
)

result = await pipeline.anonymize(text)
result.text     # "Bonjour <<PERSON:1>>, tel <<FR_PHONE:1>>"
result.tokens   # {Entity(...): "<<PERSON:1>>", ...}

pipeline.deanonymize(result.text, result.tokens)   # the original text
```

One line differs from server-side use: `BridgeDetector(js.nerInfer, ...)`
instead of `Gliner2PiiDetector()`. Everything else is the same pipeline.

That is the point of the `AnyDetector` port: the pipeline does not know its
second detector lives in another language. It asks for detections and receives
them.

`max_chars` is not decoration. An encoder has a finite position window, and
overflowing it fails the inference rather than truncating it. piighost does the
chunking, the span remapping and the deduplication.

---

## 9. The full cycle, anonymise then restore

```
   Original text
   "Appelle Jean Dupont au 06 12 34 56 78"
            │
            │  pipeline.anonymize()
            ▼
   Anonymised text                          Token table
   "Appelle <<PERSON:1>> au <<FR_PHONE:1>>"  <<PERSON:1>>   → "Jean Dupont"
            │                                <<FR_PHONE:1>> → "06 12 34 56 78"
            │
            ▼
   ┌──────────────────────────────────────────────┐
   │  This is the text you send to an LLM, log,   │
   │  or store. It holds no real value any more.  │
   └──────────────────────────────────────────────┘
            │
            │  pipeline.deanonymize(reply, tokens)
            ▼
   Restored text, real values put back
```

The token table never leaves the tab. It is what makes restoration possible,
and it is what must never be transmitted.

---

## 10. The limits, stated plainly

- **10.3 MB for the engine, plus 29 to 662 MB for a model.** Rules alone need
  no model and already cover emails, phone numbers, IBANs, cards and IPs.
- **The model is small.** 68 million parameters, quantised. Its scores top out
  around 0.77 where a full GLiNER gives 0.99. It makes mistakes, mostly on
  locations.
- **GLiNER 2 is not usable here**, its encoder alone exceeds a gigabyte. The
  browser stays on the previous generation.
- **The Cache API does not survive a reload under WebKit**, so Safari may
  re-download the model on every visit. Not confirmed against a real Safari.
- **iOS is not tested**, and it evicts large caches more readily.
