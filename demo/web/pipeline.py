"""The piighost pipeline as it runs in the browser.

The rules keep what has a fixed shape and the model takes the rest. That split
is what makes a small model enough: it no longer has to recognise an email or
an IBAN, only names, places and organisations.

This is the original prototype, kept for raw measurements. The interface in
app/ supersedes it.
"""

import js
import time

from piighost.components.anonymizer.span import Anonymizer
from piighost.components.detector.composite import CompositeDetector
from piighost.components.detector.patterns import FR_PATTERNS, GENERIC_PATTERNS
from piighost.components.detector.regex import RegexDetector
from piighost.components.placeholder.label_counter import LabelCounterPlaceholderFactory
from piighost.components.detector.ner import BridgeDetector
from piighost.pipeline import AnonymizationPipeline


MODEL_LABELS = {
    "PERSON": "person",
    "LOCATION": "location",
    "ORGANIZATION": "organization",
}

pipeline = AnonymizationPipeline(
    detector=CompositeDetector(
        [
            RegexDetector({**GENERIC_PATTERNS, **FR_PATTERNS}),
            BridgeDetector(js.glinerInfer, MODEL_LABELS, threshold=0.35),
        ]
    ),
    anonymizer=Anonymizer(LabelCounterPlaceholderFactory()),
)

start = time.perf_counter()
result = await pipeline.anonymize(TEXT)
elapsed = (time.perf_counter() - start) * 1000

lines = [f"ANONYMISÉ ({elapsed:.0f} ms de bout en bout)", "", result.text, "", "JETONS"]
for entity, token in result.tokens.items():
    lines.append(f"  {token:22} <- {entity.label:14} {entity.text!r}")
lines.append("")
lines.append(f"ALLER-RETOUR EXACT : {pipeline.deanonymize(result.text, result.tokens) == TEXT}")
chr(10).join(lines)
