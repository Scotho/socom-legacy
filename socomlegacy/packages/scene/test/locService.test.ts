import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  decodeUiSet, LOC_ARCHIVES, locArchivePath, LocService, loadLocService, MSG_NAME, parseAnimSets, parseUiLayout, readLocArchive,
  UI_MODEL_FILES, UI_MODEL_FORM_READING, weaponLibrary,
  type CaptionText, type LocEntry,
} from '../src/index';

/**
 * PLAT-04, the locale and string service (socomlegacy/docs/research/103): every LOC archive the code loads by name
 * (`FUN_003a3900` L297225-297310: `RUN\LOCALE\<country>\<name>LOC.zar` -> `<name>LOC.rdr`), one id-to-text lookup over
 * them, a layout `CAPTION` (a `_<id>_..._MSG` name or a literal), the op-1 Caption rule of `FUN_0036fcc0`
 * (L268063-268070: the s16 id at +0xc when non-zero, else the literal at +8), and an object's `UIVAR` kept beside its
 * caption. Hand-built tables first, then the fixtures and the disc: every caption id the 110 `RUN/UI/READERC.ZAR`
 * members and the zAnim sets reference resolves. Counts are pinned, not strings.
 */

const entries = (ids: [number, string, string][]): LocEntry[] => ids.map(([id, msg, text]) => ({ id, msg, text }));

describe('the LOC archives the code names', () => {
  it('builds the path the loader builds, the archive upper-case as the disc names it', () => {
    expect(locArchivePath('UIMn')).toEqual({ archive: 'RUN/LOCALE/STATES/UIMNLOC.ZAR', member: 'UIMnLOC.rdr' });
    expect(locArchivePath('HudC', 'UK')).toEqual({ archive: 'RUN/LOCALE/UK/HUDCLOC.ZAR', member: 'HudCLOC.rdr' });
  });

  it('lists the five the front end loads and the four the campaign does, with their id ranges and loaders', () => {
    expect(LOC_ARCHIVES.map((a) => [a.name, a.ids, a.where, a.deferred ?? null])).toEqual([
      ['UIMn', [1, 1441], 'disc', null], ['UIMPX', [2100, 2133], 'disc', null], ['UIX', [2201, 2288], 'disc', null],
      ['HudC', [60000, 60904], 'disc', null], ['UILd', [2000, 2006], 'map', null],
      ['Alb', [3000, 3268], 'disc', 'campaign'], ['Alg', [4000, 4150], 'disc', 'campaign'],
      ['Braz', [13000, 13301], 'disc', 'campaign'], ['Russ', [14000, 14204], 'disc', 'campaign'],
    ]);
    for (const a of LOC_ARCHIVES) expect(a.loadedBy, a.name).toMatch(/FUN_[0-9a-f]{8}/);
    // The id ranges are disjoint: an id names one string, whichever tables are loaded.
    const sorted = [...LOC_ARCHIVES].sort((x, y) => x.ids[0] - y.ids[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.ids[0]).toBeGreaterThan(sorted[i - 1]!.ids[1]);
  });
});

describe('LocService on hand-built tables', () => {
  const service = new LocService([
    { name: 'UIMn', entries: entries([[15, '_15_ARMORY_MSG', 'ARMORY'], [40, '_40_X_MSG', '']]) },
    { name: 'UIX', entries: entries([[2201, '_2201_EXIT_MSG', '¦ EXIT']]) },
  ]);

  it('looks an id up in whichever table holds it, an empty text kept as empty', () => {
    expect(service.text(15)).toBe('ARMORY');
    expect(service.text(2201)).toBe('¦ EXIT');
    expect(service.text(40)).toBe('');
    expect(service.text(7)).toBeUndefined();
    expect(service.entry(2201)).toEqual({ table: 'UIX', id: 2201, msg: '_2201_EXIT_MSG', text: '¦ EXIT' });
  });

  it('resolves a layout CAPTION: a message name through the tables, a literal as it stands, an unknown name unresolved', () => {
    expect(service.caption('_15_ARMORY_MSG')).toEqual<CaptionText>({ kind: 'loc', id: 15, table: 'UIMn', text: 'ARMORY' });
    expect(service.caption('¬ BACK')).toEqual<CaptionText>({ kind: 'literal', text: '¬ BACK' });
    expect(service.caption('')).toEqual<CaptionText>({ kind: 'literal', text: '' });
    expect(service.caption('_2000_ToReturn_MSG')).toEqual<CaptionText>({ kind: 'unresolved', id: 2000, ref: '_2000_ToReturn_MSG' });
  });

  it('applies the op-1 Caption rule: the s16 id when non-zero, else the literal argument, which is set with translation', () => {
    expect(service.command({ loc: 2201, arg: 'ignored' })).toEqual<CaptionText>({ kind: 'loc', id: 2201, table: 'UIX', text: '¦ EXIT' });
    expect(service.command({ loc: 0, arg: 'DOWNLOAD NOW' })).toEqual<CaptionText>({ kind: 'literal', text: 'DOWNLOAD NOW' });
    expect(service.command({ loc: 999, arg: 'x' })).toEqual<CaptionText>({ kind: 'unresolved', id: 999, ref: '999' });
    // L268066 passes the literal to vtable+0x70 with 1: FUN_003631f0 looks a `_..._MSG` name up (FUN_003a3700).
    expect(service.command({ loc: 0, arg: '_15_ARMORY_MSG' })).toEqual<CaptionText>({ kind: 'loc', id: 15, table: 'UIMn', text: 'ARMORY' });
  });

  it('resolves a message name by the whole name, not by the id it spells (FUN_003a41f0: a hash of MSG_ID, strcmp)', () => {
    const s = new LocService([{ name: 'UIMn', entries: entries([[273, '_273_4Minutes_MSG', '4'], [274, '_273_5Minutes_MSG', '5']]) }]);
    expect(s.caption('_273_5Minutes_MSG')).toEqual<CaptionText>({ kind: 'loc', id: 274, table: 'UIMn', text: '5' });
    expect(s.caption('_273_4Minutes_MSG')).toEqual<CaptionText>({ kind: 'loc', id: 273, table: 'UIMn', text: '4' });
  });

  it('ignores a second load of a table already loaded, as FUN_003a3900 returns early on a known name (L297249-297254)', () => {
    const s = new LocService([{ name: 'UIMn', entries: entries([[15, '_15_ARMORY_MSG', 'ARMORY']]) }]);
    s.add({ name: 'UIMn', entries: entries([[15, '_15_ARMORY_MSG', 'OTHER'], [16, '_16_X_MSG', 'x']]) });
    expect(s.tables.get('UIMn')?.length).toBe(1);
    expect(s.text(15)).toBe('ARMORY');
    expect(s.text(16)).toBeUndefined();
  });

  it('keeps an object\'s UIVAR beside its caption, for the dialog runtime to choose', () => {
    expect(service.object({ caption: '_15_ARMORY_MSG', uivar: 'PLAYER_INFO_NAME_VAR' })).toEqual({
      caption: { kind: 'loc', id: 15, table: 'UIMn', text: 'ARMORY' }, uivar: 'PLAYER_INFO_NAME_VAR',
    });
    expect(service.object({ caption: null, uivar: 'VERSION_STRING' })).toEqual({ caption: null, uivar: 'VERSION_STRING' });
  });

  it('refuses two tables that claim one id', () => {
    expect(() => new LocService([
      { name: 'A', entries: entries([[1, '_1_A_MSG', 'a']]) }, { name: 'B', entries: entries([[1, '_1_B_MSG', 'b']]) },
    ])).toThrow(/id 1.*A.*B/);
  });
});

const MSG = MSG_NAME;                                                // a suffix past _MSG included (research 103)

/** A `_<id>_..._MSG` reference found in a dialog: the member, the field (its last two keys), the name. */
interface DialogRef { member: string; field: string; name: string }

/**
 * Every `_<id>_..._MSG` string node anywhere in each member's tree (the nodes the loader's key lookups can reach,
 * `FUN_0032f0e0`), with its field: not only the layout objects' CAPTIONs `parseUiLayout` reads, but every screen's, and
 * the UIVAR VALUEs.
 */
function dialogRefs(readerc: Uint8Array): { refs: DialogRef[]; dialogs: number; poolOnly: DialogRef[] } {
  const zar = Zar.parse(readerc);
  const refs: DialogRef[] = [];
  const poolOnly: DialogRef[] = [];
  for (const k of zar.root.children) {
    const bytes = zar.data(k);
    const inTree = new Set<string>();
    const walk = (n: RdrNode, keys: string[]): void => {
      if (typeof n === 'string') {
        inTree.add(n);
        if (MSG.test(n)) refs.push({ member: k.name, field: keys.slice(-2).join('>'), name: n });
        return;
      }
      n.forEach((c, i) => {
        const prev = n[i - 1];
        walk(c, typeof prev === 'string' && typeof c !== 'string' && /^[A-Z][A-Z0-9_]*$/.test(prev) ? [...keys, prev] : keys);
      });
    };
    walk(parseRdr(bytes), []);
    // The string table also holds names no node points at: the dialog's script source's (research 103 §3.2).
    const text = Buffer.from(bytes).toString('latin1');
    for (const m of text.matchAll(/\0(_\d+_[^\0]*)(?=\0)/g)) if (MSG.test(m[1]!) && !inTree.has(m[1]!)) poolOnly.push({ member: k.name, field: 'string table only', name: m[1]! });
  }
  return { refs, dialogs: zar.root.children.length, poolOnly };
}

/** A zAnim archive's references: `UI_COMMAND` ids and popup ids, and the `_MSG` names its sets' name tables hold. */
function zanimRefs(bytes: Uint8Array, only?: string): { ids: number[]; popupZero: number; names: { set: string; name: string }[] } {
  const ids: number[] = [];
  const names: { set: string; name: string }[] = [];
  let popupZero = 0;
  for (const set of parseAnimSets(Zar.parse(bytes)).sets) {
    if (only !== undefined && set.name !== only) continue;
    for (const anim of set.anims) for (const name of anim.names) if (MSG.test(name)) names.push({ set: set.name, name });
    for (const program of decodeUiSet(set).values()) for (const seq of program.sequences) for (const op of seq.ops) {
      const commands = op.op === 'ui' ? [op.command] : 'tokens' in op ? op.tokens.flatMap((t) => (t.t === 'ui' ? [t.command] : [])) : [];
      for (const c of commands) if (c.loc !== 0) ids.push(c.loc);
      if (op.op === 'ui' && op.popup) { if (op.popup.text === 0) popupZero++; else ids.push(op.popup.text); }
    }
  }
  return { ids, popupZero, names };
}

/**
 * Each zAnim set's own `UI_COMMAND` and popup ids and its name-table `_MSG` names, by set name, over the archives in
 * the order given (the first archive holding a name keeps it).
 */
function setRefs(archives: [string, Uint8Array][]): Map<string, { archive: string; ids: Set<number>; names: Set<string> }> {
  const out = new Map<string, { archive: string; ids: Set<number>; names: Set<string> }>();
  for (const [archive, bytes] of archives) {
    for (const set of parseAnimSets(Zar.parse(bytes)).sets) {
      if (out.has(set.name)) continue;
      const one = zanimRefs(bytes, set.name);
      out.set(set.name, { archive, ids: new Set(one.ids), names: new Set(one.names.map((n) => n.name)) });
    }
  }
  return out;
}

const count = <T>(items: T[], key: (t: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const t of items) out[key(t)] = (out[key(t)] ?? 0) + 1;
  return out;
};

const tally = (results: CaptionText[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of results) {
    const key = r.kind === 'loc' ? r.table : r.kind;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const READERC = fixture('RUN/UI/READERC.ZAR');
const UIZANIM = fixture('RUN/UIZANIM.ZAR');
const UIMNLOC = fixture('RUN/LOCALE/STATES/UIMNLOC.ZAR');
const MP2 = fixture('RUN/MP2.ZDB');
const HAVE_FIXTURES = READERC !== null && UIZANIM !== null && UIMNLOC !== null && MP2 !== null;

describe.skipIf(!HAVE_FIXTURES)(`the dialogs and UIZANIM against UIMnLOC and a map's UILdLOC${HAVE_FIXTURES ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const service = () => {
    const mp2 = MP2 ?? new Uint8Array();
    return new LocService([
      readLocArchive(UIMNLOC ?? new Uint8Array(), 'UIMn'),
      readLocArchive(zdbMember(mp2, parseZdb(mp2), 'UILDLOC.ZAR'), 'UILd'),
    ]);
  };

  it('UILdLOC is a member of the map archive: seven strings, ids 2000-2006, all non-empty', () => {
    const uild = service().tables.get('UILd') ?? [];
    expect(uild.map((e) => e.id)).toEqual([2000, 2001, 2002, 2003, 2004, 2005, 2006]);
    expect(uild.every((e) => e.text.length > 0)).toBe(true);
  });

  it('every UIZANIM id resolves in UIMnLOC to a non-empty string; the dialogs\' other references are the disc test\'s', () => {
    const s = service();
    const z = zanimRefs(UIZANIM ?? new Uint8Array());
    expect(new Set(z.ids).size).toBe(760);
    expect(z.popupZero).toBe(75);
    const zr = z.ids.map((id) => s.command({ loc: id, arg: '' }));
    expect(tally(zr)).toEqual({ UIMn: z.ids.length });
    expect(zr.every((r) => r.kind === 'loc' && r.text.length > 0)).toBe(true);
    const d = dialogRefs(READERC ?? new Uint8Array());
    expect(d.dialogs).toBe(110);
    expect(d.refs.length).toBe(866);
    expect(count(d.refs, (r) => r.field)).toEqual({ 'SPEC>CAPTION': 840, 'UIVAR>VALUE': 26 });
    const dr = d.refs.map((r) => s.caption(r.name));
    // 46 + 22 + 10 name UIMPXLOC, UIXLOC and HudCLOC strings, which the fixtures do not carry; 4 are in no table.
    expect(tally(dr)).toEqual({ UIMn: 783, UILd: 1, unresolved: 82 });
  });
});

const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN/LOCALE/STATES'));

describe.skipIf(!HAVE_DISC)('every caption id resolves over the disc\'s LOC archives (SOCOM_DISC)', () => {
  const disc = () => resolve(DISC ?? '');
  const read = (path: string): Uint8Array => new Uint8Array(readFileSync(resolve(disc(), path)));

  it('loads the five front-end tables through an AssetSource, UILdLOC from the map archive', async () => {
    const { service, missing } = await loadLocService(new FsAssetSource(disc()), 'RUN/MP2.ZDB');
    expect(missing).toEqual([]);
    expect([...service.tables.keys()]).toEqual(['UIMn', 'UIMPX', 'UIX', 'HudC', 'UILd']);
    expect([...service.tables.values()].map((t) => t.length)).toEqual([1411, 34, 45, 440, 7]);
    // Every string non-empty (no recorded empty is needed), and no C2 lead left by the decoder in any table.
    for (const t of service.tables.values()) for (const e of t) {
      expect(e.text.length, `${e.id}`).toBeGreaterThan(0);
      expect(e.text.includes('Â'), `${e.id}`).toBe(false);
    }
  });

  it('resolves the dialogs\' references but four, which are in no table; HudCLOC is named by the login dialog', async () => {
    const { service } = await loadLocService(new FsAssetSource(disc()), 'RUN/MP2.ZDB');
    const d = dialogRefs(read('RUN/UI/READERC.ZAR'));
    const resolved = d.refs.map((r) => ({ ...r, to: service.caption(r.name) }));
    expect(count(resolved, (r) => (r.to.kind === 'loc' ? r.to.table : r.to.kind))).toEqual({ UIMn: 783, UIMPX: 46, UIX: 22, UILd: 1, HudC: 10, unresolved: 4 });
    expect(count(resolved, (r) => `${r.field} ${r.to.kind === 'loc' ? r.to.table : r.to.kind}`)).toEqual({
      'SPEC>CAPTION UIMn': 771, 'SPEC>CAPTION UIMPX': 46, 'SPEC>CAPTION UIX': 22, 'SPEC>CAPTION UILd': 1,
      'UIVAR>VALUE UIMn': 12, 'UIVAR>VALUE HudC': 10, 'UIVAR>VALUE unresolved': 4,
    });
    // The four: dlgSetSOP's SOP defaults, ids UIMnLOC does not hold (its 737, the fifth, it does).
    expect(resolved.filter((r) => r.to.kind === 'unresolved').map((r) => `${r.member} ${r.field} ${r.name}`)).toEqual([
      'dlgSetSOP.rdr UIVAR>VALUE _549_ImGoingLeft_MSG', 'dlgSetSOP.rdr UIVAR>VALUE _550_ImGoingRight_MSG',
      'dlgSetSOP.rdr UIVAR>VALUE _552_ImGoingBomb_MSG', 'dlgSetSOP.rdr UIVAR>VALUE _553_ImGoingHostages_MSG',
    ]);
    // HudCLOC: the login dialog's persistent SOP and taunt defaults (MPLOCALSOP1-5, MPTAUNTMSG1-5), ids 60757-60766.
    const hud = resolved.filter((r) => r.to.kind === 'loc' && r.to.table === 'HudC');
    expect([...new Set(hud.map((r) => r.member))]).toEqual(['dlgNetLogin.rdr']);
    expect(hud.map((r) => (r.to.kind === 'loc' ? r.to.id : 0))).toEqual([60757, 60758, 60759, 60760, 60761, 60762, 60763, 60764, 60765, 60766]);
    // dlgSetSOP is reached from the online and LAN options (a binding's ARGUMENT names it).
    for (const m of ['dlgOnlineOptions.rdr', 'dlgLAN_Options.rdr']) {
      const zar = Zar.parse(read('RUN/UI/READERC.ZAR'));
      const flat = JSON.stringify(parseRdr(zar.data(zar.root.children.find((k) => k.name === m)!)));
      expect(flat, m).toContain('"ARGUMENT",["dlgSetSOP.rdr"]');
    }
  });

  it('holds unreferenced script-source names in the dialogs\' string tables: HudCLOC among them only in dlg_equipment_main', async () => {
    const { service } = await loadLocService(new FsAssetSource(disc()), 'RUN/MP2.ZDB');
    const { poolOnly } = dialogRefs(read('RUN/UI/READERC.ZAR'));
    const to = poolOnly.map((r) => ({ ...r, to: service.caption(r.name) }));
    expect(count(to, (r) => (r.to.kind === 'loc' ? r.to.table : r.to.kind))).toEqual({ UIMn: 810, UIX: 22, UILd: 5, UIMPX: 7, HudC: 4 });
    expect(to.filter((r) => r.to.kind === 'loc' && r.to.table === 'HudC').map((r) => `${r.member} ${r.name}`)).toEqual([
      'dlg_equipment_main.rdr _60884_WARDOG_MSG', 'dlg_equipment_main.rdr _60889_SabreSas_MSG',
      'dlg_equipment_main.rdr _60885_VANDAL_MSG', 'dlg_equipment_main.rdr _60888_ReaverSas_MSG',
    ]);
    // Research 103 §3.2: of the 848, 721 are ids the same-named zAnim set uses (its UI_COMMAND and popup ids) -- 692
    // in UIZANIM.ZAR, 29 in MPZANIM.ZAR or EXTZANIM.ZAR; 15 more are names its name tables hold; 13 have no set.
    const sets = setRefs([
      ['UIZANIM', read('RUN/UIZANIM.ZAR')], ['MPZANIM', read('RUN/MPZANIM.ZAR')], ['EXTZANIM', read('RUN/EXTZANIM.ZAR')],
    ]);
    expect(poolOnly.length).toBe(848);
    const kind = (r: DialogRef): string => {
      const set = sets.get(r.member);
      if (!set) return 'no set';
      if (set.ids.has(parseInt(r.name.slice(1), 10))) return set.archive === 'UIZANIM' ? 'id UIZANIM' : 'id MPZANIM/EXTZANIM';
      return set.names.has(r.name) ? 'name' : 'neither';
    };
    expect(count(poolOnly, kind)).toEqual({ 'id UIZANIM': 692, 'id MPZANIM/EXTZANIM': 29, name: 15, 'no set': 13, neither: 99 });
  }, 30_000);                                            // every dialog of the disc: 1.4 s alone, over the 5 s default beside the whole suite

  it('resolves every zAnim id, and the sets\' name-table names; HudCLOC names in two sets', async () => {
    const { service } = await loadLocService(new FsAssetSource(disc()), 'RUN/MP2.ZDB');
    const counts: Record<string, Record<string, number>> = {};
    const hudSets = new Set<string>();
    for (const f of ['RUN/UIZANIM.ZAR', 'RUN/MPZANIM.ZAR', 'RUN/EXTZANIM.ZAR']) {
      const z = zanimRefs(read(f));
      const names = z.names.map((n) => ({ ...n, to: service.caption(n.name) }));
      for (const n of names) if (n.to.kind === 'loc' && n.to.table === 'HudC') hudSets.add(`${f} ${n.set}`);
      counts[f] = {
        ...tally(z.ids.map((id) => service.command({ loc: id, arg: '' }))), popupZero: z.popupZero,
        ...Object.fromEntries(Object.entries(count(names, (n) => (n.to.kind === 'loc' ? n.to.table : n.to.kind))).map(([k, v]) => [`names ${k}`, v])),
      };
    }
    expect(counts).toEqual({
      'RUN/UIZANIM.ZAR': { UIMn: 1244, popupZero: 75, 'names HudC': 28, 'names UIMn': 16 },
      'RUN/MPZANIM.ZAR': { UIMPX: 23, popupZero: 20, 'names UIMn': 25 },
      'RUN/EXTZANIM.ZAR': { UIX: 23, popupZero: 10, 'names UIMn': 10 },
    });
    expect([...hudSets].sort()).toEqual(['RUN/UIZANIM.ZAR ShowAndSpin.rdr', 'RUN/UIZANIM.ZAR dlg_equipment_main.rdr']);
  });

  it('resolves the seven create-game times by their names to seven ids, where the spelled id is 273 for all', async () => {
    const { service } = await loadLocService(new FsAssetSource(disc()), 'RUN/MP2.ZDB');
    const names = [4, 5, 6, 7, 8, 9, 10].map((m) => `_273_${m}Minutes_MSG`);
    expect(names.map((n) => { const r = service.caption(n); return r.kind === 'loc' ? r.id : null; })).toEqual([273, 274, 275, 276, 277, 278, 279]);
    const zar = Zar.parse(read('RUN/UI/READERC.ZAR'));
    const pool = Buffer.from(zar.data(zar.root.children.find((k) => k.name === 'dlgCreateGame.rdr')!)).toString('latin1');
    for (const n of names) expect(pool, n).toContain(`\0${n}\0`);
  });

  it('draws the main menu\'s row labels from textures on the roller model, not from text', () => {
    const zar = Zar.parse(read('RUN/UI/READERC.ZAR'));
    const menu = parseUiLayout(parseRdr(zar.data(zar.root.children.find((k) => k.name === 'dlgMenu.rdr')!)));
    const buttons = menu.controls.filter((c) => c.type === 'BUTTON');
    expect(buttons.map((b) => b.name)).toEqual(['new_game_button', 'load_game_button', 'multiplayer_button', 'options_button', 'Extras_button', 'LAN_button']);
    expect(buttons.every((b) => b.caption === ' ')).toBe(true);
    const txr = Zar.parse(read('RUN/UI/UI_TXR.ZED'));
    const keys: string[] = [];
    txr.walk((k) => keys.push(k.name));
    // The roller model's own packets, decoded (its GEO graph over its MDL chains, the UI's bias form): twelve nodes,
    // one quad each, and each node's one texture is the row's label in that state -- read from the chains' texture
    // references, not from the names merely sharing the archive.
    const ui = weaponLibrary(Zar.parse(read(UI_MODEL_FILES.geo)), Zar.parse(read(UI_MODEL_FILES.mdl)), UI_MODEL_FORM_READING);
    const roller = ui.decode('mainmenu_roller', 'all');
    expect(roller.diagnostics).toEqual([]);
    const rows: [string, string][] = [['new', 'newgame'], ['load', 'loadgame'], ['online', 'online'], ['lan', 'LAN'], ['options', 'options'], ['extras', 'extras']];
    const want = rows.flatMap(([node, tex]) => ['on', 'off'].map((state) => [`${node}_${state}`, [`menu_${tex}_${state}.tif`], 2] as const));
    expect(roller.parts.map((p) => [p.node, p.meshes.map((m) => m.textureName), p.meshes.reduce((n, m) => n + m.indices.length / 3, 0)])).toEqual(want);
    for (const [, [tex]] of want) expect(keys, tex).toContain(tex);
    // And no other UI model draws a label texture.
    const others = ui.names().filter((n) => n !== 'mainmenu_roller' && ui.decode(n, 'all').textures.some((t) => /^menu_/.test(t)));
    expect(others).toEqual([]);
  });

  it('resolves the ids of the captions compared with the console crops (research 103 §4) to short UIMnLOC strings', async () => {
    const { service } = await loadLocService(new FsAssetSource(disc()), 'RUN/MP2.ZDB');
    // login, eula, universe, persona, game_lobby (titles); rooms, lobby_news, write_down, save_card, card_slot; main_menu.
    const ids = [568, 756, 609, 587, 339, 782, 779, 606, 831, 828, 507];
    for (const id of ids) {
      const e = service.entry(id);
      expect(e?.table, `${id}`).toBe('UIMn');
      expect(e!.text.length, `${id}`).toBeGreaterThan(0);
    }
    // The titles are one line (the crops' bars); the popups' texts run on (the crops cut them).
    expect(ids.slice(0, 5).every((id) => service.text(id)!.length <= 24)).toBe(true);
    expect([606, 831].every((id) => service.text(id)!.length > 40)).toBe(true);
    // rooms.png draws the cross glyph first: the C2 A6 lead decoded to the font's code 0xA6.
    expect(service.text(782)!.charCodeAt(0)).toBe(0xa6);
  });

  it('carries one UILdLOC, byte-equal, in every map archive; the campaign tables only through a campaign mission', () => {
    const run = resolve(disc(), 'RUN');
    const zdbs = readdirSync(run).filter((f) => /\.ZDB$/.test(f)).sort();
    expect(zdbs.length).toBe(34);
    let first: Buffer | null = null;
    const extra: Record<string, string> = {};
    for (const f of zdbs) {
      const bytes = read(`RUN/${f}`);
      const toc = parseZdb(bytes);
      const uild = Buffer.from(zdbMember(bytes, toc, 'UILDLOC.ZAR'));
      first ??= uild;
      expect(uild.equals(first), f).toBe(true);
      const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
      const mission = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
      const tables = mission ? rdrGet(parseRdr(readerm.data(mission)), 'ExtraStringTables') : undefined;
      if (tables !== undefined) extra[f] = String(tables);
    }
    // ExtraStringTables (FUN_002af410 L153682-153722) is set by the twelve campaign missions alone, each naming its AOP's table.
    expect(extra).toEqual({
      'M51.ZDB': 'Alb', 'M52.ZDB': 'Alb', 'M53.ZDB': 'Alb', 'M61.ZDB': 'Braz', 'M62.ZDB': 'Braz', 'M63.ZDB': 'Braz',
      'M71.ZDB': 'Alg', 'M72.ZDB': 'Alg', 'M73.ZDB': 'Alg', 'M81.ZDB': 'Russ', 'M82.ZDB': 'Russ', 'M83.ZDB': 'Russ',
    });
  }, 120_000);
});
