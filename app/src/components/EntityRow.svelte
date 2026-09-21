<script lang="ts">
  import type { Snippet } from "svelte";
  import EntityLabel from "./EntityLabel.svelte";
  import { cn } from "../lib/cn";

  /** One detected entity: coloured label, monospace surface, a trailing note. */
  let {
    label,
    text,
    colors = undefined,
    muted = false,
    trailing = null,
  }: {
    label: string;
    text: string;
    colors?: Map<string, string>;
    muted?: boolean;
    trailing?: Snippet | null;
  } = $props();
</script>

<li
  class={cn(
    "flex items-center justify-between gap-2 rounded-md bg-muted/40 p-2",
    muted && "opacity-60",
  )}
>
  <div class="flex min-w-0 items-center gap-2">
    <EntityLabel {label} {colors} />
    <span class="truncate font-mono text-sm">{text}</span>
  </div>
  {#if trailing}
    <span class="shrink-0 text-xs text-muted-foreground"
      >{@render trailing()}</span
    >
  {/if}
</li>
