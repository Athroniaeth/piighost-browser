<script lang="ts" generics="T extends string">
  import { cn } from "../../lib/cn";

  /** The studio's pill toggle: muted track, active option lifted with a shadow. */
  let {
    options,
    value = $bindable(),
    label,
    size = "sm",
  }: {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    size?: "sm" | "default";
  } = $props();
</script>

<div
  role="group"
  aria-label={label}
  class={cn(
    "flex shrink-0 gap-1 rounded-lg border bg-muted/40 p-1",
    size === "sm" ? "text-xs" : "text-sm",
  )}
>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={value === option.value}
      class={cn(
        "rounded-md font-medium transition-colors",
        size === "sm" ? "px-2 py-1" : "px-3 py-1.5",
        value === option.value
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      onclick={() => (value = option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>
