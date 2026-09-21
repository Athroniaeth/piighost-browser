/**
 * The engine, inside a Web Worker.
 *
 * Everything heavy lives here: the ONNX session, Pyodide and piighost. Two
 * reasons, and the second one is not negotiable.
 *
 * Inference takes hundreds of milliseconds and would freeze the page. More
 * importantly, under Emscripten asyncio.to_thread does not raise: it runs on
 * the calling thread and blocks the event loop, so Pyodide on the main thread
 * freezes the interface as soon as a detector works.
 *
 * Models are fetched from the Hub on demand rather than bundled, which is what
 * lets you try one the catalogue does not know. The Cache API keeps them under
 * their URL, so switching model does not throw the previous one away.
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
 * Fetch a resource through the Cache API.
 *
 * A byte already downloaded is not downloaded twice, across sessions and across
 * models. Progress is reported when the server announces a size.
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
 * Store a response in the cache without failing the caller.
 *
 * The per-origin quota is finite and a large model can exceed it, at which
 * point Chromium rejects the put. The cache is a convenience, so a failure is
 * swallowed and the model loads anyway, to be re-downloaded next time. Letting
 * the error propagate would rule out large models outright, even though their
 * download succeeded.
 */
async function cachePut(cache: Cache, url: string, response: Response): Promise<void> {
  try {
    await cache.put(url, response);
  } catch {
    // Quota exceeded or storage refused: carry on without a cache.
  }
}

/** Delete caches from a previous format version. */
async function dropStaleCaches(): Promise<void> {
  const names = await caches.keys();
  const stale = names.filter(
    (name) => name.startsWith("piighost-wasm-") && name !== CACHE,
  );
  await Promise.all(stale.map((name) => caches.delete(name)));
}

/** How many threads are usable, one without cross-origin isolation. */
function threadCount(): number {
  if (!self.crossOriginIsolated) return 1;
  return Math.max(1, Math.min(8, navigator.hardwareConcurrency ?? 4));
}

/** The URL of a file in a Hub repository. */
const hubUrl = (id: string, file: string) => `${HUB}/${id}/resolve/main/${file}`;

/**
 * Load a GLiNER model: the weights and the tokenizer, then the session.
 *
 * All three files come from the Hub, so a missing repository or one without an
 * ONNX export fails here with its HTTP code, not later.
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
 * Load a token-classification model, letting transformers.js do the work.
 *
 * The library knows the architectures and manages its own cache, so the only
 * thing taken from it is what it cannot do: return the offsets.
 */
async function loadTransformers(choice: ModelChoice): Promise<Runner> {
  progress("modèle", 0, 1);
  // transformers.js is imported statically and injected. Letting it load
  // through a dynamic import made the worker lose the state init had set under
  // WebKit, and the Python pipeline became unreachable after a model load.
  const engine = await TransformersNer.load({
    model: choice.id,
    dtype: choice.dtypeJs ?? "q8",
    transformers,
  });
  progress("modèle", 1, 1);
  return engine as unknown as Runner;
}

/** Prepare Pyodide and piighost, with no model. */
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

  // The Python bridge calls this function. js.nerInfer sees it from Pyodide
  // because the js module exposes the worker's global scope.
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
 * Replace the current model.
 *
 * The previous one is released before the new one loads, otherwise two sessions
 * share a WebAssembly heap capped at 4 GB.
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
