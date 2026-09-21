# piighost-browser

PIIGhost qui tourne entièrement dans le navigateur, modèle NER compris. Aucune
donnée ne quitte la machine.

État : prototype validé de bout en bout dans Chromium. La veille qui a conduit
à cette architecture est dans `../piighost-wasm-veille/RAPPORT.md`.

## Ce qui tourne

```
navigateur
├── Pyodide 314.0.7 (CPython 3.14.2 / wasm32)
│   └── piighost 1.8.0, roue PyPI, installée par micropip, non modifiée
│       └── BridgeDetector ────┐  fourni par piighost
└── ONNX Runtime Web 1.30      │
    └── @piighost/ner-web ─────┘  GLiNER, rend des spans caractère
```

Le partage est le point clé : les règles de PIIGhost gardent tout ce qui a une
forme fixe (courriel, téléphone, IBAN, carte, IP), le modèle ne traite que le
non structuré (personne, lieu, organisation). C'est ce qui rend un modèle de
79 Mo suffisant, là où un modèle généraliste devrait tout reconnaître.

## Résultat mesuré

Chromium 153, 16 cœurs logiques, pas de GPU, actifs servis en local.

```
Bonjour, je suis <<PERSON:1>>, j'habite <<LOCATION:1>> à <<LOCATION:2>>.
Joignable au <<FR_PHONE:1>> ou <<EMAIL:1>>. Mon IBAN est <<FR_IBAN:1>>.
<<PERSON:2>> travaille chez <<ORGANIZATION:1>>.

  <<PERSON:1>>        <- PERSON        'Jean Dupont'
  <<LOCATION:1>>      <- LOCATION      '12 rue de la Paix'
  <<LOCATION:2>>      <- LOCATION      'Lyon'
  <<FR_PHONE:1>>      <- FR_PHONE      '06 12 34 56 78'
  <<EMAIL:1>>         <- EMAIL         'jean.dupont@example.com'
  <<FR_IBAN:1>>       <- FR_IBAN       'FR7630006000011234567890189'
  <<PERSON:2>>        <- PERSON        'Jean-Luc Mélenchon'
  <<ORGANIZATION:1>>  <- ORGANIZATION  'Acme Corporation'

ALLER-RETOUR EXACT : True
```

| Étape | Durée |
|---|---|
| Session ONNX | 1 684 ms |
| Démarrage Pyodide | 3 249 ms |
| Installation piighost par micropip | 1 084 ms |
| Inférence GLiNER, 214 caractères, 3 libellés | voir ci-dessous |
| Anonymisation complète de bout en bout | 173 ms |

Montée en threads, même texte :

| Threads | Médiane |
|---|---|
| 1 (et cas sans isolation d'origine) | 321 ms |
| 2 | 196 ms |
| 4 | 153 ms |
| 8 | 116 ms |

Sans les en-têtes `Cross-Origin-Opener-Policy` et
`Cross-Origin-Embedder-Policy`, ONNX Runtime retombe silencieusement à un seul
thread. Contrairement au modèle multilingue de 349 Mo, qui passait de 876 à
235 ms, ce modèle reste utilisable dans ce cas. L'isolation d'origine devient
une optimisation et non un prérequis, ce qui autorise l'intégration dans une
page tierce.

## Catalogue de modèles

L'interface charge le modèle à la demande depuis le Hub, il n'est pas
empaqueté. On peut donc en essayer un que le catalogue ne connaît pas, en
saisissant son dépôt, son moteur et son fichier ONNX.

| Dépôt | Moteur | Taille | Quantification |
|---|---|---|---|
| `knowledgator/gliner-pii-edge-v1.0` | gliner | 49 Mo | quint8 |
| `knowledgator/gliner-pii-small-v1.0` | gliner | 86 Mo | quint8 |
| `onnx-community/gliner_small-v2.1` | gliner | 192 Mo | uint8 |
| `knowledgator/gliner-pii-base-v1.0` | gliner | 205 Mo | quint8 |
| `onnx-community/gliner_medium-v2.1` | gliner | 264 Mo | uint8 |
| `onnx-community/gliner_multi_pii-v1` | gliner | 365 Mo | uint8 |
| `knowledgator/gliner-pii-large-v1.0` | gliner | 657 Mo | quint8 |
| `onnx-community/gliner_large-v2.1` | gliner | 662 Mo | uint8 |
| `onnx-community/bert-small-pii-detection-ONNX` | transformers | 29 Mo | uint8 |
| `Xenova/bert-base-NER` | transformers | 110 Mo | quantized |
| `onnx-community/multilang-pii-ner-ONNX` | transformers | 296 Mo | uint8 |
| `onnx-community/piiranha-v1-detect-personal-information-ONNX` | transformers | 334 Mo | uint8 |

`tools/build-catalog.py` régénère cette liste en interrogeant le Hub : les
tailles sont mesurées, et un dépôt dont les fichiers manquent n'y entre pas.

Charger depuis le Hub en cross-origin reste compatible avec l'isolation
d'origine, donc les huit threads sont conservés. Vérifié dans le navigateur :
HuggingFace reflète l'en-tête `Origin`, et une requête en mode CORS satisfait
`COEP: require-corp` sans avoir besoin de `Cross-Origin-Resource-Policy`.

## Budget de première visite

| Artefact | gzip |
|---|---|
| Pyodide (wasm, stdlib, glue) | 6,32 Mo |
| micropip et roue piighost | 0,27 Mo |
| ONNX Runtime Web 1.30, CPU seul | 3,69 Mo |
| `@huggingface/tokenizers` et `@piighost/ner-web` | 0,02 Mo |
| `tokenizer.json` | 0,66 Mo |
| **Total, sans modèle** | **10,3 Mo** |

Le modèle s'ajoute par-dessus, selon celui qu'on charge, de 29 à 662 Mo. Les
règles seules fonctionnent sans en charger aucun, et couvrent déjà courriels,
téléphones, IBAN, cartes et IP.

Tout est mis en cache par la Cache API sous un nom versionné, modèles compris :
changer de modèle ne jette pas le précédent, et la seconde visite ne
retélécharge rien.

## Choix du modèle

Comparaison contre le GLiNER Python de référence, sur les mêmes textes.

| Modèle | Taille | PERSON | LOCATION | ORG | Spans |
|---|---|---|---|---|---|
| `gliner_multi_pii-v1` fp32 | 1 157 Mo | 1,00 | — | 1,00 | exacts |
| `gliner_multi_pii-v1` uint8 | 349 Mo | 0,45 | — | 0,42 | téléphone et courriel perdus |
| `gliner-pii-edge` quint8 | 44 Mo | 0,61 | 0,49 | 0,74 | courriel tronqué |
| **`gliner-pii-small` quint8** | **79 Mo** | **0,72** | **0,54** | **0,76** | **exacts** |

`gliner-pii-small` est le seul candidat de taille navigateur qui encaisse la
quantification sans casser les spans. Le modèle multilingue perd le téléphone
et le courriel en uint8, ce qui, pour un outil de dé-identification, est la
pire façon d'échouer. Le modèle `edge` tronque le courriel, c'est-à-dire qu'il
en laisse fuir une partie.

Seuil retenu : **0,35**. Les scores de ce modèle plafonnent bien plus bas que
ceux d'un GLiNER non quantifié, un seuil de 0,5 ne détecterait presque rien.

## Deux moteurs, un seul contrat

`@piighost/ner-web` expose deux exécuteurs interchangeables. Tous deux rendent
`{text, start, end, label, score}`, la forme que `BridgeDetector` consomme, donc
le pipeline Python ne sait pas lequel tourne.

| Moteur | Pour | Socle |
|---|---|---|
| `GlinerWeb` | les modèles GLiNER 1, libellés nommés à l'exécution | ONNX Runtime Web, `@huggingface/tokenizers` |
| `TransformersNer` | tout modèle de token-classification que transformers.js sait charger | `@huggingface/transformers` |

`TransformersNer` est agnostique du modèle : transformers.js charge
l'architecture, on n'ajoute que ce qui lui manque. Et ce qui lui manque est
précisément ce dont un outil à spans a besoin.

### Le trou que TransformersNer bouche

Le pipeline `token-classification` de transformers.js ne rend **aucun décalage
caractère** : `start` et `end` sont un `// TODO` ouvert depuis deux ans, et le
tokeniseur n'accepte pas `return_offsets_mapping`. Sa sortie ressemble à
`{entity_group: "EMAIL_ADDRESS", word: "jean. dupont @ example. com"}`, un texte
détokenisé qu'on ne peut pas resituer dans la source.

Plutôt que de recoller les sous-tokens à l'aveugle, ce qui casse sur les accents
et les caractères hors vocabulaire, l'exécuteur découpe le texte avec le
**pré-tokeniseur déclaré par le modèle**, aligne chaque morceau sur la source
par balayage, puis encode morceau par morceau. Les identifiants obtenus sont
identiques à ceux de l'encodage du texte entier, vérifié, et l'on sait en prime
quel sous-token appartient à quelle unité.

Le grain compte : pour un modèle BERT, le pré-tokeniseur rend `Jean`, `-`, `Luc`
là où un découpage par mots rendrait `Jean-Luc`. Grouper au mauvais grain décale
les spans.

## Pourquoi un exécuteur GLiNER maison

`gliner` sur npm (GLiNER.js) est la seule voie navigateur publiée pour GLiNER.
Elle n'a pas été retenue, pour trois défauts vérifiés :

1. **Mauvaise disposition des logits en token-level.** Le graphe sort
   `[batch, mots, classes, 3]`, GLiNER.js lit `[3, batch, mots, classes]`. Il
   ne lève aucune erreur, il rend des scores incohérents. Sur le modèle
   `edge`, « Dupont » ressortait en `organization` à 0,03.
2. **Découpage des mots en ASCII.** Son motif utilise `\w`, qui en JavaScript
   vaut `[A-Za-z0-9_]` alors qu'en Python il est Unicode. « Mélenchon »
   devenait trois mots, ce qui change l'entrée du modèle sur tout texte
   accentué.
3. **Dépendances figées** sur `@xenova/transformers` 2.17.2 et
   `onnxruntime-web` 1.19.2, publiées il y a plus d'un an. Son ORT casse au
   bundling, ce qui interdit le multithread, et son tokeniseur refuse les
   fichiers `tokenizer.json` au format de fusions récent.

L'exécuteur GLiNER maison fait 216 lignes hors commentaires et reproduit le
décodeur de référence.

## Parité avec Python

`packages/gliner-web/test/parity.mjs` compare la sortie JS à celle du GLiNER
Python officiel sur le même fichier ONNX. Le jeu couvre le français accentué,
un nom composé, une adresse courriel à sous-domaine, du CJK, la chaîne vide et
une chaîne d'espaces.

Les deux architectures GLiNER sont couvertes, sur deux familles de tokeniseur
différentes, parce que se tromper de disposition de sortie ne lève aucune erreur
et ne produit que des scores incohérents.

```
repo_gliner-pii-small-v1.0 | 10 cas, 29 entités, écart max 4,90e-07
  GLiNER token-level, tokeniseur BPE (ettin-encoder-68m)
onnxrepo | 4 cas, 8 entités, écart max 4,79e-07
  GLiNER span-level, tokeniseur Unigram (mdeberta-v3-base)
transformers | 7 cas, 19 entités, écart max 5,00e-07
  token-classification BIO, pré-tokeniseur BERT
PARITÉ OK
```

Un piège rencontré en route, qui vaut pour tout modèle : **l'export ONNX d'un
modèle n'est pas le modèle**. Pour `bert-small-pii-detection`, le dépôt PyTorch
déclare 51 libellés et l'export `onnx-community` en déclare 49, et leurs sorties
n'ont rien à voir. Comparer le portage JS au PyTorch donnait huit divergences
qui n'existaient pas : la référence doit tourner sur le fichier ONNX exact que
le navigateur charge, ce que fait `ref/gold_transformers.py` via optimum.

Changer de modèle, c'est remplacer les trois fichiers de `app/public/model/`,
puis relancer ce test contre la sortie Python du nouveau modèle. La parité dit
que le décodage est fidèle, pas que le modèle est bon : la qualité se mesure à
part.

Les spans sont comparés strictement : une divergence d'un caractère est une
fuite potentielle. Seuls les scores tolèrent un écart numérique.

## Arborescence

```
packages/ner-web/        deux exécuteurs NER, un seul contrat de sortie
  src/splitter.js        découpage en mots avec décalages, Unicode correct
  src/gliner/            GLiNER 1, token-level et span-level
    processor.js         invite, encodage mot par mot, words_mask, spans
    decoder.js           décodage des deux architectures, sélection gloutonne
    runtime.js           session ONNX, détection d'architecture, extract()
  src/transformers/      tout modèle de token-classification
    encoder.js           unités du pré-tokeniseur, alignées sur la source
    decoder.js           agrégation BIO, stratégie first, score moyen
    runtime.js           pilotage direct du modèle, sans son pipeline
  test/parity.mjs                 non-régression GLiNER contre Python
  test/parity-transformers.mjs    non-régression BIO contre Python
app/                     l'interface publique, Svelte 5 + Vite + Tailwind v4
  src/lib/worker.ts      le moteur : ONNX, Pyodide, piighost, cache des poids
  src/lib/engine.svelte.ts  le client du worker, côté thread principal
  src/App.svelte         la page, grammaire « workshop » du système de design
  public/py/pipeline.py  le pipeline PIIGhost qui le consomme
  Dockerfile, nginx.conf, redeploy.sh
demo/                    le prototype d'origine, sans interface
  web/index.html         assemblage et mesures brutes
ref/                     environnement Python de référence (gliner + torch CPU)
```

## Reproduire

```bash
cd ref && uv sync && uv run python make_gold.py      # référence Python
cd ../packages/gliner-web && npm install
node test/parity.mjs                                  # parité JS contre Python

cd ../../demo && npm install
COI=1 node serve.mjs &                                # avec isolation d'origine
node drive.mjs "http://localhost:8765/index.html?threads=8"
```

Les poids ne sont pas versionnés. Récupérer
`knowledgator/gliner-pii-small-v1.0` :

```bash
curl -L -o demo/web/model/model.onnx \
  https://huggingface.co/knowledgator/gliner-pii-small-v1.0/resolve/main/onnx/model_quint8.onnx
```

## En ligne

**https://piighost-wasm.athroniaeth.cloud/**

Interface de test : choix d'un exemple ou texte libre, entités surlignées dans
le texte, liste des détections avec leur libellé, leur provenance (`regex` ou
score du modèle) et celles écartées avec la raison. Bascule français/anglais et
clair/sombre.

Servie par nginx derrière le Traefik de Coolify, sur le réseau `coolify`.
Le conteneur `piighost-wasm` n'est pas géré par Coolify, il est lancé à la main.
Pour republier après un changement :

```bash
cd app && ./redeploy.sh
```

Première visite mesurée depuis le poste de test : **8,4 s**, tout téléchargé,
isolation d'origine active, 8 threads.

### Deux détails d'infrastructure qui coûtent cher

- **`.mjs` n'est pas dans la table MIME de nginx.** Servi en
  `application/octet-stream`, et avec `X-Content-Type-Options: nosniff` le
  navigateur refuse de l'exécuter comme module. Pyodide et le worker threadé
  d'ONNX Runtime étant tous deux des `.mjs`, le moteur restait bloqué sur
  « session ONNX » sans la moindre erreur en console. Le Dockerfile étend la
  table.
- **Un bloc `types` dans un `server` remplace la table héritée**, il ne
  l'étend pas. Le premier déploiement servait `index.html` en
  `application/octet-stream`. `default_type` suffit pour `.onnx` et `.whl`.

## Ce qui a été corrigé

- **Pyodide et ONNX vivent dans un Web Worker.** Ce n'est pas un confort :
  sous Emscripten `asyncio.to_thread` ne lève pas d'erreur mais s'exécute sur
  le thread appelant et bloque la boucle, donc sur le thread principal
  l'interface gèle dès qu'un détecteur travaille.
- **Les poids sont mis en cache par la Cache API**, sous un nom versionné
  (`piighost-wasm-v1`). Vérifié au navigateur : la seconde visite fait
  **zéro requête réseau** pour les 83 Mo du modèle. Le cache couvre aussi le
  tokeniseur et la roue piighost.

## Navigateurs

| Moteur | Isolation | Threads | GLiNER | transformers | Cache entre visites |
|---|---|---|---|---|---|
| Chromium 153 | oui | 8 | oui | oui | oui |
| WebKit 26.6 (Safari 26) | oui | 8 | oui | oui | **non** |

WebKit passe sur tout le reste : `crossOriginIsolated`, `SharedArrayBuffer`,
worker de type module, Pyodide, ONNX Runtime en WebAssembly, rendu identique.
Les temps sont du même ordre, 237 ms pour GLiNER et 143 ms pour transformers.

Deux réserves.

**Le cache ne survit pas au rechargement sous WebKit.** Mesuré : quatre entrées
juste après le chargement, zéro après un `reload`, alors que `navigator.storage`
continue d'annoncer 86 Mo d'usage sur un quota d'un gigaoctet. Le modèle est
donc retéléchargé à chaque visite. Reste à savoir si un Safari réel se comporte
pareil ou si c'est propre au contexte éphémère de Playwright, ce qui n'a pas été
vérifié.

**iOS n'est pas testé**, et c'est là que les quotas mordent le plus.

### Lancer les tests WebKit

Playwright ne valide pas Ubuntu 25.04 pour WebKit, qui réclame `libicu74`
quand la distribution fournit `libicu76`. Les binaires fonctionnent une fois
la bibliothèque déposée à côté :

```bash
npx playwright install webkit
sudo "$(command -v node)" node_modules/playwright-core/cli.js install-deps webkit  # échoue sur libicu74, sans gravité
curl -sL -o /tmp/icu.deb http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu74_74.2-1ubuntu3_amd64.deb
dpkg-deb -x /tmp/icu.deb /tmp/icu74
cp /tmp/icu74/usr/lib/x86_64-linux-gnu/libicu*.so.74* ~/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib/

PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node drive-webkit.mjs
```

## Reste à faire

- **Élargir le jeu de parité**, notamment sur les textes longs et le
  découpage en morceaux.
- **Comprendre le cache WebKit**, et vérifier sur un Safari réel.
- **iOS**, non testé.
- **Remonter `JsBridgeDetector` dans piighost** comme
  `components/detector/bridge.py`, avec son modèle de configuration.
- **Corriger `_run_blocking`** sous Emscripten, et basculer `hub.py` sur
  `pyodide.http.pyfetch`.
