"""Le pipeline PIIGhost tel qu'il tourne dans le navigateur.

Les règles gardent ce qui a une forme fixe, le modèle prend le reste. C'est ce
partage qui rend un petit modèle suffisant : il n'a plus à reconnaître ni un
courriel ni un IBAN, seulement ce qui n'a pas de forme.

Le détecteur qui parle au modèle est le BridgeDetector de piighost, pas une
classe locale : c'est la bibliothèque elle-même qui sait ramener des spans
étrangers sur son modèle de domaine, et qui refuse ceux qui débordent du texte.

Les libellés viennent de l'appelant, parce qu'ils dépendent du modèle chargé :
GLiNER les reçoit en langue naturelle et en accepte n'importe lesquels, un
modèle de token-classification impose les siens.
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
"""Longueur au-delà de laquelle le texte est découpé avant d'aller au modèle.

Un encodeur a une fenêtre de positions finie, 512 tokens pour la famille BERT,
et la dépasser fait échouer l'inférence au lieu de la tronquer. La valeur est
volontairement basse pour couvrir le plus petit des modèles du catalogue. Le
découpage, le recalage des spans et la déduplication viennent de piighost, pas
d'ici : BridgeDetector hérite de BaseNERDetector.
"""

_regex_detector = RegexDetector({**GENERIC_PATTERNS, **FR_PATTERNS})


class _Precomputed:
    """Rejoue des détections déjà calculées, pour ne pas relancer le modèle."""

    def __init__(self, detections: list[Detection]) -> None:
        """Mémorise les détections à resservir."""
        self._detections = list(detections)

    async def detect(self, text: str) -> list[Detection]:
        """Rend les détections telles quelles, sans regarder le texte."""
        return list(self._detections)


def _key(detection: Detection) -> tuple[int, int, str]:
    """Identifie une détection par sa position et son libellé."""
    return (detection.span.start, detection.span.end, detection.label)


async def run(text: str, threshold: float, use_model: bool, labels) -> str:
    """Anonymise un texte et rend le détail de l'analyse en JSON."""
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

    # Une règle et le modèle peuvent trouver le même span : c'est une seule
    # détection à montrer, pas deux lignes identiques. La première provenance
    # rencontrée est gardée, l'ordre d'insertion fait foi.
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
