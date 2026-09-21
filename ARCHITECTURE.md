# Comment ça marche dans le navigateur

Explication détaillée de ce qui tourne, de qui fait quoi, et de ce qui est
piighost et ce qui ne l'est pas.

---

## 1. La question de départ

piighost est une bibliothèque Python. Un navigateur n'exécute pas Python, il
exécute du JavaScript et du WebAssembly. Alors comment une bibliothèque Python
peut-elle tourner dans un onglet ?

Réponse en deux temps :

1. **Python tourne bel et bien**, grâce à Pyodide, qui est l'interpréteur CPython
   compilé en WebAssembly. Ce n'est pas une réécriture ni une imitation : c'est
   le vrai CPython, version 3.14.2, dans la page.
2. **Mais tout Python ne tourne pas.** Une bibliothèque qui dépend de code
   machine compilé pour Linux ou Windows n'a rien à exécuter dans ce contexte.
   C'est le cas de PyTorch, de Transformers, de tokenizers. Aucun n'existe pour
   WebAssembly, et pour la plupart il n'existe même pas de source à recompiler.

piighost tombe du bon côté : son cœur ne dépend que de la bibliothèque standard.
Ses **détecteurs à modèle**, eux, tombent du mauvais côté. D'où toute
l'architecture qui suit.

---

## 2. Qui fait quoi

```
  ┌──────────────────────────── L'ONGLET DU NAVIGATEUR ────────────────────────────┐
  │                                                                                │
  │   THREAD PRINCIPAL                    │   WEB WORKER (un second fil)           │
  │   ─────────────────                   │   ─────────────────────────            │
  │                                       │                                        │
  │   ┌─────────────────────┐             │   ┌──────────────────────────────┐     │
  │   │  Interface Svelte   │  message    │   │  Pyodide                     │     │
  │   │                     │ ──────────► │   │  (CPython 3.14 en WASM)      │     │
  │   │  texte, exemples,   │             │   │                              │     │
  │   │  surlignage, liste  │ ◄────────── │   │   ┌──────────────────────┐   │     │
  │   └─────────────────────┘  résultat   │   │   │  piighost 1.8.0      │   │     │
  │                                       │   │   │  (la roue PyPI,      │   │     │
  │                                       │   │   │   non modifiée)      │   │     │
  │                                       │   │   │                      │   │     │
  │                                       │   │   │  RegexDetector       │   │     │
  │                                       │   │   │  BridgeDetector ─────┼───┼──┐  │
  │                                       │   │   │  OverlapResolver     │   │  │  │
  │                                       │   │   │  EntityLinker        │   │  │  │
  │                                       │   │   │  Anonymizer          │   │  │  │
  │                                       │   │   └──────────────────────┘   │  │  │
  │                                       │   └──────────────────────────────┘  │  │
  │                                       │                                     │  │
  │                                       │   ┌──────────────────────────────┐  │  │
  │                                       │   │  @piighost/gliner-web  ◄─────┼──┘  │
  │                                       │   │  ONNX Runtime Web            │     │
  │                                       │   │  modèle GLiNER (83 Mo)       │     │
  │                                       │   │            (JavaScript)      │     │
  │                                       │   └──────────────────────────────┘     │
  └────────────────────────────────────────────────────────────────────────────────┘
```

### Alors, on n'utilise que piighost ?

Non. Quatre briques, dont **une seule** est piighost.

| Brique | Rôle | Est-ce piighost ? |
|---|---|---|
| **Pyodide** | Fait tourner Python dans la page | Non, projet tiers |
| **piighost** | Le pipeline de dé-identification | **Oui**, la roue PyPI telle quelle |
| **ONNX Runtime Web** + `@piighost/gliner-web` | Fait tourner le modèle NER | Non, c'est du JavaScript à nous, mais pas la bibliothèque |
| **Interface Svelte** | La page que tu vois | Non, c'est cette démo |

Ce qui compte : **piighost n'est pas imité, il est exécuté.** Le même code que
sur ton serveur. Si demain tu corriges un bug dans le résolveur de recouvrement,
tu republies la roue et le navigateur en profite.

---

## 3. Le partage du travail entre les règles et le modèle

C'est l'idée centrale, et c'est ce qui rend l'ensemble viable.

Il y a deux sortes de données personnelles.

```
  CE QUI A UNE FORME FIXE                  CE QUI N'EN A PAS
  ───────────────────────                  ─────────────────

  jean.dupont@example.com                  Jean Dupont
  06 12 34 56 78                           Lyon
  FR7630006000011234567890189              Acme Corporation
  4111 1111 1111 1111                      12 rue de la Paix
  192.168.1.42

  Une expression régulière                 Aucune règle ne les décrit.
  les décrit exactement.                   Il faut un modèle qui comprenne
  Zéro modèle, zéro milliseconde.          la phrase autour.
```

Donc :

```
                    "Jean Dupont habite à Lyon, tel 06 12 34 56 78"
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
              ┌──────────────────┐            ┌──────────────────┐
              │  RegexDetector   │            │  BridgeDetector  │
              │  (Python, dans   │            │  (Python, mais   │
              │   piighost)      │            │   délègue au JS) │
              │                  │            │                  │
              │  ~1 ms           │            │  ~290 ms         │
              └────────┬─────────┘            └────────┬─────────┘
                       │                               │
              FR_PHONE [30,44]              PERSON [0,11] score 0.72
                                            LOCATION [22,26] score 0.54
```

Le modèle n'a donc **que trois libellés à connaître** : personne, lieu,
organisation. Il n'a jamais à reconnaître un IBAN ni un courriel, puisque les
règles les ont déjà. C'est pour cela qu'un modèle de 79 Mo suffit là où un
modèle généraliste devrait tout savoir faire, et peser dix fois plus.

---

## 4. Le trajet complet d'un texte

```
  ①  Tu cliques sur « Anonymiser »
      │
      │   postMessage({ type: "run", text })
      ▼
  ②  Le Worker réveille Python
      │
      │   await pipeline.run(text, seuil, avec_modèle)
      ▼
  ③  piighost lance ses deux détecteurs
      │
      ├──► RegexDetector : balaye le texte, rend des spans           [Python]
      │
      └──► BridgeDetector : appelle une fonction JavaScript          [Python]
                │
                │   await js.glinerInfer(texte, libellés, seuil)
                ▼
           ④  Côté JavaScript
                │   - découpe le texte en mots, avec leurs positions
                │   - construit l'entrée du modèle
                │   - ONNX Runtime calcule (WebAssembly, 8 threads)
                │   - décode les scores en spans
                ▼
                │   [{start: 0, end: 11, label: "person", score: 0.72}, ...]
                │
           ⑤  Retour en Python
                │   BridgeDetector vérifie chaque span, puis construit
                │   des Detection avec le texte relu depuis la source
                ▼
  ⑥  piighost enchaîne le reste de son pipeline habituel
      │
      │   résolution des recouvrements ─► liaison en entités ─► remplacement
      ▼
  ⑦  Le résultat repart vers l'interface
      │
      │   postMessage({ anonymized, hits, timings })
      ▼
  ⑧  L'interface surligne, liste, affiche
```

Le point remarquable est l'étape ③ à ⑤ : **Python attend du JavaScript**.
C'est possible parce qu'une promesse JavaScript devient un objet attendable en
Python sous Pyodide. Le `await` est réel, pas simulé.

---

## 5. Ce qui traverse la frontière

Très peu de choses, et c'est voulu.

```
   PYTHON                                              JAVASCRIPT
   ──────                                              ──────────

   "Jean Dupont habite à Lyon"     ──── texte ────►    (le modèle calcule)
   ["person","location","organization"] ─ libellés ─►
   0.35                            ──── seuil ────►

                                                       [{start:0, end:11,
   Detection(Span(0,11), "PERSON", 0.72)  ◄─ spans ──    label:"person",
                                                         score:0.72}, ...]
```

Une phrase de quelques kilo-octets traverse en **0,2 microseconde**. L'inférence
dure 290 millisecondes. Autrement dit le passage de frontière est un million de
fois moins cher que le calcul : ce n'est pas un sujet de performance.

Deux précautions au retour, parce que le JavaScript est du code étranger :

- **Un span hors du texte est refusé**, il ne laisse pas passer une valeur
  tronquée. Découper aux mauvaises positions laisserait une partie du nom en
  clair.
- **Le texte de la détection est relu depuis la source**, jamais repris de ce que
  le JavaScript a renvoyé. Seules les positions font foi.

---

## 6. Pourquoi un second fil d'exécution

Sans Worker, l'onglet se fige pendant les 290 ms de calcul : plus de défilement,
plus de saisie, le curseur qui tourne.

Il y a une raison plus sournoise. En Python normal, on confie un calcul bloquant
à un autre thread avec `asyncio.to_thread`. Sous WebAssembly il n'y a pas de
threads, et cette fonction **ne le dit pas** : elle exécute quand même, sur le
fil appelant, et bloque tout. Un code qui croit s'être libéré ne l'est pas.

```
   SANS WORKER                          AVEC WORKER
   ───────────                          ───────────

   Thread principal                     Thread principal    Worker
   │                                    │                   │
   ├─ interface                         ├─ interface        │
   ├─ Python                            │   reste fluide    ├─ Python
   ├─ modèle ██████ 290 ms              │                   ├─ modèle ██████
   │   ↑ tout est gelé                  │                   │
```

La solution est donc structurelle : Pyodide et le modèle vivent tous les deux
dans le Worker, et le thread principal ne fait que de l'affichage.

---

## 7. Ce qui est téléchargé, et une seule fois

```
   PREMIÈRE VISITE                              VISITES SUIVANTES
   ───────────────                              ─────────────────

   Pyodide            6,3 Mo  ┐                 0 octet
   ONNX Runtime       3,7 Mo  │ ~8 s            tout est servi
   piighost           0,2 Mo  │                 depuis la Cache API
   tokeniseur         0,7 Mo  │                 du navigateur
   modèle GLiNER     59,5 Mo  ┘
   ─────────────────────────
   total             70,4 Mo
```

Une fois cela chargé, **plus rien ne sort de la machine**. Pas d'appel d'API,
pas de télémétrie. Le texte que tu colles reste dans l'onglet, l'analyse est
faite sur place, et si tu coupes le réseau tout continue de fonctionner.

C'est la différence de nature avec une API de dé-identification : là il faut
envoyer le texte à protéger à un serveur, ce qui est précisément ce qu'on
cherchait à éviter.

---

## 8. Concrètement, à quoi ressemble le code

Voici tout ce qui est propre au navigateur. Le reste est du piighost ordinaire.

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
            # Les formes fixes, en Python, sans modèle.
            RegexDetector({**GENERIC_PATTERNS, **FR_PATTERNS}),
            # Le reste, délégué au modèle qui tourne en JavaScript.
            BridgeDetector(
                js.glinerInfer,
                {"PERSON": "person", "LOCATION": "location",
                 "ORGANIZATION": "organization"},
                threshold=0.35,
            ),
        ]
    ),
)

result = await pipeline.anonymize(texte)
result.text     # "Bonjour <<PERSON:1>>, tel <<FR_PHONE:1>>"
result.tokens   # {Entity(...): "<<PERSON:1>>", ...}

pipeline.deanonymize(result.text, result.tokens)   # le texte d'origine
```

Une seule ligne diffère d'un usage serveur : `BridgeDetector(js.glinerInfer, ...)`
au lieu de `Gliner2PiiDetector()`. Tout le reste du pipeline est identique.

Et c'est bien là l'intérêt du port `AnyDetector` : le pipeline ne sait pas que
son second détecteur habite dans un autre langage. Il lui demande des
détections, il en reçoit.

---

## 9. Et le cycle complet, anonymiser puis restaurer

```
   Texte d'origine
   "Appelle Jean Dupont au 06 12 34 56 78"
            │
            │  pipeline.anonymize()
            ▼
   Texte anonymisé                          Table des jetons
   "Appelle <<PERSON:1>> au <<FR_PHONE:1>>"  <<PERSON:1>>   → "Jean Dupont"
            │                                <<FR_PHONE:1>> → "06 12 34 56 78"
            │
            ▼
   ┌──────────────────────────────────────────────┐
   │  C'est ce texte-là qu'on envoie à un LLM,    │
   │  qu'on journalise, ou qu'on stocke.          │
   │  Il ne contient plus aucune valeur réelle.   │
   └──────────────────────────────────────────────┘
            │
            │  pipeline.deanonymize(réponse, jetons)
            ▼
   Texte restauré, valeurs réelles remises en place
```

La table des jetons ne quitte jamais l'onglet. C'est elle qui permet la
restauration, et c'est elle qu'il ne faut jamais transmettre.

---

## 10. Les limites, dites clairement

- **Première visite à 70 Mo.** Sans modèle, en règles seules, l'ensemble tombe à
  6,6 Mo et couvre déjà courriels, téléphones, IBAN, cartes et IP.
- **Le modèle est petit.** 68 millions de paramètres, quantifié. Ses scores
  plafonnent vers 0,77 là où un GLiNER complet donne 0,99. Il se trompe, surtout
  sur les lieux.
- **GLiNER 2 n'est pas utilisable ici**, son encodeur seul dépasse le gigaoctet.
  Le navigateur reste sur la génération précédente.
- **Safari et iOS ne sont pas testés**, et iOS évince plus volontiers les
  gros caches.
