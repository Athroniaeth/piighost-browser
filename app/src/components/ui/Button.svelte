<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "../../lib/cn";

  /**
   * The studio's base-nova button. Renders an anchor when `href` is given, so a
   * link stays a link (middle click, new tab, crawlers) while looking the same.
   */
  type Variant = "default" | "outline" | "ghost" | "secondary" | "link";
  type Size = "default" | "sm" | "lg" | "xl" | "icon" | "icon-sm" | "icon-lg";

  let {
    variant = "default",
    size = "default",
    href = null,
    type = "button",
    disabled = false,
    class: extra = "",
    children,
    ...rest
  }: {
    variant?: Variant;
    size?: Size;
    href?: string | null;
    type?: "button" | "submit";
    disabled?: boolean;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const VARIANTS: Record<Variant, string> = {
    default:
      "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
    outline:
      "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
    secondary:
      "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost:
      "border-transparent hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
    link: "border-transparent text-primary underline-offset-4 hover:underline",
  };

  const SIZES: Record<Size, string> = {
    default: "h-8 gap-1.5 px-2.5",
    sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [&_svg]:size-3.5",
    lg: "h-9 gap-1.5 px-3",
    xl: "h-12 gap-2 px-6 text-base [&_svg]:size-5",
    icon: "size-8",
    "icon-sm": "size-7 rounded-md",
    "icon-lg": "size-9",
  };

  const classes = $derived(
    cn(
      "inline-flex shrink-0 items-center justify-center rounded-lg border text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      VARIANTS[variant],
      SIZES[size],
      extra,
    ),
  );
</script>

{#if href}
  <a {href} class={classes} aria-disabled={disabled || undefined} {...rest}>
    {@render children()}
  </a>
{:else}
  <button {type} class={classes} {disabled} {...rest}>
    {@render children()}
  </button>
{/if}
