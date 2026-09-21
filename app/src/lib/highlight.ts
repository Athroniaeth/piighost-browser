/**
 * Syntax highlighting as class names, never inline styles.
 *
 * The site's Content-Security-Policy allows `style-src 'self'`, with no
 * `unsafe-inline`, so a highlighter that emits `style="color:…"` would be
 * blocked in production and would only show up there. These functions return
 * tokens, the components map them to Tailwind classes.
 */

export type Token = { text: string; kind: string };

const TOML_RULES: [RegExp, string][] = [
  [/^#.*/, "comment"],
  [/^\[\[?[^\]]*\]\]?/, "section"],
  [/^'[^']*'/, "string"],
  [/^"(?:[^"\\]|\\.)*"/, "string"],
  [/^\b(?:true|false)\b/, "boolean"],
  [/^-?\d+(?:\.\d+)?\b/, "number"],
  [/^[A-Za-z0-9_-]+(?=\s*=)/, "key"],
  [/^[=,{}[\]]/, "punctuation"],
  [/^\s+/, "space"],
];

/** Tokenise TOML well enough to read a pipeline file. */
export function tomlTokens(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source;
  while (rest.length > 0) {
    const rule = TOML_RULES.find(([pattern]) => pattern.test(rest));
    if (!rule) {
      const next = rest.slice(1);
      const last = tokens[tokens.length - 1];
      if (last && last.kind === "text") last.text += rest[0];
      else tokens.push({ text: rest[0], kind: "text" });
      rest = next;
      continue;
    }
    const [pattern, kind] = rule;
    const [matched] = pattern.exec(rest)!;
    tokens.push({ text: matched, kind });
    rest = rest.slice(matched.length);
  }
  return tokens;
}

const REGEX_RULES: [RegExp, string][] = [
  [/^\\[dDwWsSbBAZ]/, "class"],
  [/^\\./, "escape"],
  [/^\(\?<[=!][^)]*/, "group"],
  [/^\(\?[:=!#]/, "group"],
  [/^[()]/, "group"],
  [/^\[(?:[^\]\\]|\\.)*\]/, "set"],
  [/^\{\d+(?:,\d*)?\}/, "quantifier"],
  [/^[*+?]/, "quantifier"],
  [/^\|/, "alternation"],
  [/^\^|^\$/, "anchor"],
];

/** Tokenise a regex so its structure is visible at a glance. */
export function regexTokens(source: string): Token[] {
  const tokens: Token[] = [];
  let rest = source;
  while (rest.length > 0) {
    const rule = REGEX_RULES.find(([pattern]) => pattern.test(rest));
    if (!rule) {
      const last = tokens[tokens.length - 1];
      if (last && last.kind === "literal") last.text += rest[0];
      else tokens.push({ text: rest[0], kind: "literal" });
      rest = rest.slice(1);
      continue;
    }
    const [pattern, kind] = rule;
    const [matched] = pattern.exec(rest)!;
    tokens.push({ text: matched, kind });
    rest = rest.slice(matched.length);
  }
  return tokens;
}

export type Segment = {
  text: string;
  hit?: {
    label: string;
    kept: boolean;
    detector: string;
    pattern: string | null;
  };
};

/**
 * Cut a text into plain runs and detected runs.
 *
 * Only kept detections become segments: a dropped one overlaps a kept one by
 * definition, and two overlapping highlights cannot both be drawn. The dropped
 * ones are listed beside the text instead.
 */
export function segments(
  text: string,
  hits: {
    start: number;
    end: number;
    label: string;
    kept: boolean;
    detector: string;
    pattern: string | null;
  }[],
): Segment[] {
  const kept = hits.filter((hit) => hit.kept).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const hit of kept) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) out.push({ text: text.slice(cursor, hit.start) });
    out.push({
      text: text.slice(hit.start, hit.end),
      hit: {
        label: hit.label,
        kept: hit.kept,
        detector: hit.detector,
        pattern: hit.pattern,
      },
    });
    cursor = hit.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
