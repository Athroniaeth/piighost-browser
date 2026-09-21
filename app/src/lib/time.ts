import type { Locale } from "./i18n.svelte";

/** "3 days ago" / "il y a 3 jours" from an ISO date, or null when there is none. */
export function relativeTime(
  iso: string | null | undefined,
  locale: Locale,
): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size)
      return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

/** A short absolute date, "13 Sept 2026", in the visitor's language. */
export function shortDate(
  iso: string | null | undefined,
  locale: Locale,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
