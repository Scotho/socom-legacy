import { slash } from './runDir';
import { REVISIONS, type Revision } from './sampler';

/**
 * Which build the emulator parity harness's PCSX2 runs (EPH-2; the owner's ruling 2026-10-31: "r0001 default, r0004 on
 * ask"). Product track (OT.R53): a validation instrument, an adaptation, never in a build and never changing the game's
 * behaviour.
 *
 * The copy's Mcd001/Mcd002 carry the online update package, so a boot of the r0001 disc with them runs r0004
 * (desktop@be5578311:docs/HAZARDS.md:349, issue #112: "any run labelled 'console r0001' needs a card without the
 * package"; redotcom HAZARDS, "Which image the emulator ran"). An r0001 run points both card slots at harness-owned
 * cards (BUILD_CARDS) through the ini the harness already rewrites; Mcd001/Mcd002 are never written. A card file that
 * is absent is left for PCSX2 to make: its FileMcd opens a missing card by creating a new one (the copy's pcsx2-qt.exe
 * carries "(FileMcd) Creating new %uMB memory card: %s"; its 8 MB cards are 8,650,752 bytes, as Mcd001.ps2 is), and
 * the game then meets an unformatted card, as the desktop's first PCSX2 boot did
 * (desktop@be5578311:docs/parity/NOTES.md:9-15, "The memory card (8MB) ... is unformatted"). The harness creates no
 * card bytes of its own.
 *
 * The build actually running is still detected at connect (./sampler detectRevision) and must equal --build, or the
 * run (and the boot's save) fails: a save state of the other build in the same slot is caught there.
 */

export type Build = Revision;
export const DEFAULT_BUILD: Build = 'r0001';

/** Slot 1 and slot 2's card files per build. r0004: the copy's own; r0001: the harness's, holding no update. */
export const BUILD_CARDS: Readonly<Record<Build, readonly [string, string]>> = {
  r0001: ['EPH-r0001-1.ps2', 'EPH-r0001-2.ps2'],
  r0004: ['Mcd001.ps2', 'Mcd002.ps2'],
};

export function parseBuild(v: string): Build {
  const b = v.toLowerCase();
  if (!(REVISIONS as readonly string[]).includes(b)) throw new Error(`--build takes ${REVISIONS.join(' or ')}, not "${v}"`);
  return b as Build;
}

/**
 * `iniText` with [MemoryCards] Slot1_Filename and Slot2_Filename set to the build's cards; every other line kept byte
 * for byte, the line ends kept. Refused when the section or either line is missing (never a guessed layout).
 */
export function replaceMemoryCards(iniText: string, build: Build): string {
  const want: Record<string, string> = { Slot1_Filename: BUILD_CARDS[build][0], Slot2_Filename: BUILD_CARDS[build][1] };
  const seen = new Set<string>();
  let section: string | null = null;
  let found = false;
  const out = iniText.split(/(?<=\n)/).map((ln) => {
    const s = ln.trim();
    if (s.startsWith('[')) {
      section = s;
      if (s === '[MemoryCards]') found = true;
      return ln;
    }
    if (section !== '[MemoryCards]') return ln;
    const m = /^([A-Za-z0-9_]+)\s*=/.exec(s);
    const key = m?.[1];
    if (!key || !(key in want)) return ln;
    seen.add(key);
    const eol = ln.endsWith('\r\n') ? '\r\n' : ln.endsWith('\n') ? '\n' : '';
    return `${key} = ${want[key]}${eol}`;
  });
  if (!found) throw new Error('EPH [MemoryCards]: no [MemoryCards] section in the PCSX2 ini');
  for (const key of Object.keys(want)) if (!seen.has(key)) throw new Error(`EPH [MemoryCards]: no ${key} line in [MemoryCards]`);
  return out.join('');
}

/** One section's lines removed and added, as `- line` / `+ line`. */
export function sectionDiff(before: string, after: string, section: string): string[] {
  const body = (t: string): string[] => {
    const out: string[] = [];
    let on = false;
    for (const raw of t.split(/\r?\n/)) {
      const s = raw.trim();
      if (s.startsWith('[')) on = s === section;
      else if (on && s) out.push(s);
    }
    return out;
  };
  const a = body(before);
  const b = body(after);
  return [...a.filter((l) => !b.includes(l)).map((l) => `- ${l}`), ...b.filter((l) => !a.includes(l)).map((l) => `+ ${l}`)];
}

/** The ini's [Folders] MemoryCards, under the PCSX2 folder unless absolute; null when the ini names none. */
export function memcardsDir(iniText: string, pcsx2Dir: string): string | null {
  let section = '';
  for (const raw of iniText.split(/\r?\n/)) {
    const s = raw.trim();
    if (s.startsWith('[')) { section = s; continue; }
    const m = /^MemoryCards\s*=\s*(.+)$/.exec(s);
    if (section === '[Folders]' && m) {
      const v = slash(m[1]!.trim()).replace(/\/+$/, '');
      return /^([A-Za-z]:)?\//.test(v) ? v : `${pcsx2Dir}/${v}`;
    }
  }
  return null;
}

export interface CardSlot {
  readonly slot: 1 | 2;
  readonly file: string;
  /** Where PCSX2 keeps it, or null when the ini names no [Folders] MemoryCards. */
  readonly path: string | null;
  readonly exists: boolean;
}

/** The build's two cards on the host, for the dry run and the record. */
export function cardPlan(iniText: string, pcsx2Dir: string, build: Build, exists: (p: string) => boolean): CardSlot[] {
  const dir = memcardsDir(iniText, pcsx2Dir);
  return BUILD_CARDS[build].map((file, i) => {
    const path = dir === null ? null : `${dir}/${file}`;
    return { slot: (i + 1) as 1 | 2, file, path, exists: path !== null && exists(path) };
  });
}
