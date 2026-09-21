<script lang="ts">
  import { Play, ShieldCheck } from "@lucide/svelte";

  import EntityHighlight from "./components/EntityHighlight.svelte";
  import EntityRow from "./components/EntityRow.svelte";
  import LangToggle from "./components/LangToggle.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import Badge from "./components/ui/Badge.svelte";
  import Button from "./components/ui/Button.svelte";
  import Region from "./components/ui/Region.svelte";
  import Segmented from "./components/ui/Segmented.svelte";
  import { engine } from "./lib/engine.svelte";
  import { i18n, t } from "./lib/i18n.svelte";
  import { assignLabelColors } from "./lib/labels";
  import { CATALOG, customEntry, labelsFor, type ModelEntry } from "./lib/models";
  import { SAMPLES } from "./lib/samples";
  import { EYEBROW, FIELD, FIELD_MONO, TEXTAREA } from "./lib/ui";
  import type { Analysis } from "./lib/worker";

  let text = $state(SAMPLES[0].text);
  let threshold = $state(0.35);
  let useModel = $state(true);
  let picked = $state(CATALOG[1]?.id ?? CATALOG[0].id);
  let customId = $state("");
  let customEngine = $state<"gliner" | "transformers">("transformers");
  let customWeights = $state("onnx/model_quantized.onnx");
  let view = $state<"input" | "anonymized">("input");
  let analysis = $state<(Analysis & { total: number }) | null>(null);
  let running = $state(false);
  let failure = $state<string | null>(null);

  engine.start();

  // The colour map is built from every detection, dropped ones included:
  // hiding an entity must not reshuffle the hues.
  const colors = $derived(
    assignLabelColors((analysis?.hits ?? []).map((hit) => hit.label)),
  );
  const kept = $derived((analysis?.hits ?? []).filter((hit) => hit.kept));
  const dropped = $derived((analysis?.hits ?? []).filter((hit) => !hit.kept));
  const percent = $derived(
    engine.total > 0 ? Math.round((engine.done / engine.total) * 100) : 0,
  );

  /** Find the kept entity that took a dropped detection's place. */
  function winner(start: number, end: number): string {
    const over = kept.find((hit) => hit.start < end && start < hit.end);
    return over ? over.label : "";
  }

  /** The chosen entry, or the hand-typed one. */
  function chosen(): ModelEntry {
    if (picked !== "custom") {
      return CATALOG.find((entry) => entry.id === picked) ?? CATALOG[0];
    }
    return customEntry(customId, customEngine, customWeights);
  }

  async function load() {
    const entry = chosen();
    if (entry.id === "") return;
    failure = null;
    try {
      await engine.loadModel(entry);
    } catch (error) {
      failure = String((error as Error).message);
    }
  }

  async function analyse() {
    if (!engine.ready || running || text.trim() === "") return;
    running = true;
    failure = null;
    const labels = labelsFor(engine.model?.engine ?? "gliner", engine.model?.labels ?? []);
    try {
      analysis = await engine.run(text, threshold, useModel, labels);
      view = "anonymized";
    } catch (error) {
      failure = String((error as Error).message);
    } finally {
      running = false;
    }
  }
</script>

<div class="flex min-h-dvh flex-col bg-background text-foreground">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b px-4">
    <span class="font-mono text-sm font-semibold">{t("wasm.title")}</span>
    <Badge variant="outline">
      <ShieldCheck class="mr-1 size-3" aria-hidden="true" />
      {engine.isolated ? t("wasm.isolated") : t("wasm.notIsolated")}
    </Badge>
    {#if engine.ready}
      <Badge variant="outline">{engine.threads} {t("wasm.threads")}</Badge>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      <LangToggle />
      <ThemeToggle />
    </div>
  </header>

  <main
    class="mx-auto flex w-full max-w-[88rem] flex-col p-4 lg:h-[calc(100dvh-4rem)]"
  >
    <div
      class="grid flex-1 divide-y overflow-hidden rounded-xl border bg-card shadow-sm lg:min-h-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.9fr)_minmax(0,1.05fr)] lg:divide-x lg:divide-y-0"
    >
      <Region step={1} done={analysis !== null} title={t("wasm.configure")}>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <span class={EYEBROW}>{t("wasm.model")}</span>
            <Segmented
              label={t("wasm.model")}
              bind:value={useModel}
              options={[
                { value: true, label: t("wasm.modelOn") },
                { value: false, label: t("wasm.modelOff") },
              ]}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class={EYEBROW}>{t("wasm.pickModel")}</span>
            <select class={FIELD} bind:value={picked} disabled={engine.loadingModel}>
              {#each ["gliner", "transformers"] as family (family)}
                <optgroup label={family}>
                  {#each CATALOG.filter((entry) => entry.engine === family) as entry (entry.id)}
                    <option value={entry.id}>
                      {entry.id.split("/")[1]} · {entry.megabytes} Mo · {entry.dtype}
                    </option>
                  {/each}
                </optgroup>
              {/each}
              <option value="custom">{t("wasm.custom")}</option>
            </select>

            {#if picked === "custom"}
              <input
                class={FIELD_MONO}
                placeholder={t("wasm.customId")}
                bind:value={customId}
              />
              <Segmented
                label={t("wasm.engine")}
                bind:value={customEngine}
                options={[
                  { value: "transformers", label: "transformers" },
                  { value: "gliner", label: "gliner" },
                ]}
              />
              <input
                class={FIELD_MONO}
                placeholder={t("wasm.customWeights")}
                bind:value={customWeights}
              />
            {/if}

            <Button variant="outline" disabled={engine.loadingModel || !engine.ready} onclick={load}>
              {engine.loadingModel ? t("wasm.loading2") : t("wasm.load")}
            </Button>

            <span class="text-xs text-muted-foreground">
              {#if engine.model}
                <span class="font-mono">{engine.model.id}</span>
                {#if engine.model.labels.length > 0}
                  · {engine.model.labels.length} {t("wasm.modelLabels")}
                {/if}
              {:else if engine.loadingModel}
                {engine.step}
                {#if engine.total > 1}<span class="font-mono">{percent}%</span>{/if}
              {:else}
                {t("wasm.noModel")}
              {/if}
            </span>
          </div>

          <label class="flex flex-col gap-1.5">
            <span class={EYEBROW}>
              {t("wasm.threshold")}
              <span class="font-mono normal-case">{threshold.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min="0.05"
              max="0.9"
              step="0.05"
              disabled={!useModel || engine.model === null}
              bind:value={threshold}
              class="w-full accent-primary disabled:opacity-50"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class={EYEBROW}>{t("wasm.sample")}</span>
            <select
              class={FIELD}
              onchange={(event) => {
                const picked = SAMPLES.find(
                  (sample) => sample.name === event.currentTarget.value,
                );
                if (picked) {
                  text = picked.text;
                  analysis = null;
                  view = "input";
                }
              }}
            >
              {#each SAMPLES as sample (sample.name)}
                <option value={sample.name}>{i18n.pick(sample.title)}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="mt-auto shrink-0 pt-4">
          <Button
            class="w-full"
            disabled={!engine.ready || running || text.trim() === ""}
            onclick={analyse}
          >
            <Play class="mr-1.5 size-4" aria-hidden="true" />
            {running ? t("wasm.running") : t("wasm.run")}
          </Button>

          <p class="mt-2 text-xs text-muted-foreground">
            {#if !engine.ready}
              {t("wasm.loading")} · {engine.step}
              {#if engine.total > 1}<span class="font-mono">{percent}%</span>{/if}
            {:else if failure}
              <span class="text-destructive">{failure}</span>
            {:else if analysis}
              <span class="font-mono">{analysis.timings.rules.toFixed(0)} ms</span>
              {t("wasm.rules")} ·
              <span class="font-mono">{analysis.timings.model.toFixed(0)} ms</span>
              {t("wasm.modelTime")} ·
              <span class="font-mono">{analysis.timings.pipeline.toFixed(0)} ms</span>
              {t("wasm.pipeline")}
            {:else}
              {t("wasm.lede")}
            {/if}
          </p>
          <p class="mt-2 text-xs text-muted-foreground">{t("wasm.privacy")}</p>
        </div>
      </Region>

      <Region
        step={2}
        done={analysis !== null}
        title={t("wasm.text")}
        bodyClass="gap-3"
      >
        {#snippet action()}
          <Segmented
            label={t("wasm.text")}
            bind:value={view}
            options={[
              { value: "input", label: t("wasm.input") },
              { value: "anonymized", label: t("wasm.anonymized") },
            ]}
          />
        {/snippet}

        {#if view === "input"}
          <textarea
            bind:value={text}
            placeholder={t("wasm.placeholder")}
            class="{TEXTAREA} min-h-0 flex-1"
          ></textarea>
        {:else if analysis}
          <div class="min-h-0 flex-1 overflow-auto rounded-md bg-muted/40 p-3">
            <EntityHighlight
              text={analysis.restored}
              hits={analysis.hits}
              {colors}
            />
            <hr class="my-3 border-dashed" />
            <p class="whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {analysis.anonymized}
            </p>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">{t("wasm.empty")}</p>
        {/if}
      </Region>

      <Region
        step={3}
        done={kept.length > 0}
        title="{t('wasm.results')}{analysis
          ? ` · ${kept.length} ${t('wasm.kept')}`
          : ''}"
        bodyClass="gap-3"
      >
        {#if kept.length > 0}
          <ul class="flex flex-col gap-1.5">
            {#each kept as hit (`${hit.start}-${hit.end}-${hit.label}`)}
              <EntityRow label={hit.label} text={hit.text} {colors}>
                {#snippet trailing()}
                  {hit.detector === "gliner"
                    ? hit.score.toFixed(2)
                    : hit.detector}
                {/snippet}
              </EntityRow>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-muted-foreground">{t("wasm.empty")}</p>
        {/if}

        {#if dropped.length > 0}
          <span class={EYEBROW}>{t("wasm.dropped")}</span>
          <ul class="flex flex-col gap-1.5">
            {#each dropped as hit (`${hit.start}-${hit.end}-${hit.label}`)}
              <EntityRow label={hit.label} text={hit.text} {colors} muted>
                {#snippet trailing()}
                  {t("wasm.lostTo")}
                  {winner(hit.start, hit.end)}
                {/snippet}
              </EntityRow>
            {/each}
          </ul>
        {/if}
      </Region>
    </div>
  </main>
</div>
