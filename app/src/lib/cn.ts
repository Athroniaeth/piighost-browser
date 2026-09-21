/** Join class names, dropping the falsy ones. Enough without tailwind-merge:
 *  the components never pass two utilities that fight over the same property. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
