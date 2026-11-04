import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { CardSlots, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, type CardStorage } from '@s2u/card';
import { decodeUiSet, parseAnimSets, type UiOp } from '@s2u/scene';
import {
  loadDialog, MenuCommands, UiCommandHost, UiVarManager, UniverseList, ValveStore, VALVE_TYPE,
  type DialogPartsHost, type FrontEndMachine, type ZAnimUiCommand,
} from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { readGlobalValves, VALVE_MODULE } from '../../packages/viewer/src/originalOptions';
import { connectPersona } from '../../packages/viewer/src/personaHost';
import { OPTION_TOGGLES, OPTION_TOGGLES_LEFT_OUT, PLAYTHROUGH_STATE, pinnedValves, tableDefaults } from '../../packages/viewer/test/optionToggles';
import { persistentValvesOf, valveNames, valveValues } from '../dialogInventory';
import { discRoot } from '../dump-dialogs';

/**
 * OPT-02's dev-host checks (web research 229 §2, §3; roadmap 04 OPT-02 under R7): the page's save at the registry's
 * defaults against the saved cards, and the toggles' transcription (`packages/viewer/test/optionToggles.ts`) against
 * the disc's layouts and scripts.
 *
 * - **The save.** `global_valves.rdr` read whole and loaded as `CValve_Open` loads it (every row `set`, its type word
 *   else PERM: `FUN_00351d40`, the call D:L152619); then the page's own save path -- `connectPersona`'s config under
 *   OPT-05i's `SaveConfig` over PLAT-26a's libmc -- writes slot 1's `BASCUS-97275SOCOMII`, and its `CValveSaveManager`
 *   module is compared, name by name and value by value, with the `PersistentValves.rdr` of the f0 card and the two
 *   archived cards (`s16_l1b_step0`, `s16_l1b_step0b`), read with the dev tool (`tools/dialogInventory.ts`).
 * - **The toggles.** Each row's binding is the layout's (a strip's box's ONCHECK, a button's or the dialog's pad) and
 *   its VALVE commands are the animation's, in order; every box of the five dialogs' strips is a row or left out.
 *
 * The disc is `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; the cards are under `SOCOM_PC_ROOT`. Without them every
 * test skips. Nothing here is proven: the recomp's toggle-and-diff runs are OPT-19's.
 */
const DISC = discRoot();
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const CARD = 'mc0/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII';
const CARDS = PC_ROOT ? {
  f0: resolve(PC_ROOT, 'logs/parity/f0', CARD),
  s16_l1b_step0: resolve(PC_ROOT, 'logs/parity/s16_l1b_step0', CARD),
  s16_l1b_step0b: resolve(PC_ROOT, 'logs/parity/s16_l1b_step0b', CARD),
} : null;
const HAVE_CARDS = !!CARDS && Object.values(CARDS).every((c) => existsSync(c));

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

/** A card's `PersistentValves.rdr` as the dev tool reads it: its names in order and its values. */
function cardValves(path: string): { names: string[]; values: Record<string, number> } {
  const bytes = persistentValvesOf(new Uint8Array(readFileSync(path)));
  if (!bytes) throw new Error(`${path}: no PersistentValves.rdr`);
  const root = parseRdr(bytes);
  return { names: valveNames(root), values: valveValues(root) };
}

/** The page's save on an empty formatted card: `SaveConfig` through `connectPersona` with `valves` as the registry. */
function pageSave(valves: ValveStore): Record<string, number> {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const libmc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  const machine = { valves, shell: () => ({ currentName: 'dlgOptions_Menu.rdr', inputString: () => null, event: () => true }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const menu = new MenuCommands({ valves: () => valves, uiVars, card: libmc, event: () => {} });
  menu.register(host);
  connectPersona(host, { machine: () => machine, uiVars, libmc, menu, universes: new UniverseList({ uiVars }), parts: { current: null } as unknown as DialogPartsHost, log: () => {} });
  // As Ensure_MC_Dirs leaves the card before SaveConfig: the folder made and entered.
  slots.slot(1).makeDir(PERSONA_SAVE_DIR.slice(1), slots.slot(1).info().rev);
  if (libmc.chdir(0, 0, PERSONA_SAVE_DIR).result < 0) throw new Error('no save folder');
  const cmd: ZAnimUiCommand = { anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SaveConfig', arg: 'BASCUS-97275SOCOMII', loc: 0, bytes: new Uint8Array(0x18) };
  expect(host.dispatch(cmd).answer).toBe(true);
  const read = slots.slot(1).readFile(PERSONA_FILE_PATH.slice(1));
  if (!read.ok) throw new Error(JSON.stringify(read.failure));
  return (read.value.data as Record<string, Record<string, number>>)[VALVE_MODULE]!;
}

describe.skipIf(!DISC || !HAVE_CARDS)('OPT-02: the page\'s save at the registry\'s defaults against the saved cards (SOCOM_PC_ROOT)', () => {
  it('global_valves.rdr declares the 65 PERSIST in the cards\' order, at the defaults the unit tests use', async () => {
    const entries = await readGlobalValves(new FsAssetSource(DISC!));
    const persist = entries.filter((e) => e.type?.toUpperCase() === 'PERSIST');
    expect(persist.map((e) => e.name)).toEqual(pinnedValves().names);
    expect(Object.fromEntries(persist.map((e) => [e.name, e.value]))).toEqual(tableDefaults());
  }, 120_000);

  it('holds exactly the 65 names of the f0 and archived cards, in their order, with their values -- the f0 card\'s two playthrough values aside', async () => {
    const valves = new ValveStore();
    valves.loadValves(await readGlobalValves(new FsAssetSource(DISC!)), VALVE_TYPE.PERM);
    const saved = pageSave(valves);
    const cards = Object.fromEntries(Object.entries(CARDS!).map(([k, p]) => [k, cardValves(p)]));
    for (const [k, c] of Object.entries(cards)) expect(Object.keys(saved), k).toEqual(c.names);
    expect(saved, 's16_l1b_step0').toEqual(cards.s16_l1b_step0!.values);
    expect(saved, 's16_l1b_step0b').toEqual(cards.s16_l1b_step0b!.values);
    const f0 = cards.f0!.values;
    expect(f0).toEqual(pinnedValves().values);
    expect(Object.keys(saved).filter((n) => saved[n] !== f0[n])).toEqual(Object.keys(PLAYTHROUGH_STATE));
    for (const [n, s] of Object.entries(PLAYTHROUGH_STATE)) expect([saved[n], f0[n]], n).toEqual([s.table, s.f0]);
  }, 120_000);

  it('OPT-02b (W15.R6): a live session booted by the page\'s own path (readFrontEndDisc, FrontEndSession) saves exactly the 65, in the cards\' order, at the table\'s values', async () => {
    const disc = await readFrontEndDisc(new FsAssetSource(DISC!));
    // The table as the boot reads it: 185 rows, 65 typed PERSIST, the rest untyped (PERM, the call's fallback) -- none PERM or TEMP.
    expect([disc.globalValves?.length, disc.globalValves?.filter((e) => e.type !== undefined).map((e) => e.type!.toUpperCase()).filter((t) => t !== 'PERSIST')]).toEqual([185, []]);
    const s = new FrontEndSession({ disc, loader: false });
    const saved = pageSave(s.opener.valves);
    const step0 = cardValves(CARDS!.s16_l1b_step0);
    expect(Object.keys(saved)).toEqual(step0.names);
    expect(saved).toEqual(step0.values);
    expect(s.opener.valves.find('SecurePassword')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
    s.close();
  }, 120_000);
});

describe.skipIf(!DISC)('OPT-02: the toggles\' transcription is the disc\'s (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  const read = (): { design: (d: string) => ReturnType<typeof loadDialog>; program: (d: string, a: string) => UiOp[] } => {
    const ui = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UI/READERC.ZAR'))));
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
    return {
      design: (d) => { const k = ui.find(d); if (!k) throw new Error(`no ${d}`); return loadDialog(parseRdr(ui.data(k))); },
      program: (d, a) => {
        const set = sets.find((s) => s.name.toLowerCase() === d.toLowerCase());
        // The animation lookup compares case-blind (FUN_0026c8f0 through FUN_00198b80; research 107 R107.2).
        const p = set ? [...decodeUiSet(set)].find(([name]) => name.toLowerCase() === a.toLowerCase())?.[1] : undefined;
        if (!p) throw new Error(`${d}: no animation ${a}`);
        return p.sequences.flatMap((q) => q.ops);
      },
    };
  };

  it('each row\'s binding is the layout\'s and its VALVE commands are the animation\'s, in order', () => {
    const { design, program } = read();
    for (const t of OPTION_TOGGLES) {
      const d = design(t.dialog), at = `${t.dialog} ${t.animation}`;
      if ('strip' in t.bound) {
        const { strip, box } = t.bound;
        const s = d.controls.find((c) => c.name === strip)?.widget;
        const sub = s?.type === 'RADIOSTRIP' ? s.subordinates.find((b) => b.name === box)?.widget : undefined;
        expect(sub?.type === 'CHECKBOX' ? sub.onCheck.animation : null, at).toBe(t.animation);
      } else if ('button' in t.bound) {
        const { button, pad } = t.bound;
        const w = d.controls.find((c) => c.name === button)?.widget;
        expect(w && 'button' in w ? w.button.bindings.some((b) => b.name === pad && b.animation === t.animation) : false, at).toBe(true);
      } else {
        const { pad } = t.bound;
        expect(d.bindings.some((b) => b.name === pad && b.animation === t.animation), at).toBe(true);
      }
      const ops = program(t.dialog, t.animation);
      const writes = ops.flatMap((o) => (o.op === 'valve' ? [[o.valve, o.operation, o.operand]] : []));
      expect(writes, at).toEqual(t.ops.map((o) => [...o]));
      // A condition before the last write gates the row (`when`); one after the writes (the stick presets') gates none.
      const firstIf = ops.findIndex((o) => o.op === 'if'), lastWrite = ops.map((o) => o.op).lastIndexOf('valve');
      expect(firstIf >= 0 && firstIf < lastWrite, at).toBe(t.when !== undefined);
    }
  }, 120_000);

  it('every box of the five dialogs\' strips is a row or left out with its reason', () => {
    const { design } = read();
    const dialogs = ['dlgOptions_Menu.rdr', 'dlgOptions_Audio.rdr', 'dlgOptions_Video.rdr', 'dlgControllerSelection.rdr', 'dlgOnlineOptions.rdr'];
    const listed = new Set([
      ...OPTION_TOGGLES.flatMap((t) => ('strip' in t.bound ? [`${t.dialog}/${t.bound.strip}/${t.bound.box}`] : [])),
      ...OPTION_TOGGLES_LEFT_OUT.map((l) => `${l.dialog}/${l.strip}/${l.box}`),
    ]);
    const boxes = dialogs.flatMap((d) => design(d).controls.flatMap((c) => (c.widget.type === 'RADIOSTRIP' ? c.widget.subordinates.map((b) => `${d}/${c.name}/${b.name}`) : [])));
    expect(boxes.sort()).toEqual([...listed].sort());
  }, 120_000);
});
