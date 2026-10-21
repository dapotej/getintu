/** Parses RFC 4180 CSV (quoted fields, escaped quotes, CRLF or LF). Returns rows of raw strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const normalise = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface Table<K extends string> {
  /** Each record keyed by our field names, with its 1-based line number in the file (header = 1). */
  records: { line: number; get: (key: K) => string }[];
  missing: K[];
  ignored: string[];
}

/**
 * Reads a CSV with a header row, matching columns to `fields` by any of their aliases (case,
 * spacing and punctuation don't matter, so "Pass number", "pass_number" and "PASS NUMBER" all match).
 */
export function readTable<K extends string>(text: string, fields: Record<K, readonly string[]>, required: readonly NoInfer<K>[]): Table<K> {
  const [header = [], ...body] = parseCsv(text);
  const index = new Map<K, number>();
  const used = new Set<number>();
  for (const [key, aliases] of Object.entries(fields) as [K, readonly string[]][]) {
    const wanted = new Set([key, ...aliases].map(normalise));
    const at = header.findIndex((h, i) => !used.has(i) && wanted.has(normalise(h)));
    if (at >= 0) {
      index.set(key, at);
      used.add(at);
    }
  }
  return {
    records: body.map((cells, i) => ({ line: i + 2, get: (key: K) => (index.has(key) ? (cells[index.get(key) ?? -1] ?? "").trim() : "") })),
    missing: required.filter((k) => !index.has(k)),
    ignored: header.filter((_, i) => !used.has(i) && header[i]?.trim()),
  };
}
