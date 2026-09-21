<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import Button from "./Button.svelte";
  import { t } from "../../lib/i18n.svelte";

  let { value, class: extra = "" }: { value: string; class?: string } =
    $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    await navigator.clipboard.writeText(value);
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1500);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<Button
  variant="ghost"
  size="icon-sm"
  aria-label={copied ? t("common.copied") : t("common.copy")}
  class={extra}
  onclick={copy}
>
  {#if copied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
</Button>
