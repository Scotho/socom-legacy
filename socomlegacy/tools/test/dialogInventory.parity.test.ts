// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_COMMAND_TABLE } from '@s2u/ui';

/**
 * TA-FRONTEND: the unit half of PLAT-06's golden pin `dialogInventory.pinned.json` (web research 96 §2-§4, 105 R105.4,
 * 104 R104.5; TA.R3). The pin is re-derived from the disc whole by `dialogInventoryDisc.test.ts` (it skips without
 * `SOCOM_DISC` / `SOCOM_PC_ROOT`); these tests read it with no game data (CI) and hold its internal sums, the tallies
 * the research records and `@s2u/ui`'s command table to it.
 */
interface Sites { [site: string]: Record<string, number> }
interface Pin {
  readercMembers: string[]; readerxMembers: string[];
  sets: Record<string, { slots: number; named: string[] }>;
  widgetSites: Sites;
  perDialog: Record<string, { objects: number; controls: number; models: number; sites: Sites }>;
  pairs: string[]; dangling: string[]; unreferenced: string[]; missingMovies: string[]; classes: Record<string, string>;
  elf: { start: string; bindingRows: number; bindingNames: string[] };
  loc: { summary: { entries: number; minId: number; maxId: number } };
  persistentValves: string[];
  persistentValveValues: Record<string, number>;
}
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'dialogInventory.pinned.json'), 'utf8')) as Pin;

describe('the dialog inventory pin (no game data)', () => {
  it('READERC holds 110 members, 103 of them dlg*; READERX the four end-of-round and exit dialogs', () => {
    expect(PIN.readercMembers).toHaveLength(110);
    expect(PIN.readercMembers.filter((n) => /^dlg/.test(n))).toHaveLength(103);
    expect(Object.keys(PIN.perDialog).sort()).toEqual(PIN.readercMembers.filter((n) => /^dlg/.test(n)).sort());
    expect(PIN.readerxMembers).toEqual(['dlgExitState.rdr', 'dlgMultiplayerFinal.rdr', 'dlgMultiplayerFinalReally.rdr', 'dlgMultiplayerRound.rdr']);
  });

  it('the per-dialog tallies sum to the totals: IMAGE 2,057, TEXT 1,291, BUTTON 298 ... CHECKBOX 42, elements 72 + 72, backgrounds 90 + 9 (R105.4)', () => {
    const sum: Sites = {};
    for (const d of Object.values(PIN.perDialog)) for (const [site, c] of Object.entries(d.sites)) for (const [t, n] of Object.entries(c)) (sum[site] ??= {})[t] = (sum[site]![t] ?? 0) + n;
    expect(sum).toEqual(PIN.widgetSites);
    expect(PIN.widgetSites).toEqual({
      widget: { IMAGE: 2057, TEXT: 1291, BUTTON: 298, TELETYPE: 106, LISTBOX: 58, WRAPPEDTEXT: 49, MAPCONTROL: 36, RADIOSTRIP: 18, SLIDERBAR: 8, COUNTER: 4, SECURETEXT: 3, PROGRESSBAR: 1 },
      subordinate: { CHECKBOX: 42 }, element: { IMAGE: 72, TEXT: 72 }, background: { IMAGE: 90, MPEG: 9 }, uivar: { PERMANENT: 7 },
    });
    // Each dialog's objects and controls are its widget tally, but dlgDebriefing's: its three-token NAME record is typed
    // (so tallied) and dropped by parseUiLayout's objects; the engine keeps it, as `Extras` (R105.5: 49 objects, not 48).
    for (const [n, d] of Object.entries(PIN.perDialog)) {
      expect(Object.values(d.sites.widget ?? {}).reduce((s, x) => s + x, 0), n).toBe(d.objects + d.controls + (n === 'dlgDebriefing.rdr' ? 1 : 0));
    }
    expect(PIN.perDialog['dlgDebriefing.rdr']!.objects).toBe(48);
    expect(PIN.perDialog['dlgMenu.rdr']).toEqual({ objects: 0, controls: 17, models: 1, sites: { background: { MPEG: 1 }, widget: { BUTTON: 6, TEXT: 6, IMAGE: 4, LISTBOX: 1 } } });
  });

  it('the zAnim archives: 95 slots each; UIZANIM names all 95, EXTZANIM 2, MPZANIM 4', () => {
    expect(Object.entries(PIN.sets).map(([k, s]) => [k, s.slots, s.named.length])).toEqual([
      ['RUN/UIZANIM.ZAR', 95, 95], ['RUN/EXTZANIM.ZAR', 95, 2], ['RUN/MPZANIM.ZAR', 95, 4],
    ]);
  });

  it('the boot chain dlgIntroScreen -> dlgIntroCinematic -> dlgSecondCinematic -> dlgMenu; one dangling name, dlgStickSetup; Tut_11 and Tut_12 missing', () => {
    expect(PIN.elf.start).toBe('dlgIntroScreen.rdr');
    for (const p of ['dlgIntroScreen.rdr -> dlgIntroCinematic.rdr', 'dlgIntroCinematic.rdr -> dlgSecondCinematic.rdr', 'dlgSecondCinematic.rdr -> dlgMenu.rdr']) {
      expect(PIN.pairs, p).toContain(p);
    }
    expect([PIN.dangling, PIN.unreferenced, PIN.missingMovies]).toEqual([['dlgStickSetup.rdr'], [], ['run/movies/common/Tut_11.pss', 'run/movies/common/Tut_12.pss']]);
  });

  it('the ELF\'s 207 binding names are UI_COMMAND_TABLE\'s, in order (research 107 R107.1)', () => {
    expect(PIN.elf.bindingRows).toBe(207);
    expect(UI_COMMAND_TABLE.map((r) => r.name)).toEqual(PIN.elf.bindingNames);
  });

  it('UIMnLOC: 1,411 strings, ids 1-1441; the card\'s PersistentValves.rdr: 65 valves, none a volume, brightness or stick slider (R104.5)', () => {
    expect(PIN.loc.summary).toMatchObject({ entries: 1411, minId: 1, maxId: 1441 });
    expect(PIN.persistentValves).toHaveLength(65);
    expect(new Set(PIN.persistentValves).size).toBe(65);
    expect(PIN.persistentValves.filter((n) => /volume|bright|sensitiv|inertia|deadzone|accel/i.test(n))).toEqual([]);
  });

  it('the f0 card\'s value of each of the 65, by name in the card\'s order, each a u16 (OPT-02; research 229 §2)', () => {
    expect(Object.keys(PIN.persistentValveValues)).toEqual(PIN.persistentValves);
    expect(Object.values(PIN.persistentValveValues).every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffff)).toBe(true);
    expect(PIN.persistentValveValues).toMatchObject({ GameSpeedFilter: 65000, ScreenOriginX: 128, SecurePassword: 1, ChosePresetOnce: 1, ForGameCompleteScreen: 2 });
  });
});
