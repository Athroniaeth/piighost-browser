<script lang="ts">
  import type { Snippet } from "svelte";
  import StepChip from "./StepChip.svelte";
  import { cn } from "../../lib/cn";
  import { EYEBROW } from "../../lib/ui";

  /**
   * One column of a workshop card, the studio's grammar: numbered chip,
   * uppercase title, an optional action on the right, then a scrollable body.
   * Both playground pages and the contribution page import this same piece,
   * which is what keeps them one system.
   */
  let {
    step = null,
    done = false,
    title,
    action = null,
    bodyClass = "",
    children,
  }: {
    step?: number | null;
    done?: boolean;
    title: string;
    action?: Snippet | null;
    bodyClass?: string;
    children: Snippet;
  } = $props();
</script>

<section class="flex min-h-0 flex-col overflow-auto p-4">
  <div class="mb-3 flex shrink-0 items-center justify-between gap-2">
    <h2 class={cn("flex items-center gap-2", EYEBROW)}>
      {#if step !== null}<StepChip n={step} {done} />{/if}
      {title}
    </h2>
    {#if action}{@render action()}{/if}
  </div>
  <div class={cn("flex min-h-0 flex-1 flex-col", bodyClass)}>
    {@render children()}
  </div>
</section>
