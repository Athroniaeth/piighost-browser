<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "../../lib/cn";

  /** The studio's badge: 1.25rem tall pill, three variants, link-aware. */
  type Variant = "default" | "secondary" | "outline";

  let {
    variant = "secondary",
    href = null,
    class: extra = "",
    children,
    ...rest
  }: {
    variant?: Variant;
    href?: string | null;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const VARIANTS: Record<Variant, string> = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    outline: "border-border text-foreground",
  };

  const classes = $derived(
    cn(
      "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-4xl border px-2 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:size-3",
      VARIANTS[variant],
      href && "hover:bg-muted hover:text-foreground",
      extra,
    ),
  );
</script>

{#if href}
  <a {href} class={classes} {...rest}>{@render children()}</a>
{:else}
  <span class={classes} {...rest}>{@render children()}</span>
{/if}
