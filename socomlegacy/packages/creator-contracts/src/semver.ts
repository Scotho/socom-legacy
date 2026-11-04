/**
 * Semantic versions and ranges for pack versions, contracts and dependencies (XT-1), a browser adaptation.
 * Versions are SemVer 2.0.0. A range is `*`, or comparator sets joined by `||`, each set comparators separated by
 * spaces: `1.2.3` / `=1.2.3`, `>`, `>=`, `<`, `<=`, `^1.2.3` (the left-most non-zero part fixed) and `~1.2.3` (the
 * minor fixed). Pre-release versions compare by SemVer precedence and are not otherwise excluded.
 */

export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly pre: readonly (string | number)[];
}

const NUM = "0|[1-9]\\d*";
const PRE_ID = `(?:${NUM}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const SEMVER = new RegExp(`^(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$`);

export function parseSemver(text: string): SemVer | null {
  if (typeof text !== "string" || text.length > 64) return null;
  const m = SEMVER.exec(text);
  if (!m) return null;
  const part = (s: string): number => Number(s);
  const [major, minor, patch] = [part(m[1]!), part(m[2]!), part(m[3]!)];
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  const pre = m[4] ? m[4].split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major, minor, patch, pre };
}

export function compareSemver(a: SemVer, b: SemVer): number {
  for (const k of ["major", "minor", "patch"] as const) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

type Comparator = (v: SemVer) => boolean;
const v3 = (major: number, minor: number, patch: number): SemVer => ({ major, minor, patch, pre: [] });

function comparator(token: string): Comparator[] | null {
  const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(token);
  if (!m) return null;
  const base = parseSemver(m[2]!);
  if (!base) return null;
  const cmp = (v: SemVer): number => compareSemver(v, base);
  switch (m[1] ?? "=") {
    case "=": return [(v) => cmp(v) === 0];
    case ">": return [(v) => cmp(v) > 0];
    case ">=": return [(v) => cmp(v) >= 0];
    case "<": return [(v) => cmp(v) < 0];
    case "<=": return [(v) => cmp(v) <= 0];
    case "~": {
      const upper = v3(base.major, base.minor + 1, 0);
      return [(v) => cmp(v) >= 0, (v) => compareSemver(v, upper) < 0];
    }
    default: {
      const upper = base.major > 0 ? v3(base.major + 1, 0, 0) : base.minor > 0 ? v3(0, base.minor + 1, 0) : v3(0, 0, base.patch + 1);
      return [(v) => cmp(v) >= 0, (v) => compareSemver(v, upper) < 0];
    }
  }
}

/** A parsed range: alternatives of comparator sets. Null when the text is not a range. */
export function parseRange(range: string): Comparator[][] | null {
  if (typeof range !== "string" || range.length === 0 || range.length > 128) return null;
  const sets: Comparator[][] = [];
  for (const alt of range.split("||")) {
    const tokens = alt.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    if (tokens.length === 1 && tokens[0] === "*") {
      sets.push([]);
      continue;
    }
    const set: Comparator[] = [];
    for (const t of tokens) {
      const c = comparator(t);
      if (!c) return null;
      set.push(...c);
    }
    sets.push(set);
  }
  return sets;
}

/** Whether `version` is in `range`; null when either does not parse. */
export function satisfiesRange(version: string, range: string): boolean | null {
  const v = parseSemver(version);
  const sets = parseRange(range);
  if (!v || !sets) return null;
  return sets.some((set) => set.every((c) => c(v)));
}
