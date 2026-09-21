<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "../../lib/cn";
  import { EYEBROW } from "../../lib/ui";

  /**
   * The studio's card: ring instead of border, 1rem padding, optional titled
   * header with an action slot on the right.
   */
  let {
    title = null,
    action = null,
    class: extra = "",
    bodyClass = "",
    children,
  }: {
    title?: string | null;
    action?: Snippet | null;
    class?: string;
    bodyClass?: string;
    children: Snippet;
  } = $props();
</script>

<section
  class={cn(
    "flex flex-col gap-3 rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10",
    extra,
  )}
>
  {#if title || action}
    <header class="flex items-center justify-between gap-2 px-4">
      {#if title}<h2 class={EYEBROW}>{title}</h2>{/if}
      {#if action}{@render action()}{/if}
    </header>
  {/if}
  <div class={cn("px-4", bodyClass)}>{@render children()}</div>
</section>
