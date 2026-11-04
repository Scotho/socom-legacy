import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr } from '@s2u/archive';
import { persistentValvesOf, valveNames, valveValues } from '../dialogInventory';
import { discRoot, pinnedView, readInventory, readLoc, type Inventory } from '../dump-dialogs';

/**
 * PLAT-06's dev-disc check (web research 96; W6.R8): the dialog inventory and flow graph regenerated from the disc --
 * READERC's and READERX's members, the three zAnim archives' sets, the widget TYPE tallies, the UI binding table's rows
 * in the ELF, the reference graph and the classification -- equal to what research 96 records, pinned in
 * `dialogInventory.pinned.json` (names and counts only: no bytes, no hashes, no caption text). Any change fails here.
 * Regenerate the pin with `npx tsx tools/dump-dialogs.ts --pin` and say in research 96 what moved.
 *
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI), every test skips. The card
 * check reads the cards under `SOCOM_PC_ROOT` with the card file reader (`tools/cardFile.ts`, R7's dev instrument; web
 * research 102) and skips when they are absent.
 */
const DISC = discRoot();
/**
 * The ELF beside the disc tree (`SOCOM_PC_ROOT/game/disc` has it; a plain disc extraction names it `SCUS_*` instead).
 * Without it `readInventory` has no code names: the binding table, the code-reached dialogs and so the classes and the
 * unreferenced list differ from the pin, so the tests that read them skip (the sprint 6 close review's note).
 */
const HAVE_ELF = !!DISC && existsSync(resolve(DISC, 'socom2_game.elf'));
const PIN = resolve(import.meta.dirname, 'dialogInventory.pinned.json');

let cached: Inventory | null = null;
const inventory = (): Inventory => (cached ??= readInventory(DISC ?? ''));

describe.skipIf(!DISC)('the dialog inventory off the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('READERC holds 110 members: 103 dlg*, 4 Common_*, mp_rooms, UiParams, uisounds; READERX four dialogs', () => {
    const inv = inventory();
    expect(inv.readerc.tally).toEqual({ total: 110, dialogs: 103, common: 4, other: ['mp_rooms.rdr', 'UiParams.rdr', 'uisounds.rdr'] });
    expect(inv.readerx.members).toEqual(['dlgExitState.rdr', 'dlgMultiplayerFinal.rdr', 'dlgMultiplayerFinalReally.rdr', 'dlgMultiplayerRound.rdr']);
  }, 120_000);

  it('the zAnim archives: 95 slots each; UIZANIM names all 95, EXTZANIM 2, MPZANIM 4', () => {
    const s = inventory().sets;
    expect(Object.values(s).map((x) => [x.slots, x.named.length, x.empty])).toEqual([[95, 95, 0], [95, 2, 93], [95, 4, 91]]);
    expect(s['RUN/EXTZANIM.ZAR']!.named).toEqual(['dlgExitState.rdr', 'UIanim.rdr']);
    expect(s['RUN/MPZANIM.ZAR']!.named).toEqual(['dlgMultiplayerRound.rdr', 'dlgMultiplayerFinal.rdr', 'dlgMultiplayerFinalReally.rdr', 'UIanim.rdr']);
  }, 120_000);

  it.skipIf(!HAVE_ELF)('the boot chain and the dangling names (the code names from the ELF)', () => {
    const inv = inventory();
    const has = (pair: string): boolean => inv.pairs.includes(pair);
    expect(['dlgIntroScreen.rdr -> dlgIntroCinematic.rdr', 'dlgIntroCinematic.rdr -> dlgSecondCinematic.rdr', 'dlgSecondCinematic.rdr -> dlgMenu.rdr'].every(has)).toBe(true);
    expect(inv.graph.dangling).toEqual(['dlgStickSetup.rdr']);
    expect(inv.graph.unreferenced).toEqual([]);
    expect(inv.graph.edges.some((e) => /hype/i.test(e.to)) || inv.graph.library.some((e) => /hype/i.test(e.to))).toBe(false);
    expect(inv.missingMovies).toEqual(['run/movies/common/Tut_11.pss', 'run/movies/common/Tut_12.pss']);
  }, 120_000);

  it.skipIf(!HAVE_ELF)('the UI binding table: 207 named rows, then an all-zero row; ids 1..208 without 30', () => {
    const e = inventory().elf!;
    expect(e.start).toBe('dlgIntroScreen.rdr');
    expect(e.bindingRows).toBe(207);
    expect(e.terminator).toEqual({ index: 207, id: 0, fn: 0, fn2: 0 });
    expect([e.maxId, e.missingIds]).toEqual([208, [30]]);
    expect(e.switchStrings).toEqual(['REBOOT', 'LOAD_SCREEN', 'POP_TO_MENU_STATE', 'MENU_SCREEN', 'SHUTDOWN', 'dlgHype', 'dlgNetLogin']);
    expect(e.codeDialogs.filter((c) => /hype/i.test(c.text))).toEqual([{ va: 0x3f8c88, text: 'dlgHype' }]);
  }, 120_000);

  it.skipIf(!HAVE_ELF)('everything else equals the pin: members, sets, tallies per dialog, edges, classes, the table\'s names', () => {
    const pinned = JSON.parse(readFileSync(PIN, 'utf8'));
    const now = JSON.parse(JSON.stringify(pinnedView(inventory(), readLoc(DISC ?? ''))));
    const keys = Object.keys(pinned).filter((k) => k !== 'persistentValves' && k !== 'persistentValveValues');   // the card's: the reader's check below
    for (const key of keys) expect(now[key], key).toEqual(pinned[key]);
    expect(Object.keys(now).sort()).toEqual(keys.sort());
  }, 120_000);
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
/** The saved card O15 was read from, and the fixture cards beside it. */
const CARDS = PC_ROOT ? [
  'logs/parity/f0/mc0/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII',
  ...['created', 'one', 'two', 'virgin'].map((c) => `third_party/ps2recomp/ps2xTest/fixtures/cards/${c}.bin`),
].map((c) => resolve(PC_ROOT, c)).filter((c) => existsSync(c)) : [];

describe.skipIf(CARDS.length === 0)('the card\'s PersistentValves.rdr through the TypeScript card codec (SOCOM_PC_ROOT)', () => {
  it('is 4,144 bytes naming 65 valves, the same names on every card, none a volume, brightness or stick slider', () => {
    const pinned = JSON.parse(readFileSync(PIN, 'utf8')).persistentValves as string[];
    for (const card of CARDS) {
      const bytes = persistentValvesOf(new Uint8Array(readFileSync(card)));
      expect(bytes, card).not.toBeNull();
      expect(bytes!.length, card).toBe(4144);
      const names = valveNames(parseRdr(bytes!));
      expect(names.length, card).toBe(65);
      expect(names, card).toEqual(pinned);
      expect(names.filter((n) => /volume|bright|sensitiv|inertia|deadzone|accel/i.test(n)), card).toEqual([]);
    }
  }, 120_000);

  // The f0 card absent (the fixture cards only), its values are not checked: a skip, not a pass.
  const f0 = CARDS.find((c) => c.replace(/\\/g, '/').includes('logs/parity/f0/'));
  it.skipIf(!f0)('the pin\'s values are the f0 card\'s (OPT-02; research 229 §2)', () => {
    const pinned = JSON.parse(readFileSync(PIN, 'utf8')).persistentValveValues as Record<string, number>;
    expect(valveValues(parseRdr(persistentValvesOf(new Uint8Array(readFileSync(f0!)))!))).toEqual(pinned);
  }, 120_000);
});
