"""Le pipeline PIIGhost tel qu'il tourne dans le navigateur.

Les règles gardent ce qui a une forme fixe, le modèle prend le reste. C'est ce
partage qui rend un petit modèle suffisant : il n'a plus à reconnaître ni un
courriel ni un IBAN, seulement des noms, des lieux et des organisations.
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
