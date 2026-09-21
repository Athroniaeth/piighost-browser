<script lang="ts">
  import CopyButton from "./CopyButton.svelte";
  import { regexTokens, tomlTokens } from "../../lib/highlight";
  import { cn } from "../../lib/cn";

  /**
   * The studio's code block: bordered, muted tint, copy icon top right. Tokens
   * are classes, never inline styles, so the production CSP accepts them.
   */
  let {
    code,
    language = "plain",
    wrap = false,
    class: extra = "",
  }: {
    code: string;
    language?: "toml" | "regex" | "plain";
    wrap?: boolean;
    class?: string;
  } = $props();

  const tokens = $derived(
    language === "toml"
      ? tomlTokens(code)
      : language === "regex"
        ? regexTokens(code)
        : null,
  );
</script>

<div
  class={cn(
    "group relative overflow-hidden rounded-lg border bg-muted/30",
    extra,
  )}
>
  <CopyButton
    value={code}
    class="no-print absolute end-2 top-2 bg-card shadow-sm ring-1 ring-foreground/10"
  />
  <pre
    class={cn(
      "overflow-x-auto p-4 font-mono text-sm leading-relaxed",
      wrap && "whitespace-pre-wrap break-all",
    )}><code
      >{#if tokens}{#each tokens as token, index (index)}<span
            class="tok-{token.kind}">{token.text}</span
          >{/each}{:else}{code}{/if}</code
    ></pre>
</div>
