/**
 * The load phases and their marks (PLAT-29a; web research 100, "the load budget"; plan ruling W6.R4).
 *
 * The block (`docs/roadmap/01-platform.md` "PLAT-29a") asks for a measured time per phase, first byte -> Sony logo ->
 * main menu -> lobby -> map, logged with no threshold (the threshold is PLAT-29b's). W6.R4: this sprint measures what
 * exists -- the first byte, the viewer's script starting, the disc indexed and the map's first frame, from the player's
 * ISO and from the served tree -- and writes the rows not built yet as **owed**, each naming the sprint and the task
 * that fill it (the sprints: `docs/roadmap/SPRINTS.md` "Sprint 11", "Sprint 12", "Sprint 17").
 *
 * Pure: the clock enters as a parameter (`now(): number`, in milliseconds from the page's time origin). The viewer
 * passes `performance.now`; a test turns its own. Nothing here reads a browser global (W6.R2,
 * `docs/specs/2026-10-01-web-sprint-6-package-boundaries.md` section 2).
 */

/** Every phase the budget table has a row for, in boot order. */
export type LoadPhase =
  | 'firstByte' | 'pageStart' | 'discChosen' | 'discIndexed' | 'sonyFrame' | 'mainMenu' | 'lobby' | 'mapFirstFrame';

/** A phase not built yet: the sprint (`SPRINTS.md`) and the task (the roadmap's block) that first draw it. */
export interface OwedBy { sprint: number; task: string }

export interface LoadPhaseRow {
  phase: LoadPhase;
  /** The table's words for it. */
  label: string;
  /** What the mark is the moment of. */
  moment: string;
  /** Set when nothing draws the phase yet (W6.R4). */
  owed?: OwedBy;
}

/** The rows, in the order the console reaches them (the block's chain; the disc's two rows are the page's own). */
export const LOAD_PHASES: readonly LoadPhaseRow[] = [
  { phase: 'firstByte', label: 'first byte',
    moment: "the page's first response byte: the navigation entry's `responseStart`" },
  { phase: 'pageStart', label: "page start (the viewer's script)",
    moment: "the viewer's module body starting (`packages/viewer/src/main.ts`), its imports evaluated" },
  { phase: 'discChosen', label: 'the disc chosen',
    moment: "the player's ISO handed to the page (file input or drop); the served tree has no such moment" },
  { phase: 'discIndexed', label: 'the disc indexed',
    moment: "the worker's map list accepted (`indexVerdict` open), from the ISO or the served `maps/index.json`" },
  { phase: 'sonyFrame', label: 'first Sony frame', owed: { sprint: 12, task: 'BOOT-04' },
    moment: "SONY448.PSS's first Sony-card picture on screen (web research 98 section 1: the card is the movie's)" },
  { phase: 'mainMenu', label: 'main menu', owed: { sprint: 11, task: 'MENU-02' },
    moment: '`dlgMenu` first drawn, settled' },
  { phase: 'lobby', label: 'lobby', owed: { sprint: 17, task: 'ONL-16' },
    moment: 'the game lobby (`dlgGameLobby`) first drawn '
      + '(Chris\'s lane; sprint 16 reaches the SOCOM II ONLINE menu before it)' },
  { phase: 'mapFirstFrame', label: "the map's first frame",
    moment: "the first map's world whole in the scene (its last reveal slice; the status line's `ms to first paint`)" },
];

const KNOWN = new Set<string>(LOAD_PHASES.map((p) => p.phase));
const ORDER: readonly LoadPhase[] = LOAD_PHASES.map((p) => p.phase);

/** The marks of one page load: the first time each phase was reached, in the clock's milliseconds. */
export class PhaseMarks {
  private readonly times = new Map<LoadPhase, number>();

  constructor(private readonly now: () => number) {}

  /**
   * Marks `phase` at `at` (the clock's reading by default). Only the first mark of a phase counts -- a second map or a
   * second disc is not the load's -- so a later one returns false and changes nothing.
   */
  mark(phase: LoadPhase, at: number = this.now()): boolean {
    if (!KNOWN.has(phase)) throw new Error(`no such load phase: ${String(phase)}`);
    if (!Number.isFinite(at)) throw new Error(`${phase}: not a finite time (${at})`);
    if (this.times.has(phase)) return false;
    this.times.set(phase, at);
    return true;
  }

  /**
   * Takes back the mark of a phase that came to nothing -- a disc image handed to the page and then refused -- so the
   * next mark counts. The caller takes back only a mark its own `mark` call set (that call returned true): a refused
   * second disc must not take back the first, accepted one's. Returns false when nothing was marked.
   */
  retract(phase: LoadPhase): boolean {
    return this.times.delete(phase);
  }

  /** When `phase` was first reached, or undefined. */
  at(phase: LoadPhase): number | undefined {
    return this.times.get(phase);
  }

  /** A plain copy, in boot order: what the debug hook hands the perf spec. */
  marks(): Partial<Record<LoadPhase, number>> {
    const out: Partial<Record<LoadPhase, number>> = {};
    for (const phase of ORDER) {
      const t = this.times.get(phase);
      if (t !== undefined) out[phase] = t;
    }
    return out;
  }
}

/**
 * The disc chosen mark's take-back rule (research 100; the PLAT-29a review's findings): the mark stands for the disc
 * that opened. While a chosen disc is still being read its mark is pending, and only a pending mark is the page's to
 * move: a refused disc takes it back (the next image is timed from its own choosing); a disc chosen over one still
 * being read supersedes it (the earlier one's index is dropped, so its time goes with it: taken back and marked anew);
 * a disc indexed makes it stand. A disc chosen after one opened marks nothing, and its refusal takes nothing back.
 */
export class DiscChoice {
  private pending = false;

  constructor(private readonly marks: PhaseMarks) {}

  /** A disc image handed to the page (file input or drop), at `at` (the clock's reading by default). */
  chosen(at?: number): void {
    if (this.pending) this.marks.retract('discChosen');
    this.pending = this.marks.mark('discChosen', at);
  }

  /** The disc being read is refused (no ISO, no archive that names itself, the worker failing). */
  refused(): void {
    if (this.pending) this.marks.retract('discChosen');
    this.pending = false;
  }

  /** The disc (or the served tree) is open: `discIndexed` marked, the chosen mark stands. */
  indexed(at?: number): void {
    this.marks.mark('discIndexed', at);
    this.pending = false;
  }
}

/** One measured load: a column of the table. */
export interface BudgetRun { label: string; marks: Partial<Record<LoadPhase, number>> }

/**
 * The budget table (research 100), one row a phase and one column a run: the time from the page's time origin in whole
 * milliseconds, with the step from the run's previous reached phase in brackets. A built phase the run did not reach
 * reads `not reached` (`--` for the disc chosen, which only an ISO run has); an owed phase nothing marked reads
 * `OWED (sprint N, TASK)`. No threshold: that is PLAT-29b's.
 */
export function budgetTable(runs: readonly BudgetRun[]): string {
  const lines = [
    `| phase | ${runs.map((r) => `${r.label} (ms)`).join(' | ')} |`,
    `|${'---|'.repeat(runs.length + 1)}`,
  ];
  const previous: (number | undefined)[] = runs.map(() => undefined);
  for (const row of LOAD_PHASES) {
    const cells = runs.map((run, i) => {
      const t = run.marks[row.phase];
      if (t === undefined) {
        if (row.owed) return `OWED (sprint ${row.owed.sprint}, ${row.owed.task})`;
        return row.phase === 'discChosen' ? '--' : 'not reached';
      }
      const before = previous[i];
      previous[i] = t;
      return before === undefined ? `${Math.round(t)}` : `${Math.round(t)} (+${Math.round(t - before)})`;
    });
    lines.push(`| ${row.label} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}
