/**
 * The roadmap's dependency graph (PLAT-01, docs/roadmap/01-platform.md). The **Dependencies** line of each task block in
 * docs/roadmap/0*.md is authoritative; the README's layer map and SPRINTS.md's order are generated from those lines.
 * Pure text in, findings out (no file access), so the vitest (`tools/test/roadmapGraph.test.ts`) and any later
 * generator share one parse. Each check returns a list of problems, empty when the documents agree.
 */

export const SIZE_POINTS = { S: 1, M: 3, L: 7 } as const;
export type Size = keyof typeof SIZE_POINTS;

export interface Task {
  id: string;
  title: string;
  file: string;
  /** The 1-based line of the task's `### ` heading. */
  line: number;
  /** Prerequisite ids in the order written, de-duplicated; a range stays as written (`PLAT-05..PLAT-16`). */
  deps: string[];
  /** Whether the block has a Dependencies line at all. */
  hasDeps: boolean;
  /** How many Dependencies bullets the block has (more than one is a problem: which one is authoritative?). */
  depLines: number;
  /** Id-shaped tokens on the Dependencies line whose prefix is no task prefix and on no allowlist (a typo: `PALT-25`). */
  unknown: string[];
  size: Size | null;
  /**
   * Which of three kinds the block is. **active**: in the map and in a sprint. **future**: a future-scope block (MENU-10..
   * MENU-16 by R1), written `**Dependencies (if reopened):**`. **dropped**: a task a ruling dropped (PLAT-27, PLAT-37,
   * OPT-08 by R7, 2026-10-01), which keeps its id (the README's convention): its title begins "(dropped)", a
   * `**Dropped:**` line names the ruling, and it writes `**Dependencies (if reopened):**` as a future-scope block does.
   * Neither a future nor a dropped block is in the map or a sprint, and no active task may name one.
   */
  kind: TaskKind;
  /** `kind === 'future'`. */
  future: boolean;
  /** Whether the Dependencies line is written `**Dependencies (if reopened):**`. */
  reopened: boolean;
  /** Whether the block has a `**Dropped:**` line, and the ruling (`R7`) that line names (null when none or no line). */
  hasDroppedLine: boolean;
  droppedBy: string | null;
  /** Whether the title begins "(dropped)". */
  titleDropped: boolean;
}

export type TaskKind = 'active' | 'future' | 'dropped';

const HEADING = /^### ([A-Z]+-\d+[a-z]?) -- (.*)$/;
const DEPS = /\*\*Dependencies( \(if reopened\))?:\*\*/;
/** A Dropped line is a bullet that begins with the label; the label met inside other prose (PLAT-01's own text) is not one. */
const DROPPED = /^\*\*Dropped:\*\*/;
const RULING = /\bR\d+\b/;
/** Where the dependency text ends: the next bold label on the same bullet (Size, Then) or the bullet's end. */
const DEPS_END = /\*\*(Size|Then):\*\*/;
const SIZE = /\*\*Size:\*\*\s*([SML])\b/;
const ID = /\b([A-Z]+)-(\d+)([a-z]?)\b/g;
/**
 * A range: `PLAT-05..PLAT-16` (or `PLAT-05..16`), `PLAT-05–PLAT-16` (an en or em dash), `PLAT-05 to PLAT-16`. The
 * dash and "to" forms need the second id whole, so that prose ("SVC-01 to 16 players") is never read as a range.
 */
const RANGE = /\b([A-Z]+)-(\d+)([a-z]?)(?:\.\.(?:([A-Z]+)-)?|\s*[–—]\s*([A-Z]+)-| to ([A-Z]+)-)(\d+)([a-z]?)\b/g;
/** The slash shorthand: `PLAT-22/23`, `OPT-05c/f`, `SVC-12a/b`, `PLAT-19a/b/c` -- each member a number or a letter. */
const SLASH = /\b([A-Z]+)-(\d+)([a-z]?)((?:\/(?:\d+[a-z]?|[a-z]))+)\b/g;
/** Anything shaped like an id, its prefix possibly hyphenated (`MENU-OC-4`): held against the task prefixes. */
const ID_SHAPED = /\b([A-Z][A-Z-]*)-(\d+)[a-z]?\b/g;
/**
 * Id-shaped names that are legitimately on a Dependencies line and are not tasks: the owner's calls. On the real lines
 * (2026-10-01) only `OC-n` occurs (BOOT-11 and ONL-05: "OC-2 is ruled ..."); the README's other owner-call families,
 * `MENU-OC-n` and `OWNER-SVC-n`, are listed so that naming one is not read as a typo. Rulings (`R1`, `R293`) are not
 * id-shaped. Any other id-shaped token whose prefix is no task prefix is a problem.
 */
export const NOT_TASK_PREFIXES: ReadonlySet<string> = new Set(['OC', 'MENU-OC', 'OWNER-SVC']);

const key = (t: Pick<Task, 'id' | 'file' | 'line'>): string => `${t.id} (${t.file}:${t.line})`;

/** The active tasks: neither future scope nor dropped. */
export const activeTasks = (tasks: Task[]): Task[] => tasks.filter((t) => t.kind === 'active');

/** A task block's bullets, each with its continuation lines joined into one line. */
function bullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (l.startsWith('- ')) out.push(l.slice(2).trim());
    else if (/^\s+\S/.test(l) && out.length) out[out.length - 1] += ` ${l.trim()}`;
  }
  return out;
}

/**
 * The task ids (and ranges, written back as `A-n..A-m`) named in a dependency text; a slash shorthand gives every
 * member. A `..` range whose ends are of two prefixes is kept as written (`A-n..B-m`) for checkGraph to refuse. An id
 * is counted when its prefix is a task prefix; an id-shaped token of any other prefix not in NOT_TASK_PREFIXES is
 * pushed to `unknown`. An id split by a line wrap (`PLAT-`, then `25` on the next line: joined by the bullet with a
 * space) is joined first.
 */
export function idsIn(text: string, prefixes: ReadonlySet<string>, unknown: string[] = []): string[] {
  const out: string[] = [];
  const add = (s: string): void => { if (!out.includes(s)) out.push(s); };
  let rest = text.replace(/\b([A-Z]+)-\s+(\d)/g, '$1-$2');
  rest = rest.replace(RANGE, (m: string, p1: string, n1: string, s1: string, pa?: string, pb?: string, pc?: string,
    n2?: string, s2?: string) => {
    const p2 = pa ?? pb ?? pc;
    if (!prefixes.has(p1)) return m;
    // A `..` range across two prefixes is kept as written, for checkGraph to refuse; the dash and "to" forms across
    // two prefixes stay prose (two ids).
    if (pa !== undefined && pa !== p1) { add(`${p1}-${n1}${s1}..${pa}-${n2}${s2}`); return ' '; }
    if (p2 !== undefined && p2 !== p1) return m;
    add(`${p1}-${n1}${s1}..${p1}-${n2}${s2}`);
    return ' ';
  });
  rest = rest.replace(SLASH, (m: string, p: string, n: string, s: string, tail: string) => {
    if (!prefixes.has(p)) return m;
    add(`${p}-${n}${s}`);
    for (const part of tail.split('/').slice(1)) add(/^\d/.test(part) ? `${p}-${part}` : `${p}-${n}${part}`);
    return ' ';
  });
  // An id inside a hyphenated name (`SVC-0` in `OWNER-SVC-0`) is not a task id.
  for (const m of rest.matchAll(ID)) if (prefixes.has(m[1]!) && rest[m.index - 1] !== '-') add(m[0]);
  for (const m of rest.matchAll(ID_SHAPED)) {
    const prefix = m[1]!;
    if (prefixes.has(prefix) || NOT_TASK_PREFIXES.has(prefix)) continue;
    if (!unknown.includes(m[0])) unknown.push(m[0]);
  }
  return out;
}

/**
 * One segment file's task blocks. `prefixes` are the task prefixes ids are recognised by; by default the prefixes of
 * this file's own headings (parseRoadmap passes every segment's).
 */
export function parseSegment(text: string, file: string, prefixes?: ReadonlySet<string>): Task[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const heads: Array<{ at: number; id: string; title: string }> = [];
  lines.forEach((l, at) => {
    const m = HEADING.exec(l);
    if (m) heads.push({ at, id: m[1]!, title: m[2]! });
  });
  const known = prefixes ?? new Set(heads.map((h) => h.id.split('-')[0]!));
  return heads.map((h, i) => {
    let end = i + 1 < heads.length ? heads[i + 1]!.at : lines.length;
    for (let j = h.at + 1; j < end; j++) if (/^#{1,3} /.test(lines[j]!)) { end = j; break; }
    const bl = bullets(lines.slice(h.at + 1, end));
    const depBullets = bl.filter((b) => DEPS.test(b));
    const depBullet = depBullets[0];
    const sizeBullet = bl.find((b) => SIZE.test(b));
    let deps: string[] = [];
    const unknown: string[] = [];
    let reopened = false;
    if (depBullet !== undefined) {
      const m = DEPS.exec(depBullet)!;
      reopened = m[1] !== undefined;
      const after = depBullet.slice(m.index + m[0].length);
      const stop = DEPS_END.exec(after);
      deps = idsIn(stop ? after.slice(0, stop.index) : after, known, unknown);
    }
    const size = sizeBullet ? (SIZE.exec(sizeBullet)![1] as Size) : null;
    const droppedBullet = bl.find((b) => DROPPED.test(b));
    const droppedBy = droppedBullet === undefined
      ? null : RULING.exec(droppedBullet.slice(DROPPED.exec(droppedBullet)!.index))?.[0] ?? null;
    const titleDropped = /^\(dropped\)/.test(h.title);
    const kind: TaskKind = titleDropped || droppedBullet !== undefined ? 'dropped' : reopened ? 'future' : 'active';
    return {
      id: h.id, title: h.title, file, line: h.at + 1, deps, hasDeps: depBullet !== undefined, depLines: depBullets.length,
      unknown, size, kind, future: kind === 'future', reopened, hasDroppedLine: droppedBullet !== undefined, droppedBy,
      titleDropped,
    };
  });
}

/** Every segment's tasks, and a problem for each id defined twice. */
export function parseRoadmap(files: Array<{ file: string; text: string }>): { tasks: Task[]; problems: string[] } {
  const prefixes = new Set<string>();
  for (const { text } of files) for (const l of text.split(/\r?\n/)) {
    const m = HEADING.exec(l);
    if (m) prefixes.add(m[1]!.split('-')[0]!);
  }
  const tasks = files.flatMap(({ file, text }) => parseSegment(text, file, prefixes));
  const problems: string[] = [];
  const first = new Map<string, Task>();
  for (const t of tasks) {
    const f = first.get(t.id);
    if (f) problems.push(`${t.id} is defined twice: ${f.file}:${f.line} and ${t.file}:${t.line}`);
    else first.set(t.id, t);
  }
  return { tasks, problems };
}

const idParts = (id: string): { prefix: string; n: number; suffix: string } | null => {
  const m = /^([A-Z]+)-(\d+)([a-z]?)$/.exec(id);
  return m ? { prefix: m[1]!, n: Number(m[2]), suffix: m[3]! } : null;
};

/**
 * The order of two ids of one prefix: by number, then the bare id before its letters, `a` before `b` (PLAT-19 <
 * PLAT-19a < PLAT-19b < PLAT-20). A range is every id of its prefix between its two ends in this order, both inclusive.
 */
export function compareIds(a: string, b: string): number {
  const x = idParts(a)!, y = idParts(b)!;
  return x.n - y.n || (x.suffix < y.suffix ? -1 : x.suffix > y.suffix ? 1 : 0);
}

export interface Graph {
  problems: string[];
  /** Each active task's prerequisites, ranges expanded. */
  deps: Map<string, string[]>;
  /** Each active task's layer: 0 with no prerequisite, else one above its deepest prerequisite (absent on a cycle). */
  layers: Map<string, number>;
}

/**
 * Expands ranges, then fails on a missing line or size, a dangling id, a range reversed or across two prefixes, a
 * reference to a future-scope or dropped task, a dropped block not written as one (its ruling line, its title mark, its
 * "if reopened" Dependencies), and a cycle.
 */
export function checkGraph(tasks: Task[]): Graph {
  const problems: string[] = [];
  const byId = new Map<string, Task>();
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t);
  for (const t of byId.values()) {
    if (t.kind !== 'dropped') continue;
    if (!t.hasDroppedLine) problems.push(`${key(t)} is dropped (its title says so) but has no **Dropped:** line naming the ruling`);
    else if (t.droppedBy === null) problems.push(`${key(t)} has a **Dropped:** line that names no ruling (R<n>)`);
    if (!t.titleDropped) problems.push(`${key(t)} has a **Dropped:** line but its title does not begin "(dropped)"`);
    if (!t.hasDeps) problems.push(`${key(t)} is dropped but has no **Dependencies (if reopened):** line`);
    else if (!t.reopened) {
      problems.push(`${key(t)} is dropped but writes **Dependencies:**, not **Dependencies (if reopened):**`);
    }
  }
  const active = activeTasks([...byId.values()]);
  const deps = new Map<string, string[]>();
  for (const t of active) {
    if (!t.hasDeps) problems.push(`${key(t)} has no Dependencies line`);
    if (t.depLines > 1) problems.push(`${key(t)} has ${t.depLines} Dependencies lines`);
    for (const u of t.unknown) problems.push(`${key(t)} names ${u}, whose prefix ${u.replace(/-\d+[a-z]?$/, '')} is no task prefix`);
    if (!t.size) problems.push(`${key(t)} has no Size`);
    const out: string[] = [];
    const add = (id: string): void => { if (!out.includes(id)) out.push(id); };
    for (const d of t.deps) {
      const r = /^(.+)\.\.(.+)$/.exec(d);
      if (r) {
        const ends = [r[1]!, r[2]!];
        const missing = ends.find((e) => !byId.has(e));
        if (missing) { problems.push(`${key(t)} names ${d}, whose end ${missing} is no task`); continue; }
        const [lo, hi] = ends as [string, string];
        const prefix = idParts(lo)!.prefix;
        if (idParts(hi)!.prefix !== prefix) { problems.push(`${key(t)} names ${d}, whose ends are of two prefixes`); continue; }
        if (compareIds(lo, hi) > 0) { problems.push(`${key(t)} names ${d}, whose ends are reversed`); continue; }
        for (const u of byId.values()) {
          if (idParts(u.id)?.prefix === prefix && compareIds(u.id, lo) >= 0 && compareIds(u.id, hi) <= 0) add(u.id);
        }
        continue;
      }
      if (!byId.has(d)) problems.push(`${key(t)} names ${d}, which is no task`);
      else add(d);
    }
    for (const d of out) {
      const u = byId.get(d)!;
      if (u.kind === 'future') problems.push(`${key(t)} names ${d}, which is future scope`);
      else if (u.kind === 'dropped') problems.push(`${key(t)} names ${d}, which is dropped (${u.droppedBy ?? 'no ruling named'})`);
    }
    deps.set(t.id, out.filter((d) => byId.get(d)!.kind === 'active'));
  }

  // Cycles: a depth-first walk in file order; each cycle reported once, from where the walk first closed it.
  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];
  const cycles = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 'open');
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      const s = state.get(d);
      if (s === 'open') {
        const cyc = [...stack.slice(stack.indexOf(d)), d];
        const sig = [...cyc.slice(0, -1)].sort().join(' ');
        if (!cycles.has(sig)) { cycles.add(sig); problems.push(`cycle: ${cyc.join(' -> ')}`); }
      } else if (s === undefined) visit(d);
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const t of active) if (!state.has(t.id)) visit(t.id);

  const layers = new Map<string, number>();
  if (cycles.size === 0) {
    const layer = (id: string): number => {
      const have = layers.get(id);
      if (have !== undefined) return have;
      const ds = deps.get(id) ?? [];
      const l = ds.length ? 1 + Math.max(...ds.map(layer)) : 0;
      layers.set(id, l);
      return l;
    };
    for (const t of active) layer(t.id);
  }
  return { problems, deps, layers };
}

/** The README's "The cross-segment dependency map": the fenced block's `Ln  ids...` lines and their continuations. */
export function parseLayerMap(readme: string): { layers: Map<string, number>; problems: string[] } {
  const layers = new Map<string, number>();
  const problems: string[] = [];
  const lines = readme.replace(/\r\n/g, '\n').split('\n');
  const head = lines.findIndex((l) => /^## The cross-segment dependency map\s*$/.test(l));
  if (head < 0) return { layers, problems: ['no "## The cross-segment dependency map" section'] };
  const open = lines.findIndex((l, i) => i > head && l.startsWith('```'));
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  if (open < 0 || close < 0) return { layers, problems: ['the dependency map has no fenced block'] };
  let current = -1;
  for (const l of lines.slice(open + 1, close)) {
    const m = /^\s*L(\d+)\s+(.*)$/.exec(l);
    let ids: string;
    if (m) { current = Number(m[1]); ids = m[2]!; } else ids = l;
    for (const id of ids.trim().split(/\s+/).filter(Boolean)) {
      if (current < 0) { problems.push(`${id} stands before the map's first layer`); continue; }
      if (layers.has(id)) problems.push(`${id} is in the map twice (L${layers.get(id)} and L${current})`);
      else layers.set(id, current);
    }
  }
  return { layers, problems };
}

/** The computed layers against the map's: a wrong layer, a task missing from the map, a map id that is no active task. */
export function compareLayers(computed: ReadonlyMap<string, number>, map: ReadonlyMap<string, number>): string[] {
  const problems: string[] = [];
  for (const [id, l] of computed) {
    const m = map.get(id);
    if (m === undefined) problems.push(`${id} (L${l} by its Dependencies line) is missing from the map`);
    else if (m !== l) problems.push(`${id} sits in L${m} in the map; its Dependencies line puts it in L${l}`);
  }
  for (const [id, m] of map) if (!computed.has(id)) problems.push(`${id} is in the map (L${m}) but is no active task`);
  // The wrong layers first, then the missing, then the extra: the order a reader fixes them in.
  const rank = (p: string): number => (p.includes(' sits in ') ? 0 : p.includes('missing') ? 1 : 2);
  return problems.sort((a, b) => rank(a) - rank(b));
}

const ALL_IDS = /\b[A-Z]+-\d+[a-z]?\b/g;
const cells = (row: string): string[] => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const bare = (c: string): string => c.replace(/\*/g, '').trim();

export interface Count { tasks: number; points: number }

export interface Sprint {
  n: number;
  /** The `**Seat:**` value, null when the block has no Seat line. */
  seat: string | null;
  /** The sprints named on `**After:**` (`none` is empty), null when the block has no After line. */
  after: number[] | null;
  ids: string[];
  stated: Count | null;
}

export interface Sprints {
  sprints: Sprint[];
  windows: Array<{ id: string; size: string }>;
  /** "The two seats" table: each seat's sprints in its lane's order, and its stated tasks and points. */
  seats: Array<{ seat: string; sprints: number[] } & Count>;
  /** The order table's rows: a sprint (with its Seat and After cells), the owner windows, a seat's foot row, the total. */
  table: Array<{ row: number | 'windows' | 'total' | { seat: string }; seat: string; after: number[] } & Count>;
  /** The whole text, for the prose statements of the totals (SPRINTS_PROSE). */
  raw: string;
}

const numbers = (s: string): number[] => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));

/** SPRINTS.md's sprint blocks (Seat, After, Tasks), the owner windows, the two seats, the order table, the prose totals. */
export function parseSprints(text: string): Sprints {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: Sprints = {
    sprints: [], windows: [], seats: [], table: [], raw: text,
  };
  let section = '';
  let sprint: Sprint | null = null;
  let orderCols: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith('## ')) { section = l.slice(3).trim(); sprint = null; continue; }
    const s = /^### Sprint (\d+)\b/.exec(l);
    if (s) { sprint = { n: Number(s[1]), seat: null, after: null, ids: [], stated: null }; out.sprints.push(sprint); continue; }
    if (sprint && l.startsWith('- ')) {
      let b = l;
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) b += ` ${lines[++i]!.trim()}`;
      const seat = /\*\*Seat:\*\*\s*([^.*]+?)\s*\./.exec(b);
      if (seat) sprint.seat = seat[1]!;
      const after = /\*\*After:\*\*\s*([^*]*)$/.exec(b);
      if (after) sprint.after = /^none\b/.test(after[1]!.trim()) ? [] : numbers(after[1]!);
      const m = /^- \*\*Tasks \((\d+), (\d+) pts\):\*\*(.*)$/.exec(b);
      if (m) {
        sprint.stated = { tasks: Number(m[1]), points: Number(m[2]) };
        sprint.ids = [...m[3]!.matchAll(ALL_IDS)].map((x) => x[0]);
      }
      continue;
    }
    if (!l.startsWith('|') || /^\|[-| :]+\|$/.test(l.trim())) continue;
    const c = cells(l);
    if (section === 'The owner windows') {
      const m = /^([A-Z]+-\d+[a-z]?) -- /.exec(c[0]!);
      if (m) out.windows.push({ id: m[1]!, size: bare(c[1] ?? '') });
    }
    if (section === 'The two seats' && c.length >= 5 && /^\d+$/.test(bare(c[3]!)) && /^\d+$/.test(bare(c[4]!))) {
      out.seats.push({ seat: bare(c[0]!), sprints: numbers(c[2]!), tasks: Number(bare(c[3]!)), points: Number(bare(c[4]!)) });
    }
    if (section === 'The order, in one table') {
      if (!orderCols) { orderCols = c.map(bare); continue; }
      const cols = orderCols;
      const col = (name: string): string => bare(c[cols.indexOf(name)] ?? '');
      const tasks = col('Tasks'), pts = col('Pts');
      if (!/^\d+$/.test(tasks) || !/^\d+$/.test(pts)) continue;
      const num = col('#'), name = col('Name');
      let row: Sprints['table'][number]['row'] | null = null;
      if (/^\d+$/.test(num)) row = Number(num);
      else if (name === 'Total') row = 'total';
      else if (name === 'The owner windows') row = 'windows';
      else if (num === '') row = { seat: name };
      if (row !== null) out.table.push({ row, seat: col('Seat'), after: numbers(col('After')), tasks: Number(tasks), points: Number(pts) });
    }
  }
  return out;
}

/** What the lines make, for the prose statements of the totals. */
export interface Facts {
  tasks: number; points: number; S: number; M: number; L: number; future: number; dropped: number;
  /** The sprint sections: how many, the first and last numbers. */
  sprints: number; first: number; last: number;
  /** Each seat's points, in the two-seats table's order (the seats that carry sprints). */
  lanes: number[];
}

/** A prose statement of a total: what it says, its pattern (whitespace already folded to one space), the facts it states. */
export interface ProseRule { what: string; re: RegExp; facts: (f: Facts) => number[] }

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
/** A number written in digits or as a word ("seven"); NaN for anything else. */
const asNumber = (s: string): number => (/^\d+$/.test(s) ? Number(s) : WORDS.includes(s.toLowerCase()) ? WORDS.indexOf(s.toLowerCase()) : NaN);

/** Every statement of the totals in SPRINTS.md's prose; each must be found, and must equal what the lines make. */
export const SPRINTS_PROSE: readonly ProseRule[] = [
  { what: 'the backlog\'s N active tasks', re: /backlog's (\w+) active tasks/, facts: (f) => [f.tasks] },
  { what: 'the totals are the same N tasks and P points', re: /the same (\w+) tasks and (\w+) points/, facts: (f) => [f.tasks, f.points] },
  { what: 'the active backlog is P points (s S, m M, l L)', re: /active backlog is (\w+) points \((\w+) S, (\w+) M, (\w+) L\)/,
    facts: (f) => [f.points, f.S, f.M, f.L] },
  { what: 'the N future-scope ids', re: /the (\w+) future-scope ids/, facts: (f) => [f.future] },
  { what: 'the N dropped tasks', re: /the (\w+) dropped tasks?\b/, facts: (f) => [f.dropped] },
  { what: 'N sprints (first-last)', re: /(\w+) sprints \((\d+)-(\d+)\)/, facts: (f) => [f.sprints, f.first, f.last] },
  // One seat carrying every sprint (OT.R40, 2026-10-07) writes it "the lane comes out at A points".
  { what: 'the lanes come out at A and B points', re: /lanes? comes? out at (\w+)(?: and (\w+))? points/, facts: (f) => f.lanes },
];

/** Every statement of the totals in the README's prose (the segment table and the size line are checked as tables). */
export const README_PROSE: readonly ProseRule[] = [
  { what: 'N moved to future scope', re: /(\w+) moved to future scope/, facts: (f) => [f.future] },
  { what: 'the N dropped tasks', re: /the (\w+) dropped tasks?\b/, facts: (f) => [f.dropped] },
];

/** Each rule found in `text` (wraps folded) and equal to the facts; a problem for each one missing or different. */
export function proseProblems(text: string, rules: readonly ProseRule[], facts: Facts): string[] {
  const flat = text.replace(/\s+/g, ' ');
  const problems: string[] = [];
  for (const r of rules) {
    const m = r.re.exec(flat);
    if (!m) { problems.push(`the prose "${r.what}" is not found`); continue; }
    const got = m.slice(1).filter((g) => g !== undefined).map(asNumber), want = r.facts(facts);
    if (got.join() !== want.join()) problems.push(`the prose "${r.what}" states ${got.join(', ')}; the lines make ${want.join(', ')}`);
  }
  return problems;
}

const points = (ts: Array<Task | undefined>): number => ts.reduce((a, t) => a + (t?.size ? SIZE_POINTS[t.size] : 0), 0);

/** What a count statement in prose is held to: each sprint's and each seat's tasks and points, the drop, the total. */
export interface CountContext {
  sprints: ReadonlyMap<number, Count>;
  seats: ReadonlyMap<string, Count>;
  droppedBySize: Readonly<Record<Size, number>>;
  total: Count;
}

/**
 * A count statement that may appear any number of times: every match (the text's whitespace folded) is checked. `check`
 * gives the numbers the match states and the numbers the lines make, or a reason the match names nothing known.
 */
export interface CountRule {
  what: string;
  re: RegExp;
  check: (m: RegExpExecArray, c: CountContext) => { got: number[]; want: number[] } | string;
}

const tally = (c: Count | undefined, n: number): number[] => (c ? [c.tasks, c.points].slice(0, n) : []);

/**
 * The present-tense count statements of SPRINTS.md (review finding 7, 2026-10-01). Matched, wherever they stand:
 * "sprint N is T tasks (and P points)" and "sprint N holds T tasks (and P points)"; "<seat>'s lane (is) T tasks and P
 * points"; "<seat>'s A, B and C are P points" (the sum of those sprints' points). Left alone on purpose: dated history
 * in the past tense ("sprint 13 held 17", "the totals were then 150 tasks and 458 points", "(17 tasks and 33 points
 * before)", "it read ..."), which states what was true then; and the bold-label lines and tables, checked elsewhere.
 * A statement of a current count must be written in one of these forms, so that it is checked.
 */
export const SPRINTS_COUNTS: readonly CountRule[] = [
  {
    what: 'sprint N is/holds T tasks (and P points)', re: /\bsprint (\d+) (?:is|holds) (\w+) tasks(?: and (\w+) points)?/gi,
    check: (m, c) => {
      const sp = c.sprints.get(Number(m[1]));
      if (!sp) return `names sprint ${m[1]}, which has no section`;
      const got = [m[2]!, ...(m[3] ? [m[3]] : [])].map(asNumber);
      return { got, want: tally(sp, got.length) };
    },
  },
  {
    what: '<seat>\'s lane T tasks and P points', re: /\b([A-Z]\w*)'s lane(?: is)? (\w+) tasks and (\w+) points/g,
    check: (m, c) => {
      const seat = c.seats.get(m[1]!);
      return seat ? { got: [m[2]!, m[3]!].map(asNumber), want: tally(seat, 2) } : `names the seat ${m[1]}, which carries no sprint`;
    },
  },
  {
    what: '<seat>\'s A, B and C are P points', re: /\b([A-Z]\w*)'s ((?:\d+, )*\d+ and \d+) are (\w+) points/g,
    check: (m, c) => {
      const ns = numbers(m[2]!);
      const missing = ns.find((n) => !c.sprints.has(n));
      if (missing !== undefined) return `names sprint ${missing}, which has no section`;
      return { got: [asNumber(m[3]!)], want: [ns.reduce((a, n) => a + c.sprints.get(n)!.points, 0)] };
    },
  },
];

/**
 * The README's present-tense count statements of a drop (review finding 7): "dropped N <S|M|L> tasks" (how many dropped
 * tasks have that size) and "went from ... to T tasks and P points" (the active totals now; the "from" half is history
 * and is not checked).
 */
export const README_COUNTS: readonly CountRule[] = [
  {
    what: 'dropped N <size> tasks', re: /\bdropped (\w+) ([SML]) tasks/g,
    check: (m, c) => ({ got: [asNumber(m[1]!)], want: [c.droppedBySize[m[2] as Size]] }),
  },
  {
    what: 'went from ... to T tasks and P points', re: /from \d+ tasks and \d+ points to (\w+) tasks and (\w+) points/g,
    check: (m, c) => ({ got: [m[1]!, m[2]!].map(asNumber), want: [c.total.tasks, c.total.points] }),
  },
];

/** Every match of every count rule in `text` (wraps folded) held to the context; a problem for each one that differs. */
export function countProblems(text: string, rules: readonly CountRule[], c: CountContext): string[] {
  const flat = text.replace(/\s+/g, ' ');
  const problems: string[] = [];
  for (const r of rules) {
    for (const m of flat.matchAll(r.re)) {
      const res = r.check(m as RegExpExecArray, c);
      const head = `the prose "${r.what}" ("${m[0]}")`;
      if (typeof res === 'string') problems.push(`${head} ${res}`);
      else if (res.got.join() !== res.want.join()) problems.push(`${head} states ${res.got.join(', ')}; the lines make ${res.want.join(', ')}`);
    }
  }
  return problems;
}

const droppedBySize = (ts: Task[]): Record<Size, number> => {
  const d = ts.filter((t) => t.kind === 'dropped');
  return { S: d.filter((t) => t.size === 'S').length, M: d.filter((t) => t.size === 'M').length, L: d.filter((t) => t.size === 'L').length };
};
const sameSet = (a: number[], b: number[]): boolean => [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();

/**
 * SPRINTS.md against the lines. Sprint numbers are names, not a time order (the two seats, 2026-10-01): the order is
 * the After lines, followed transitively. Checked: every sprint has a Seat and an After line, After names only sprints
 * that exist and has no cycle; every active task placed exactly once (a sprint or an owner window); every prerequisite
 * in the same sprint or in a sprint reachable through After (an owner window constrains nothing) -- the declared
 * edges must suffice, they need not be minimal; each seat's lane lists exactly its sprints, none before a sprint it
 * comes after; and every stated count, point sum and total -- the blocks, the two-seats table, the order table's rows
 * (Seat, Tasks, Pts, After) and foot rows, the prose -- equal to what the tasks' sizes make.
 */
export function checkSprints(tasks: Task[], s: Sprints): string[] {
  const problems: string[] = [];
  const byId = new Map<string, Task>();
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t);
  const active = activeTasks([...byId.values()]);
  const graph = checkGraph(tasks);
  const sprintBy = new Map(s.sprints.map((sp) => [sp.n, sp]));

  // Seat and After on every block; After names real sprints; the After graph is acyclic.
  for (const sp of s.sprints) {
    if (sp.seat === null) problems.push(`sprint ${sp.n} has no Seat`);
    if (sp.after === null) problems.push(`sprint ${sp.n} has no After`);
    for (const a of sp.after ?? []) if (!sprintBy.has(a)) problems.push(`sprint ${sp.n} comes after sprint ${a}, which does not exist`);
  }
  const state = new Map<number, 'open' | 'done'>();
  const stack: number[] = [];
  const visit = (n: number): void => {
    state.set(n, 'open');
    stack.push(n);
    for (const a of sprintBy.get(n)?.after ?? []) {
      if (!sprintBy.has(a)) continue;
      if (state.get(a) === 'open') {
        problems.push(`the After lines cycle: ${[...stack.slice(stack.indexOf(a)), a].map((x) => `sprint ${x}`).join(' -> ')}`);
      } else if (!state.has(a)) visit(a);
    }
    stack.pop();
    state.set(n, 'done');
  };
  for (const sp of s.sprints) if (!state.has(sp.n)) visit(sp.n);
  /** The sprints a sprint comes after, transitively. */
  const reach = (n: number): Set<number> => {
    const seen = new Set<number>();
    const todo = [...(sprintBy.get(n)?.after ?? [])];
    while (todo.length) {
      const a = todo.pop()!;
      if (seen.has(a)) continue;
      seen.add(a);
      todo.push(...(sprintBy.get(a)?.after ?? []));
    }
    return seen;
  };

  const placed = new Map<string, string[]>();
  const sprintOf = new Map<string, number>();
  const place = (id: string, where: string): void => { placed.set(id, [...(placed.get(id) ?? []), where]); };
  for (const sp of s.sprints) for (const id of sp.ids) { place(id, `sprint ${sp.n}`); if (!sprintOf.has(id)) sprintOf.set(id, sp.n); }
  for (const w of s.windows) place(w.id, 'the owner windows');
  for (const [id, where] of placed) {
    const t = byId.get(id);
    if (!t) problems.push(`${id} is placed (${where.join(', ')}) but is no task`);
    else if (t.kind !== 'active') {
      problems.push(`${id} is placed (${where.join(', ')}) but is ${t.kind === 'future' ? 'future scope' : 'dropped'}`);
    }
    if (where.length > 1) problems.push(`${id} is placed ${where.length} times (${where.join(', ')})`);
  }
  for (const t of active) if (!placed.has(t.id)) problems.push(`${t.id} is in no sprint and no owner window`);

  const windows = new Set(s.windows.map((w) => w.id));
  for (const sp of s.sprints) {
    const before = reach(sp.n);
    for (const id of sp.ids) for (const d of graph.deps.get(id) ?? []) {
      if (windows.has(d)) continue;
      const ds = sprintOf.get(d);
      if (ds === undefined) problems.push(`sprint ${sp.n} holds ${id} before its prerequisite ${d} (in no sprint)`);
      else if (ds !== sp.n && !before.has(ds)) {
        problems.push(`sprint ${sp.n} holds ${id}, whose prerequisite ${d} is in sprint ${ds}, which sprint ${sp.n} does not come after`);
      }
    }
  }

  for (const w of s.windows) {
    const t = byId.get(w.id);
    if (t?.size && w.size !== t.size) problems.push(`the owner window ${w.id} states size ${w.size}; its task line says ${t.size}`);
  }
  const made = (ids: string[]): Count => ({ tasks: ids.length, points: points(ids.map((i) => byId.get(i))) });
  const fmt = (x: Count): string => `(${x.tasks}, ${x.points} pts)`;
  const same = (a: Count, b: Count): boolean => a.tasks === b.tasks && a.points === b.points;
  for (const sp of s.sprints) {
    const m = made(sp.ids);
    if (!sp.stated) problems.push(`sprint ${sp.n} has no "**Tasks (n, p pts):**" line`);
    else if (!same(sp.stated, m)) problems.push(`sprint ${sp.n} states ${fmt(sp.stated)}; its tasks make ${fmt(m)}`);
    const row = s.table.find((r) => r.row === sp.n);
    if (!row) { problems.push(`sprint ${sp.n} has no row in the order table`); continue; }
    if (!same(row, m)) problems.push(`the order table's sprint ${sp.n} states ${fmt(row)}; its tasks make ${fmt(m)}`);
    if (sp.seat !== null && row.seat !== sp.seat) {
      problems.push(`the order table's sprint ${sp.n} states seat ${row.seat}; its block says ${sp.seat}`);
    }
    if (sp.after !== null && !sameSet(row.after, sp.after)) {
      problems.push(`the order table's sprint ${sp.n} states After ${row.after.join(', ') || '--'}; ` +
        `its block says ${sp.after.join(', ') || 'none'}`);
    }
  }
  for (const r of s.table) if (typeof r.row === 'number' && !sprintBy.has(r.row)) {
    problems.push(`the order table has a row for sprint ${r.row}, which has no section`);
  }

  // The seats: the two-seats table and the order table's foot rows against the blocks.
  const seatNames = [...new Set(s.sprints.map((sp) => sp.seat).filter((x): x is string => x !== null))];
  const seatMade = (seat: string): Count => made(s.sprints.filter((sp) => sp.seat === seat).flatMap((sp) => sp.ids));
  const wm = made(s.windows.map((w) => w.id));
  for (const seat of seatNames) {
    const lane = s.seats.find((r) => r.seat === seat);
    const mine = s.sprints.filter((sp) => sp.seat === seat).map((sp) => sp.n);
    if (!lane) problems.push(`the two seats table has no row for ${seat}`);
    else {
      if (!sameSet(lane.sprints, mine)) {
        problems.push(`the two seats table gives ${seat} sprints ${lane.sprints.join(', ')}; the blocks give ${mine.join(', ')}`);
      }
      if (!same(lane, seatMade(seat))) {
        problems.push(`the two seats table states ${seat} ${fmt(lane)}; the blocks make ${fmt(seatMade(seat))}`);
      }
      lane.sprints.forEach((n, i) => {
        for (const later of lane.sprints.slice(i + 1)) if (reach(n).has(later)) {
          problems.push(`${seat}'s lane lists sprint ${n} before sprint ${later}, which it comes after`);
        }
      });
    }
    const foot = s.table.find((r) => typeof r.row === 'object' && r.row.seat === seat);
    if (!foot) problems.push(`the order table has no foot row for ${seat}`);
    else if (!same(foot, seatMade(seat))) {
      problems.push(`the order table's ${seat} row states ${fmt(foot)}; the blocks make ${fmt(seatMade(seat))}`);
    }
  }
  for (const r of s.seats) {
    if (seatNames.includes(r.seat)) continue;
    if (r.sprints.length) problems.push(`the two seats table has a row for ${r.seat}, whom no sprint names`);
    // A seat that carries no roadmap sprint states none (OT.R40: Chris's own contributions, outside the roadmap).
    else if (r.tasks === 0 && r.points === 0) continue;
    else if (!same(r, wm)) problems.push(`the two seats table states ${r.seat} ${fmt(r)}; the owner windows make ${fmt(wm)}`);
  }
  for (const r of s.table) if (typeof r.row === 'object' && !seatNames.includes(r.row.seat)) {
    problems.push(`the order table has a foot row for ${r.row.seat}, whom no sprint names`);
  }
  const wrow = s.table.find((r) => r.row === 'windows');
  if (!wrow) problems.push('the order table has no owner-windows row');
  else if (!same(wrow, wm)) problems.push(`the order table's owner windows state ${fmt(wrow)}; the window tasks make ${fmt(wm)}`);
  const all = made(active.map((t) => t.id));
  const trow = s.table.find((r) => r.row === 'total');
  if (!trow) problems.push('the order table has no total row');
  else if (!same(trow, all)) problems.push(`the order table's total states ${fmt(trow)}; the lines make ${fmt(all)}`);
  const by = (z: Size): number => active.filter((t) => t.size === z).length;
  const ns = s.sprints.map((sp) => sp.n);
  const facts: Facts = {
    tasks: all.tasks, points: all.points, S: by('S'), M: by('M'), L: by('L'), future: [...byId.values()].filter((t) => t.kind === 'future').length,
    dropped: [...byId.values()].filter((t) => t.kind === 'dropped').length,
    sprints: ns.length, first: Math.min(...ns), last: Math.max(...ns),
    lanes: s.seats.filter((r) => seatNames.includes(r.seat)).map((r) => seatMade(r.seat).points),
  };
  problems.push(...proseProblems(s.raw, SPRINTS_PROSE, facts));
  problems.push(...countProblems(s.raw, SPRINTS_COUNTS, {
    sprints: new Map(s.sprints.map((sp) => [sp.n, made(sp.ids)])),
    seats: new Map(seatNames.map((seat) => [seat, seatMade(seat)])),
    droppedBySize: droppedBySize([...byId.values()]),
    total: all,
  }));
  return problems;
}

/**
 * The README's segment table (each file's active tasks, and its future-scope and dropped counts, written
 * `N (+F future scope, +D dropped)`), its total row and its "By size" totals.
 */
export function checkReadmeCounts(tasks: Task[], readme: string): string[] {
  const problems: string[] = [];
  const text = readme.replace(/\r\n/g, '\n');
  const active = activeTasks(tasks);
  /** The counts a parenthesis states: `+7 future scope`, `+3 dropped`; 0 for a kind it does not name. */
  const stated = (paren: string | undefined): { future: number; dropped: number } => ({
    future: Number(/\+(\d+) future scope/.exec(paren ?? '')?.[1] ?? 0),
    dropped: Number(/\+(\d+) dropped/.exec(paren ?? '')?.[1] ?? 0),
  });
  const kinds = (ts: Task[]): Record<TaskKind, number> => ({
    active: ts.filter((t) => t.kind === 'active').length,
    future: ts.filter((t) => t.kind === 'future').length,
    dropped: ts.filter((t) => t.kind === 'dropped').length,
  });
  for (const l of text.split('\n')) {
    const m = /^\| \[(0\d[^\]]*\.md)\]\([^)]*\) \| ([A-Z]+) \| (\d+)(?: \(([^)]*)\))? \|/.exec(l);
    if (!m) continue;
    const k = kinds(tasks.filter((t) => t.file === m[1])), s = stated(m[4]);
    if (Number(m[3]) !== k.active) problems.push(`the segment table states ${m[3]} tasks for ${m[1]}; the file holds ${k.active}`);
    if (s.future !== k.future) problems.push(`the segment table states ${s.future} future-scope ids for ${m[1]}; the file holds ${k.future}`);
    if (s.dropped !== k.dropped) problems.push(`the segment table states ${s.dropped} dropped ids for ${m[1]}; the file holds ${k.dropped}`);
  }
  const all = kinds(tasks);
  const total = /\| \*\*Total\*\* \| \| \*\*(\d+)\*\*(?: \(([^)]*)\))? \|/.exec(text);
  if (!total) problems.push('the segment table has no total row');
  else {
    const s = stated(total[2]);
    if (Number(total[1]) !== all.active) problems.push(`the segment table's total states ${total[1]}; the lines make ${all.active}`);
    if (s.future !== all.future) problems.push(`the segment table's total states ${s.future} future scope; the lines make ${all.future}`);
    if (s.dropped !== all.dropped) problems.push(`the segment table's total states ${s.dropped} dropped; the lines make ${all.dropped}`);
  }
  const sz = /the (\d+)\s+active tasks: (\d+) S, (\d+) M, (\d+) L \((\d+) points/.exec(text);
  if (!sz) problems.push('the README\'s size totals ("By size, the N active tasks: ...") are not found');
  else {
    const by = (z: Size): number => active.filter((t) => t.size === z).length;
    const want = [active.length, by('S'), by('M'), by('L'), points(active)];
    const got = sz.slice(1, 6).map(Number);
    if (got.join() !== want.join()) {
      problems.push(`the README states ${got[0]} tasks: ${got[1]} S, ${got[2]} M, ${got[3]} L (${got[4]} points); ` +
        `the lines make ${want[0]}: ${want[1]} S, ${want[2]} M, ${want[3]} L (${want[4]} points)`);
    }
  }
  // Only `future` and `dropped` are stated in the README's prose; the other facts are filled for the type and never read.
  problems.push(...proseProblems(text, README_PROSE, {
    tasks: active.length, points: points(active), S: 0, M: 0, L: 0, future: all.future, dropped: all.dropped,
    sprints: 0, first: 0, last: 0, lanes: [],
  }));
  problems.push(...countProblems(text, README_COUNTS, {
    sprints: new Map(), seats: new Map(), droppedBySize: droppedBySize(tasks),
    total: { tasks: active.length, points: points(active) },
  }));
  return problems;
}
