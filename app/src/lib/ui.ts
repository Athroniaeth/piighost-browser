/**
 * Shared class strings for native controls, one token per control so every
 * page's inputs match without a wrapper component each. The values are the
 * studio's playground tokens.
 */
export const FIELD =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export const FIELD_MONO = `${FIELD} font-mono`;

export const TEXTAREA = `${FIELD} min-h-32 resize-y font-mono leading-relaxed`;

/** Uppercase region and card section title. */
export const EYEBROW =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
