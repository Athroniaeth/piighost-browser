/**
 * Le moteur, dans un Web Worker.
 *
 * Tout ce qui est lourd vit ici : la session ONNX, Pyodide et piighost. Deux
 * raisons, et la seconde n'est pas négociable.
 *
 * L'inférence dure des centaines de millisecondes et gèlerait la page. Surtout,
 * sous Emscripten asyncio.to_thread ne lève pas d'erreur mais s'exécute sur le
 * thread appelant et bloque la boucle d'événements, donc Pyodide sur le thread
 * principal fige l'interface dès qu'un détecteur travaille.
 *
 * Les modèles sont tirés du Hub à la demande, pas empaquetés : c'est ce qui
 * permet d'en essayer un que le catalogue ne connaît pas. La Cache API les
 * garde sous leur URL, donc changer de modèle ne jette pas le précédent.
 */

import * as ort from "onnxruntime-web/wasm";

import * as transformers from "@huggingface/transformers";

import { GlinerWeb } from "@piighost/ner-web/gliner";
import { TransformersNer } from "@piighost/ner-web/transformers";

const CACHE = "piighost-wasm-v3";
const HUB = "https://huggingface.co";
const WHEEL = "/piighost-1.8.0-py3-none-any.whl";

export type ModelChoice = {
  id: string;
  engine: "gliner" | "transformers";
  weights: string;
  dtypeJs?: string;
  maxWidth?: number;
};

export type Hit = {
  start: number;
  end: number;
  label: string;
  text: string;
  score: number;
  detector: string;
  kept: boolean;
  pattern: string | null;
};

export type Analysis = {
  anonymized: string;
  restored: string;
  hits: Hit[];
  tokens: { token: string; label: string; text: string }[];
  timings: { rules: number; model: number; pipeline: number };
};

type Span = { start: number; end: number; label: string; score: number };

type Runner = {
  labels?: string[];
  extract(
    text: string,
    labels: string[],
    options: { threshold: number },
  ): Promise<Span[]>;
};

let runner: Runner | null = null;
let pyRun:
  | ((
      text: string,
      threshold: number,
      useModel: boolean,
      labels: unknown,
    ) => Promise<string>)
  | null = null;

const post = (message: unknown) => (self as unknown as Worker).postMessage(message);
const progress = (step: string, done: number, total: number) =>
  post({ type: "progress", step, done, total });

/**
 * Récupère une ressource en passant par la Cache API.
 *
 * Un octet déjà téléchargé ne l'est pas deux fois, y compris entre deux
 * sessions et entre deux modèles. La progression est remontée quand le serveur
 * annonce une taille.
 */
async function cachedFetch(url: string, step: string): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) {
    progress(step, 1, 1);
    return hit;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.split("/").pop()} : HTTP ${response.status}`);
  }

  const total = Number(response.headers.get("content-length") ?? 0);
  if (total > 0 && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let done = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      done += chunk.value.byteLength;
      progress(step, done, total);
    }
    const copy = new Response(new Blob(chunks as BlobPart[]), {
      headers: response.headers,
    });
    await cachePut(cache, url, copy.clone());
    return copy;
  }

  await cachePut(cache, url, response.clone());
  return response;
}

/**
 * Range une réponse dans le cache, sans faire échouer l'appelant.
 *
 * Le quota par origine est fini et un gros modèle peut le dépasser : Chromium
 * rejette alors le put. Le cache n'est qu'un confort, donc un échec est avalé
 * et le modèle se charge quand même, quitte à être retéléchargé la prochaine
 * fois. Laisser l'erreur remonter interdirait purement et simplement les gros
 * modèles, alors que leur téléchargement a réussi.
 */
async function cachePut(cache: Cache, url: string, response: Response): Promise<void> {
  try {
    await cache.put(url, response);
  } catch {
    // Quota dépassé ou stockage refusé : on continue sans cache.
  }
}

/** Supprime les caches d'une version précédente du format. */
async function dropStaleCaches(): Promise<void> {
  const names = await caches.keys();
  const stale = names.filter(
    (name) => name.startsWith("piighost-wasm-") && name !== CACHE,
  );
  await Promise.all(stale.map((name) => caches.delete(name)));
}

/** Nombre de threads utilisables, un seul sans isolation d'origine. */
function threadCount(): number {
  if (!self.crossOriginIsolated) return 1;
  return Math.max(1, Math.min(8, navigator.hardwareConcurrency ?? 4));
}

/** L'URL d'un fichier d'un dépôt du Hub. */
const hubUrl = (id: string, file: string) => `${HUB}/${id}/resolve/main/${file}`;

/**
 * Charge un modèle GLiNER : les poids et le tokeniseur, puis la session.
 *
 * Les trois fichiers sont tirés du Hub, donc un dépôt absent ou dépourvu
 * d'export ONNX échoue ici avec son code HTTP, pas plus loin.
 */
async function loadGliner(choice: ModelChoice): Promise<Runner> {
  const [weights, tokenizerJson, tokenizerConfig] = await Promise.all([
    cachedFetch(hubUrl(choice.id, choice.weights), "poids").then((r) => r.arrayBuffer()),
    cachedFetch(hubUrl(choice.id, "tokenizer.json"), "tokeniseur").then((r) => r.json()),
    cachedFetch(hubUrl(choice.id, "tokenizer_config.json"), "tokeniseur").then((r) =>
      r.json(),
    ),
  ]);
  progress("session", 0, 1);
  const engine = await GlinerWeb.load({
    model: new Uint8Array(weights),
    tokenizerJson,
    tokenizerConfig,
    ort,
    maxWidth: choice.maxWidth ?? 12,
    sessionOptions: { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
  });
  return engine as unknown as Runner;
}

/**
 * Charge un modèle de token-classification, en laissant transformers.js faire.
 *
 * La bibliothèque connaît les architectures et gère son propre cache, donc on
 * ne lui prend que ce qu'elle ne sait pas faire : rendre les décalages.
 */
async function loadTransformers(choice: ModelChoice): Promise<Runner> {
  progress("modèle", 0, 1);
  // transformers.js est importé statiquement et injecté. Le laisser se charger
  // par un import dynamique faisait perdre au worker l'état posé par init sous
  // WebKit, et le pipeline Python devenait injoignable après un chargement de
  // modèle.
  const engine = await TransformersNer.load({
    model: choice.id,
    dtype: choice.dtypeJs ?? "q8",
    transformers,
  });
  progress("modèle", 1, 1);
  return engine as unknown as Runner;
}

/** Prépare Pyodide et piighost, sans aucun modèle. */
async function init(): Promise<void> {
  await dropStaleCaches();
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = threadCount();

  progress("Pyodide", 0, 1);
  const { loadPyodide } = await import(/* @vite-ignore */ "/pyodide/pyodide.mjs");
  const py = await loadPyodide({ indexURL: "/pyodide/" });
  progress("Pyodide", 1, 1);

  progress("piighost", 0, 1);
  const wheel = await cachedFetch(WHEEL, "piighost").then((r) => r.arrayBuffer());
  py.FS.writeFile(`/tmp/${WHEEL.slice(1)}`, new Uint8Array(wheel));
  await py.loadPackage("micropip");
  await py.runPythonAsync(
    `import micropip\nawait micropip.install("emfs:/tmp/${WHEEL.slice(1)}")`,
  );

  const pipelineSource = await (await fetch("/py/pipeline.py")).text();
  py.FS.writeFile("/home/pyodide/pipeline.py", pipelineSource);
  await py.runPythonAsync(`
import pipeline

async def _run(text, threshold, use_model, labels):
    return await pipeline.run(text, threshold, use_model, labels)
`);
  pyRun = py.globals.get("_run");
  progress("piighost", 1, 1);

  // Le pont Python appelle cette fonction ; js.nerInfer la voit depuis Pyodide
  // parce que le module js expose la portée globale du worker.
  (self as unknown as Record<string, unknown>).nerInfer = async (
    text: string,
    labels: string[] | { toJs: () => string[] },
    threshold: number,
  ) => {
    if (!runner) return [];
    const list = Array.isArray(labels) ? labels : labels.toJs();
    return runner.extract(text, list, { threshold });
  };

  post({
    type: "ready",
    threads: ort.env.wasm.numThreads,
    isolated: self.crossOriginIsolated,
  });
}

/**
 * Remplace le modèle courant.
 *
 * L'ancien est relâché avant le chargement du nouveau, sinon deux sessions
 * cohabitent dans un tas WebAssembly plafonné à 4 Go.
 */
async function loadModel(choice: ModelChoice): Promise<void> {
  runner = null;
  const loaded =
    choice.engine === "gliner"
      ? await loadGliner(choice)
      : await loadTransformers(choice);
  runner = loaded;
  post({
    type: "model",
    id: choice.id,
    engine: choice.engine,
    labels: loaded.labels ?? [],
  });
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id } = event.data;
  try {
    if (type === "init") {
      await init();
      return;
    }
    if (type === "model") {
      await loadModel(event.data.choice as ModelChoice);
      return;
    }
    if (type === "run") {
      if (!pyRun) throw new Error("The engine is not ready yet.");
      const { text, threshold, useModel, labels } = event.data;
      const started = performance.now();
      const payload = await pyRun(text, threshold, useModel && runner !== null, labels);
      const analysis = JSON.parse(payload) as Analysis;
      post({ type: "result", id, analysis, total: performance.now() - started });
    }
  } catch (error) {
    post({ type: "error", id, message: String((error as Error)?.message ?? error) });
  }
};
