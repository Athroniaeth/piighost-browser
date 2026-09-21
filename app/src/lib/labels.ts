/**
 * Entity colours, ported from piighost-studio's labels.ts so a label looks the
 * same in the hub and in the studio's playground.
 *
 * Colours are handed out by first appearance: the first fifteen distinct labels
 * each get their own hue before any repeats. PERSON keeps the primary, as the
 * studio's PER does. The class strings are spelled out in full so Tailwind
 * keeps them in the bundle.
 */

export const FIXED_STYLES: Record<string, string> = {
  PERSON: "bg-primary/10 text-primary",
  PER: "bg-primary/10 text-primary",
  ORGANIZATION: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ORG: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ADDRESS: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  LOC: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export const PALETTE = [
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  "bg-green-500/15 text-green-700 dark:text-green-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  "bg-rose-500/30 text-rose-800 dark:text-rose-200",
  "bg-orange-500/30 text-orange-800 dark:text-orange-200",
  "bg-yellow-500/30 text-yellow-800 dark:text-yellow-200",
  "bg-lime-500/30 text-lime-800 dark:text-lime-200",
  "bg-green-500/30 text-green-800 dark:text-green-200",
  "bg-teal-500/30 text-teal-800 dark:text-teal-200",
  "bg-cyan-500/30 text-cyan-800 dark:text-cyan-200",
  "bg-sky-500/30 text-sky-800 dark:text-sky-200",
  "bg-blue-500/30 text-blue-800 dark:text-blue-200",
  "bg-indigo-500/30 text-indigo-800 dark:text-indigo-200",
  "bg-violet-500/30 text-violet-800 dark:text-violet-200",
  "bg-purple-500/30 text-purple-800 dark:text-purple-200",
  "bg-fuchsia-500/30 text-fuchsia-800 dark:text-fuchsia-200",
  "bg-pink-500/30 text-pink-800 dark:text-pink-200",
] as const;

/** Assign a colour class to every label by first-appearance order. */
export function assignLabelColors(
  labels: Iterable<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  let next = 0;
  for (const label of labels) {
    if (map.has(label)) continue;
    if (label in FIXED_STYLES) {
      map.set(label, FIXED_STYLES[label]);
      continue;
    }
    map.set(label, PALETTE[next % PALETTE.length]);
    next += 1;
  }
  return map;
}

/**
 * A stable colour for a label seen alone, outside a run. Hashing keeps the same
 * label on the same hue from one page to the next, which appearance order
 * cannot promise across pages.
 */
export function labelStyle(
  label: string,
  colors?: Map<string, string>,
): string {
  const assigned = colors?.get(label);
  if (assigned) return assigned;
  if (label in FIXED_STYLES) return FIXED_STYLES[label];
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % 14];
}
