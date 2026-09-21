<script lang="ts">
  import Button from "./ui/Button.svelte";
  import { i18n, t } from "../lib/i18n.svelte";

  /** One button that flips the language: two options need no menu. */
  const next = $derived(i18n.locale === "fr" ? "en" : "fr");
  const flag = $derived(i18n.locale === "fr" ? "🇫🇷" : "🇬🇧");
  const label = $derived(i18n.locale === "fr" ? "Français" : "English");
</script>

<Button
  variant="ghost"
  size="sm"
  aria-label={t("nav.language")}
  onclick={() => i18n.set(next)}
>
  <span aria-hidden="true">{flag}</span>
  <span>{label}</span>
</Button>
