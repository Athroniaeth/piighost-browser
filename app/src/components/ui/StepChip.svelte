<script lang="ts">
  import Check from "@lucide/svelte/icons/check";

  /** Numbered step glyph for region headers; a check once the step is done. */
  let { n, done = false }: { n: number; done?: boolean } = $props();
</script>

<span
  class="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-semibold tabular-nums text-primary"
>
  {#if done}<Check class="size-3" aria-hidden="true" />{:else}{n}{/if}
</span>
