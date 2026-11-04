// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { LOC_ARCHIVES, LocService, loadLocService, MSG_NAME, type CaptionText } from '../src/index';

/**
 * TA-FRONTEND's golden pin of the front end's string tables (web research 103 §1, §3, §4; TA.R3). `golden/locTables.json`
 * holds the five tables `loadLocService` loads for the front end (UIMn, UIMPX, UIX, HudC from `RUN/LOCALE/STATES`, UILd
 * from `RUN/MP2.ZDB`) as `[id, message name]` rows, the text of the ids the console crops and the create-game times
 * name, and every `_<id>_..._MSG` string node of `RUN/UI/READERC.ZAR`'s 110 members by field, counted. The unit half
 * builds a `LocService` from the pin and resolves the dialogs' references through it with no game data (CI); the disc
 * half re-derives the pin and compares it whole (it skips without `SOCOM_DISC` / `SOCOM_PC_ROOT`).
 * `locService.test.ts`'s disc block holds the same claims on the disc only.
 */
interface Pin { _source: string; tables: Record<string, [number, string][]>; text: Record<string, string>; dialogRefs: Record<string, number> }
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden/locTables.json'), 'utf8')) as Pin;
const FRONT_END = ['UIMn', 'UIMPX', 'UIX', 'HudC', 'UILd'];

/** The pinned tables as a service: a pinned text where the pin has one, else a stand-in that names the row. */
const service = (): LocService => new LocService(FRONT_END.map((name) => ({
  name, entries: PIN.tables[name]!.map(([id, msg]) => ({ id, msg, text: PIN.text[id] ?? `<${msg}>` })),
})));
const refs = (): { field: string; name: string; n: number }[] => Object.entries(PIN.dialogRefs).map(([k, n]) => {
  const at = k.indexOf(' ');
  return { field: k.slice(0, at), name: k.slice(at + 1), n };
});
const kind = (c: CaptionText): string => (c.kind === 'loc' ? c.table : c.kind);

describe('the front end\'s string tables from their golden pin (no game data)', () => {
  it('five tables, 1,411 / 34 / 45 / 440 / 7 strings, each within its archive\'s id range; UILd 2000-2006 (R103.1)', () => {
    expect(Object.keys(PIN.tables)).toEqual(FRONT_END);
    expect(FRONT_END.map((n) => PIN.tables[n]!.length)).toEqual([1411, 34, 45, 440, 7]);
    for (const n of FRONT_END) {
      const [lo, hi] = LOC_ARCHIVES.find((a) => a.name === n)!.ids;
      for (const [id] of PIN.tables[n]!) expect(id >= lo && id <= hi, `${n} ${id}`).toBe(true);
    }
    expect(PIN.tables.UILd!.map(([id]) => id)).toEqual([2000, 2001, 2002, 2003, 2004, 2005, 2006]);
    for (const id of [2000, 2001, 2002, 2003, 2004, 2005, 2006]) expect(PIN.text[id]!.length, `${id}`).toBeGreaterThan(0);
    expect(() => service()).not.toThrow();                                         // no id claimed by two tables
  });

  it('READERC\'s 866 references resolve but four: UIMn 783, UIMPX 46, UIX 22, UILd 1, HudC 10, unresolved 4 (R103.4)', () => {
    const s = service();
    const by: Record<string, number> = {}, byField: Record<string, number> = {};
    const unresolved: string[] = [];
    for (const r of refs()) {
      const k = kind(s.caption(r.name));
      by[k] = (by[k] ?? 0) + r.n;
      byField[`${r.field} ${k}`] = (byField[`${r.field} ${k}`] ?? 0) + r.n;
      if (k === 'unresolved') unresolved.push(r.name);
    }
    expect(by).toEqual({ UIMn: 783, UIMPX: 46, UIX: 22, UILd: 1, HudC: 10, unresolved: 4 });
    expect(byField).toEqual({
      'SPEC>CAPTION UIMn': 771, 'SPEC>CAPTION UIMPX': 46, 'SPEC>CAPTION UIX': 22, 'SPEC>CAPTION UILd': 1,
      'UIVAR>VALUE UIMn': 12, 'UIVAR>VALUE HudC': 10, 'UIVAR>VALUE unresolved': 4,
    });
    expect(unresolved.sort()).toEqual(['_549_ImGoingLeft_MSG', '_550_ImGoingRight_MSG', '_552_ImGoingBomb_MSG', '_553_ImGoingHostages_MSG']);
  });

  it('the HudC references are the login dialog\'s persistent SOP and taunt defaults, ids 60757-60766 (R103.5)', () => {
    const s = service();
    const ids = refs().filter((r) => kind(s.caption(r.name)) === 'HudC').map((r) => { const c = s.caption(r.name); return c.kind === 'loc' ? c.id : 0; });
    expect(ids.sort((a, b) => a - b)).toEqual([60757, 60758, 60759, 60760, 60761, 60762, 60763, 60764, 60765, 60766]);
  });

  it('a message name is looked up whole, not by the id it spells (R103.7): the seven create-game times _273_<m>Minutes_MSG are 273-279', () => {
    const s = service();
    const names = [4, 5, 6, 7, 8, 9, 10].map((m) => `_273_${m}Minutes_MSG`);
    expect(names.map((n) => { const r = s.caption(n); return r.kind === 'loc' ? r.id : null; })).toEqual([273, 274, 275, 276, 277, 278, 279]);
    expect(names.map((n) => Number(MSG_NAME.exec(n)![1]))).toEqual(Array(7).fill(273));
    expect([273, 274, 275, 276, 277, 278, 279].map((id) => s.text(id))).toEqual([273, 274, 275, 276, 277, 278, 279].map((id) => PIN.text[id]));
  });

  it('the console crops\' captions (R103.6) are UIMn strings: the titles one line of at most 24, the popups run on, rooms.png opens on 0xA6', () => {
    const s = service();
    const ids = [568, 756, 609, 587, 339, 782, 779, 606, 831, 828, 507];
    for (const id of ids) expect(s.entry(id)?.table, `${id}`).toBe('UIMn');
    expect(ids.slice(0, 5).every((id) => s.text(id)!.length <= 24)).toBe(true);
    expect([606, 831].every((id) => s.text(id)!.length > 40)).toBe(true);
    expect(s.text(782)!.charCodeAt(0)).toBe(0xa6);
    // dlgMenu's legal line, by its name.
    expect(s.caption('_507_DevelopedZipper_MSG')).toEqual<CaptionText>({ kind: 'loc', id: 507, table: 'UIMn', text: PIN.text[507]! });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: the pin re-derived.

const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/LOCALE/STATES'))) ?? null;

describe.skipIf(DISC === null)('the string tables\' pin re-derived from the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('the five tables\' rows, the pinned texts and READERC\'s references equal the pin whole', async () => {
    const { service: s, missing } = await loadLocService(new FsAssetSource(DISC!), 'RUN/MP2.ZDB');
    expect(missing).toEqual([]);
    expect(Object.fromEntries([...s.tables].map(([n, es]) => [n, es.map((e) => [e.id, e.msg])]))).toEqual(PIN.tables);
    expect(Object.fromEntries(Object.keys(PIN.text).map((id) => [id, s.text(Number(id))]))).toEqual(PIN.text);
    const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UI/READERC.ZAR'))));
    const found: Record<string, number> = {};
    for (const k of z.root.children) {
      const walk = (n: RdrNode, keys: string[]): void => {
        if (typeof n === 'string') { if (MSG_NAME.test(n)) { const key = `${keys.slice(-2).join('>')} ${n}`; found[key] = (found[key] ?? 0) + 1; } return; }
        n.forEach((c, i) => { const prev = n[i - 1]; walk(c, typeof prev === 'string' && typeof c !== 'string' && /^[A-Z][A-Z0-9_]*$/.test(prev) ? [...keys, prev] : keys); });
      };
      walk(parseRdr(z.data(k)), []);
    }
    expect(found).toEqual(PIN.dialogRefs);
  }, 120_000);
});
