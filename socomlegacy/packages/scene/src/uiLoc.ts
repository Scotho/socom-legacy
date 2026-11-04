import { parseRdr, rdrGet, readZdbMember, Zar, type AssetSource, type RdrNode } from '@s2u/archive';

/**
 * The menus' strings (web sprint 5, S1; socomlegacy/docs/research/95 §5.5): `RUN/LOCALE/STATES/UIMNLOC.ZAR` ->
 * `UIMnLOC.rdr`, the path the locale loader builds (`FUN_003a3490` L297105-297117: `RUN\LOCALE\<country>\<name>LOC.zar`,
 * STATES for the US). One record a string: `ID` (1-1441, disjoint from UIMPXLOC's 2100-2133, UIXLOC's 2201-2288 and
 * HudCLOC's 60000+), `MSG_ID` (`_15_ARMORY_MSG`, the name a dialog's `CAPTION` spells) and `LOCALIZED`, the text. A
 * script's caption names the ID (the `UI_COMMAND`'s +0xc, `./uiZanim`), a layout's the MSG_ID.
 *
 * **The strings are UTF-8** where the dialogs' captions are single bytes: a pad glyph is `C2 xx` (`C2 A6` the cross,
 * `C2 AC` the triangle, ...), and one accented letter `C3 AB`. `parseRdr` reads a string byte by byte, so it would
 * draw "Â¦". `UIMNLOC_UTF8_READING`: the lead is consumed -- the lobby frame `A_53_gamelobby.png` shows the cross before
 * CONTINUE with no "Â" -- though the code path that does it was not found (the text functions `FUN_00361bd0` ..
 * `FUN_00363c20`, L260235-261420, and the loader `FUN_003a3be0`, L297317-297470, were searched for 0xc0/0xc2/0xe0
 * masks). So a two-byte sequence (a lead 0xC2-0xDF, a continuation 0x80-0xBF) becomes its one code point, which for
 * these strings is the font's own code (0xA6 the cross, 0xEB the letter); any other byte is left as it stands.
 */
export const UIMNLOC_UTF8_READING = 'two-byte UTF-8 sequences to their code point; every other byte as it stands';

/** The strings' archive and file (research 95 §5.1). */
export const UIMNLOC = { archive: 'RUN/LOCALE/STATES/UIMNLOC.ZAR', member: 'UIMnLOC.rdr' } as const;

/** One string: its id, its message name, its text (decoded, `UIMNLOC_UTF8_READING`). */
export interface LocEntry { id: number; msg: string; text: string }

/** A string of byte-valued characters (what `parseRdr` returns) with its two-byte UTF-8 sequences decoded. */
export function decodeLocText(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const a = raw.charCodeAt(i), b = raw.charCodeAt(i + 1);
    if (a >= 0xc2 && a <= 0xdf && b >= 0x80 && b <= 0xbf) {
      out += String.fromCharCode(((a & 0x1f) << 6) | (b & 0x3f));
      i++;
    } else out += raw[i];
  }
  return out;
}

const one = (n: RdrNode | undefined): string | undefined =>
  typeof n === 'string' ? n : Array.isArray(n) && n.every((x) => typeof x === 'string') ? (n as string[]).join(' ') : undefined;

/**
 * `UIMnLOC.rdr` parsed -> its strings in file order. A record without a numeric `ID` or a `MSG_ID` is left out; an empty
 * `LOCALIZED` is the empty string.
 */
export function parseLocTable(root: RdrNode): LocEntry[] {
  const out: LocEntry[] = [];
  const walk = (n: RdrNode, depth: number): void => {
    if (!Array.isArray(n) || depth > 8) return;
    if (n.includes('MSG_ID') && n.includes('ID')) {
      const id = Number(one(rdrGet([n], 'ID'))), msg = one(rdrGet([n], 'MSG_ID'));
      const text = rdrGet([n], 'LOCALIZED');
      if (Number.isInteger(id) && msg !== undefined) out.push({ id, msg, text: decodeLocText(one(text) ?? '') });
      return;
    }
    for (const c of n) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}

/** A string table's lookups: by id (a script's caption) and by message name (a layout's `CAPTION`). */
export interface LocTable {
  byId: ReadonlyMap<number, string>;
  byMsg: ReadonlyMap<string, string>;
  /** A layout caption to its text: a `_<n>_..._MSG` name through the table, else the caption as it stands. */
  caption(caption: string): string;
}

export function locTable(entries: readonly LocEntry[]): LocTable {
  const byId = new Map<number, string>(), byMsg = new Map<string, string>();
  for (const e of entries) {
    if (!byId.has(e.id)) byId.set(e.id, e.text);
    if (!byMsg.has(e.msg)) byMsg.set(e.msg, e.text);
  }
  return { byId, byMsg, caption: (c) => byMsg.get(c) ?? c };
}

// ---------------------------------------------------------------------------------------------------------------------
// PLAT-04: every LOC archive, one id-to-text service (socomlegacy/docs/research/103).

/**
 * The path the locale loader builds for a table name (`FUN_003a3900` L297225-297310; the rule `FUN_003a3490`
 * L297105-297117): `RUN\LOCALE\<country>\` (0x3fbe28) + `<name>LOC.zar` (0x3fbe18), the member `<name>LOC.rdr`
 * (0x3fbe08); the country from the table at 0x3e0780 (`STATES`, `UK`, `FRANCE`, ... -- `STATES` for the US). The disc
 * records names upper case and `IsoAssetSource` matches any case, so the archive is given as the disc lists it.
 */
export function locArchivePath(name: string, country = 'STATES'): { archive: string; member: string } {
  return { archive: `RUN/LOCALE/${country}/${name.toUpperCase()}LOC.ZAR`, member: `${name}LOC.rdr` };
}

/**
 * A multiplayer map's own strings (PF-12; research 192 s3.1): `<stem>LOC` -- `RUN/LOCALE/STATES/MP72LOC.ZAR` as a member
 * of the map's archive (`RUN/MP72.ZDB`), its member `mp72LOC.rdr` -- the ids the `objectives` script's MESSAGEs name in
 * their +6 word (MP72 7200-7213, MP51 5100-5108, MP71 7100-7113). Read by the archive's last part, as `UILd`.
 */
export function mapLocArchive(stem: string, country = 'STATES'): { archive: string; member: string } {
  return locArchivePath(stem.toUpperCase(), country);
}

/** One string table the code loads by name: its id range as read, where its archive lives, and what loads it. */
export interface LocArchiveSpec {
  /** The name the code passes (`UIMn`, the string at 0x3e2d20). */
  name: string;
  /** The first and last id the table holds (the US disc; research 103 §1). */
  ids: readonly [number, number];
  /** `disc`: a loose file under `RUN/LOCALE/STATES/`; `map`: a member of every map archive (`RUN/*.ZDB`) at that path. */
  where: 'disc' | 'map';
  /** The function that loads it, with its decomp line (`FUN_003a3900`'s callers). */
  loadedBy: string;
  deferred?: 'campaign';
}

/**
 * Every table the code names (research 103 §1). The five front-end ones are loaded by name through `FUN_003a3900`;
 * `UILd` -- the block's `UILdLOC` -- is not a loose file on the US disc but a member of each of the 34 map archives,
 * byte-equal in all, read by the loading state with the map mounted. The four campaign tables are named only by a
 * campaign mission's `mission.rdr` `ExtraStringTables` (`Alb`, `Braz`, `Alg`, `Russ`; `FUN_002af410` L153682-153722
 * reads the key, `FUN_002af360` L153660-153677 loads each), so they are the campaign's.
 */
export const LOC_ARCHIVES: readonly LocArchiveSpec[] = [
  { name: 'UIMn', ids: [1, 1441], where: 'disc', loadedBy: 'FUN_001f4860 L54807 (the menu state)' },
  { name: 'UIMPX', ids: [2100, 2133], where: 'disc', loadedBy: 'FUN_00223970 L76106' },
  { name: 'UIX', ids: [2201, 2288], where: 'disc', loadedBy: 'FUN_001f1bb0 L53492' },
  { name: 'HudC', ids: [60000, 60904], where: 'disc', loadedBy: 'FUN_001fcd80 L58449; FUN_002ad290 L152678' },
  { name: 'UILd', ids: [2000, 2006], where: 'map', loadedBy: 'FUN_001f6660 L55825 (the loading state, with run/ldzanim.zar)' },
  { name: 'Alb', ids: [3000, 3268], where: 'disc', loadedBy: 'FUN_002af360 L153674 (ExtraStringTables)', deferred: 'campaign' },
  { name: 'Alg', ids: [4000, 4150], where: 'disc', loadedBy: 'FUN_002af360 L153674 (ExtraStringTables)', deferred: 'campaign' },
  { name: 'Braz', ids: [13000, 13301], where: 'disc', loadedBy: 'FUN_002af360 L153674 (ExtraStringTables)', deferred: 'campaign' },
  { name: 'Russ', ids: [14000, 14204], where: 'disc', loadedBy: 'FUN_002af360 L153674 (ExtraStringTables)', deferred: 'campaign' },
];

/** A table by name and its strings. */
export interface LocTableSource { name: string; entries: readonly LocEntry[] }

/**
 * A LOC archive's bytes -> its strings: the member `<name>LOC.rdr` (found in any case), decoded as every table is
 * (`UIMNLOC_UTF8_READING`, which holds for all: `C2` leads are in UIMnLOC, HudCLOC and UIXLOC alike, research 103 §2).
 */
export function readLocArchive(bytes: Uint8Array, name: string): LocTableSource {
  const zar = Zar.parse(bytes);
  const want = `${name}LOC.rdr`.toLowerCase();
  const key = zar.root.children.find((k) => k.name.toLowerCase() === want);
  if (!key) throw new Error(`${name}LOC: no ${name}LOC.rdr in the archive`);
  return { name, entries: parseLocTable(parseRdr(zar.data(key))) };
}

/** What a caption comes to: a table's string, a literal, or a reference no loaded table holds. */
export type CaptionText =
  | { kind: 'loc'; id: number; table: string; text: string }
  | { kind: 'literal'; text: string }
  | { kind: 'unresolved'; id: number | null; ref: string };

/** A name that spells an id: reported `unresolved` with that id when no table holds it (the id itself is never used). */
const SPELLED_ID = /^_(\d+)_/;

/**
 * A `_<id>_..._MSG` name as an inventory scans for one (`tools/dump-dialogs.ts`, the dialog-reference tests), group 1
 * the id it spells. Four `MSG_ID`s of the front-end tables run past `_MSG` (`_60482_MAGS_MSG_sCount`, HudCLOC 60493 and
 * 60494, UIMnLOC 1065: `locServiceNames.test.ts`), so a suffix after `_MSG` is taken. Only a scan's shape: the lookup
 * itself (`caption`) asks for no number and no `_MSG` (`FUN_003a3100` D:L296945-296949).
 */
export const MSG_NAME = /^_(\d+)_.*_MSG(?:_.+)?$/;

type HeldEntry = { table: string } & LocEntry;

/**
 * One id-to-text service over every table loaded. The tables' ids are disjoint (`LOC_ARCHIVES`), so an id names one
 * string whatever is loaded; a second table claiming an id is refused rather than shadowed.
 */
export class LocService {
  readonly tables = new Map<string, readonly LocEntry[]>();
  private readonly byId = new Map<number, HeldEntry>();
  private readonly byMsg = new Map<string, HeldEntry>();

  constructor(tables: Iterable<LocTableSource>) {
    for (const t of tables) this.add(t);
  }

  /**
   * Loads a table. A name already loaded is ignored, as the original's loader returns at once for a name it holds
   * (`FUN_003a3900` L297249-297254: the loaded tables' names compared with `FUN_00198f18`, a string compare).
   */
  add({ name, entries }: LocTableSource): void {
    if (this.tables.has(name)) return;
    this.tables.set(name, entries);
    for (const e of entries) {
      const held = this.byId.get(e.id);
      if (held && held.table !== name) throw new Error(`LOC: id ${e.id} is in ${held.table} and in ${name}`);
      if (!held) this.byId.set(e.id, { table: name, ...e });
      if (!this.byMsg.has(e.msg)) this.byMsg.set(e.msg, { table: name, ...e });
    }
  }

  /** An id's text (the node's `vtable+0x74` lookup), or undefined when no loaded table holds it; '' is a string. */
  text(id: number): string | undefined {
    return this.byId.get(id)?.text;
  }

  entry(id: number): HeldEntry | undefined {
    return this.byId.get(id);
  }

  /**
   * A layout's `CAPTION` (`UiObject.caption`), or any text set with translation: any text that begins with `_` is a
   * name, looked up by the **whole name** among the tables' `MSG_ID`s, as the original does -- the text setter `FUN_003631f0`
   * (L260982-261047; vtable+0x70 of the UI text classes) asks `FUN_003a3700` (L297148-297162) for the name's id, which
   * walks the loaded tables (`FUN_003a3100` L296935-297000) and in each hashes the name and compares it with `MSG_ID`
   * (`FUN_003a41f0` L297531-297578; the hash is built from `MSG_ID` at load, `FUN_003a3be0` L297398-297449). The id the
   * name spells is not used: `_273_5Minutes_MSG` is id 274 (research 103 §3.3). Only an empty text or one whose first
   * character is not `_` is refused (`FUN_003a3100` D:L296945-296949, `FUN_003a41f0` D:L297546): no number and no
   * `_MSG` ending is asked for, so `_60482_MAGS_MSG_sCount` (HudCLOC) resolves. A name no table holds is drawn as it
   * stands (`FUN_003631f0` D:L260992-260993 keeps the text unless the id is positive); one that spells an id
   * (`_<n>_`) is reported `unresolved` with it. Any other text stands (the dialogs' literals are single bytes and are
   * not decoded).
   */
  caption(caption: string): CaptionText {
    if (!caption.startsWith('_')) return { kind: 'literal', text: caption };
    const e = this.byMsg.get(caption);
    if (e) return { kind: 'loc', id: e.id, table: e.table, text: e.text };
    const m = SPELLED_ID.exec(caption);
    return m ? { kind: 'unresolved', id: Number(m[1]), ref: caption } : { kind: 'literal', text: caption };
  }

  /**
   * A `ui::UI_COMMAND`'s text by op 1 **Caption** (`FUN_0036fcc0` L268063-268070): the s16 at +0xc, when non-zero, is a
   * string id, else the literal named at +8 (`UiCommand.loc`, `.arg`), which goes to the text setter with translation on
   * (L268066: vtable+0x70 with 1), so a literal that begins with `_` is looked up as `caption` does.
   */
  command(cmd: { loc: number; arg: string }): CaptionText {
    if (cmd.loc === 0) return this.caption(cmd.arg);
    const e = this.byId.get(cmd.loc);
    return e ? { kind: 'loc', id: e.id, table: e.table, text: e.text } : { kind: 'unresolved', id: cmd.loc, ref: String(cmd.loc) };
  }

  /**
   * An object's text sources: its caption resolved, and its `UIVAR` name, the variable whose value it shows
   * (`VERSION_STRING`: registered at L47871-47872 with the build string at 0x3e17e0). Forty dialog objects carry both;
   * which one a drawn object shows is not settled here (research 103 §5, an unknown for PLAT-05), so both are handed over.
   */
  object(o: { caption: string | null; uivar: string | null }): { caption: CaptionText | null; uivar: string | null } {
    return { caption: o.caption === null ? null : this.caption(o.caption), uivar: o.uivar };
  }
}

/**
 * The five front-end tables read through a source: the four loose archives, and `UILd` from `map` (a `RUN/*.ZDB`; any
 * map's, the copies are byte-equal) when one is given. A table that could not be read is named in `missing`.
 */
export async function loadLocService(source: AssetSource, map?: string): Promise<{ service: LocService; missing: string[] }> {
  const service = new LocService([]);
  const missing: string[] = [];
  for (const spec of LOC_ARCHIVES) {
    if (spec.deferred) continue;
    const { archive } = locArchivePath(spec.name);
    if (spec.where === 'map' && !map) {
      missing.push(`${archive} (in a map archive; none given)`);
      continue;
    }
    try {
      const bytes = spec.where === 'disc' ? await source.read(archive) : await readZdbMember(source, map!, archive.split('/').pop()!);
      service.add(readLocArchive(bytes, spec.name));
    } catch (e) {
      missing.push(`${spec.where === 'map' ? `${map}:` : ''}${archive}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { service, missing };
}
