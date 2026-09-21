/**
 * The worker client, on the main thread.
 *
 * It only posts messages and holds reactive state. No computation here, which
 * is the whole point of moving Pyodide and ONNX into a worker.
 */

import type { Analysis, ModelChoice } from "./worker";

type Pending = {
  resolve: (analysis: Analysis & { total: number }) => void;
  reject: (error: Error) => void;
};

class Engine {
  ready = $state(false);
  error = $state<string | null>(null);
  step = $state("");
  done = $state(0);
  total = $state(0);
  threads = $state(1);
  isolated = $state(false);

  /** The loaded model, null until one is. */
  model = $state<{ id: string; engine: string; labels: string[] } | null>(null);
  loadingModel = $state(false);

  #worker: Worker | null = null;
  #pending = new Map<number, Pending>();
  #modelWaiters: Pending[] = [];
  #nextId = 0;

  /** Start the worker and kick off the engine load. */
  start() {
    if (this.#worker) return;
    this.#worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.#worker.onmessage = (event) => this.#receive(event.data);
    this.#worker.onerror = (event) => {
      this.error = event.message || "The worker failed to start.";
    };
    this.#worker.postMessage({ type: "init" });
  }

  #receive(message: Record<string, unknown>) {
    if (message.type === "progress") {
      this.step = message.step as string;
      this.done = message.done as number;
      this.total = message.total as number;
      return;
    }
    if (message.type === "ready") {
      this.ready = true;
      this.threads = message.threads as number;
      this.isolated = Boolean(message.isolated);
      return;
    }
    if (message.type === "model") {
      this.model = {
        id: message.id as string,
        engine: message.engine as string,
        labels: (message.labels as string[]) ?? [],
      };
      this.loadingModel = false;
      this.#modelWaiters.splice(0).forEach((waiter) => waiter.resolve(undefined as never));
      return;
    }

    if (message.type === "error" && message.id === undefined) {
      this.loadingModel = false;
      const failure = new Error(message.message as string);
      this.#modelWaiters.splice(0).forEach((waiter) => waiter.reject(failure));
      return;
    }

    const pending = this.#pending.get(message.id as number);
    if (!pending) return;
    this.#pending.delete(message.id as number);
    if (message.type === "error") {
      pending.reject(new Error(message.message as string));
      return;
    }
    const analysis = message.analysis as Analysis;
    pending.resolve({ ...analysis, total: message.total as number });
  }

  /** Load, or replace, the worker's model. */
  loadModel(choice: ModelChoice): Promise<void> {
    if (!this.#worker) return Promise.reject(new Error("The engine has not been started."));
    this.loadingModel = true;
    this.model = null;
    this.error = null;
    return new Promise((resolve, reject) => {
      this.#modelWaiters.push({ resolve: resolve as never, reject });
      this.#worker!.postMessage({ type: "model", choice });
    });
  }

  /** Anonymise a text inside the worker. */
  run(
    text: string,
    threshold: number,
    useModel: boolean,
    labels: Record<string, string>,
  ): Promise<Analysis & { total: number }> {
    if (!this.#worker) return Promise.reject(new Error("The engine has not been started."));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker!.postMessage({ type: "run", id, text, threshold, useModel, labels });
    });
  }
}

export const engine = new Engine();
