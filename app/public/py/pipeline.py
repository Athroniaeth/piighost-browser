"""The piighost pipeline as it runs in the browser.

The rules keep what has a fixed shape and the model takes the rest. That split
is what makes a small model enough: it no longer has to recognise an email or
an IBAN, only what has no shape at all.

The detector that talks to the model is piighost's BridgeDetector, not a local
class. The library itself knows how to map foreign spans onto its domain model,
and refuses the ones that run past the end of the text.

The labels come from the caller, because they depend on the model loaded.
GLiNER takes them in natural language and accepts any of them, while a
token-classification model imposes its own.
"""

import json
import time

import js

from piighost.components.anonymizer.span import Anonymizer
from piighost.components.detector.ner import BridgeDetector
from piighost.components.detector.patterns import FR_PATTERNS, GENERIC_PATTERNS
from piighost.components.detector.regex import RegexDetector
from piighost.components.placeholder.label_counter import LabelCounterPlaceholderFactory
from piighost.models import Detection
from piighost.pipeline import AnonymizationPipeline

MAX_CHARS = 1000
"""Length above which the text is chunked before reaching the model.

An encoder has a finite position window, 512 tokens for the BERT family, and
overflowing it fails the inference rather than truncating it. The value is
deliberately low so it covers the smallest model in the catalogue. The
chunking, the span remapping and the deduplication all come from piighost:
BridgeDetector extends BaseNERDetector.
"""

_regex_detector = RegexDetector({**GENERIC_PATTERNS, **FR_PATTERNS})


class _Precomputed:
    """Replay detections already computed, so the model runs once."""

    def __init__(self, detections: list[Detection]) -> None:
        """Keep the detections to serve again."""
        self._detections = list(detections)

    async def detect(self, text: str) -> list[Detection]:
        """Return the detections as they are, without looking at the text."""
        return list(self._detections)


def _key(detection: Detection) -> tuple[int, int, str]:
    """Identify a detection by its position and its label."""
    return (detection.span.start, detection.span.end, detection.label)


async def run(text: str, threshold: float, use_model: bool, labels) -> str:
    """Anonymise a text and return the analysis as JSON."""
    started = time.perf_counter()
    regex_hits = await _regex_detector.detect(text)
    rules_ms = (time.perf_counter() - started) * 1000

    model_hits: list[Detection] = []
    model_ms = 0.0
    if use_model:
        mapping = labels.to_py() if hasattr(labels, "to_py") else dict(labels)
        detector = BridgeDetector(
            js.nerInfer,
            mapping,
            threshold=threshold,
            max_chars=MAX_CHARS,
        )
        started = time.perf_counter()
        model_hits = await detector.detect(text)
        model_ms = (time.perf_counter() - started) * 1000

    origin: dict[tuple[int, int, str], str] = {}
    for detection in regex_hits:
        origin.setdefault(_key(detection), "regex")
    for detection in model_hits:
        origin.setdefault(_key(detection), "model")

    pipeline = AnonymizationPipeline(
        detector=_Precomputed(regex_hits + model_hits),
        anonymizer=Anonymizer(LabelCounterPlaceholderFactory()),
    )

    started = time.perf_counter()
    result = await pipeline.anonymize(text)
    pipeline_ms = (time.perf_counter() - started) * 1000

    kept = {
        _key(detection) for entity in result.tokens for detection in entity.detections
    }

    # A rule and the model can find the same span. That is one detection to
    # show, not two identical rows. The first origin seen wins, and insertion
    # order is authoritative.
    unique: dict[tuple[int, int, str], Detection] = {}
    for detection in sorted(regex_hits + model_hits, key=_key):
        unique.setdefault(_key(detection), detection)

    hits = []
    for key, detection in unique.items():
        hits.append(
            {
                "start": detection.span.start,
                "end": detection.span.end,
                "label": detection.label,
                "text": detection.text,
                "score": round(detection.confidence, 4),
                "detector": origin[key],
                "kept": key in kept,
                "pattern": None,
            }
        )

    tokens = [
        {"token": token, "label": entity.label, "text": entity.text}
        for entity, token in result.tokens.items()
    ]

    return json.dumps(
        {
            "anonymized": result.text,
            "restored": pipeline.deanonymize(result.text, result.tokens),
            "hits": hits,
            "tokens": tokens,
            "timings": {
                "rules": round(rules_ms, 1),
                "model": round(model_ms, 1),
                "pipeline": round(pipeline_ms, 1),
            },
        },
        ensure_ascii=False,
    )
