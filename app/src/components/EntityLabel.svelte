<script lang="ts">
  import { labelStyle } from "../lib/labels";
  import { cn } from "../lib/cn";

  /** A coloured label chip, the studio's entity vocabulary. */
  let {
    label,
    colors = undefined,
    href = null,
    class: extra = "",
  }: {
    label: string;
    colors?: Map<string, string>;
    href?: string | null;
    class?: string;
  } = $props();

  const classes = $derived(
    cn(
      "rounded px-1.5 py-0.5 font-mono text-xs font-medium",
      labelStyle(label, colors),
      extra,
    ),
  );
</script>

{#if href}
  <a {href} class={cn(classes, "hover:underline")}>{label}</a>
{:else}
  <span class={classes}>{label}</span>
{/if}
