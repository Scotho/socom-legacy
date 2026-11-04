import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CardSlots, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, UI_VAR_MODULE, type CardStorage } from '@s2u/card';
import {
  MenuCommands, UiCommandHost, UiVarManager, UniverseList, VALVE_TYPE, type DialogPartsHost, type FrontEndMachine, type ValveStore, type ZAnimUiCommand,
} from '@s2u/ui';
import { connectPersona } from '../../packages/viewer/src/personaHost';
import { HAVE_DISC, netLoginRig } from '../../packages/ui/test/screens/netLoginRig';
import { readRdrTree, readSaveFile, saveModules } from '../cardFile';

/**
 * OPT-15's acceptance (roadmap 04 OPT-15 under R7; web research 265 §1): the card after ONLINE OPTIONS' SAVE against
 * `logs/parity/s16_l1b_step0b`, the card the recomp wrote on its first online session, which holds the default SOPs and
 * taunts -- dev host only. R7: the browser's card holds JSON, so the SOP and taunt values are compared, the recomp's card
 * read with the dev tool (`tools/cardFile.ts`), the page's through its own save path: `dlgNetLogin.rdr` opened as the
 * page opens it (`netLoginRig`, its ONSTART adds `MPLOCALSOP1-5` and `MPTAUNTMSG1-5` at longevity 3 with their HudCLOC
 * keys), then `SaveConfig(BASCUS-97275SOCOMII)` -- the command ONLINE OPTIONS' SAVE (`ForceSave` -> `save_and_leave`)
 * and RETURN with a change end in (research 301 §6) -- through `connectPersona` over PLAT-26a's libmc. The f0 card, an
 * offline playthrough's, holds the module empty: the ten are written once the game has been online (§1's reading).
 * The disc is `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; the cards are under `SOCOM_PC_ROOT`; without them the suite
 * skips. Nothing here is proven: the recomp's toggle-and-card-diff runs are OPT-19's (H25).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const CARD = 'mc0/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII';
const STEP0B = PC_ROOT ? resolve(PC_ROOT, 'logs/parity/s16_l1b_step0b', CARD) : '';
const F0 = PC_ROOT ? resolve(PC_ROOT, 'logs/parity/f0', CARD) : '';
const HAVE_CARDS = !!PC_ROOT && existsSync(STEP0B) && existsSync(F0);
const TEN = [1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`).concat([1, 2, 3, 4, 5].map((n) => `MPTAUNTMSG${n}`));

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

/** A recomp card's `CUIVarManager` keys as the dev tool reads them: each name (less `.rdr`) and its record's one string. */
function cardUiVars(path: string): [string, unknown][] {
  const ui = saveModules(readSaveFile(new Uint8Array(readFileSync(path)))).find((m) => m.name === UI_VAR_MODULE)!;
  return ui.children.map((c) => {
    const tree = readRdrTree(c.data) as { type: string; items?: { type: string; value?: unknown }[] };
    return [c.name.replace(/\.rdr$/, ''), tree.type === 'list' && tree.items?.length === 1 ? tree.items[0]!.value : tree];
  });
}

/** The page's `SaveConfig` on an empty formatted card with the session's variables and valves: the file's `CUIVarManager` module. */
function pageSave(uiVars: UiVarManager, valves: ValveStore): [string, unknown][] {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const libmc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  const machine = { valves, shell: () => ({ currentName: 'dlgOnlineOptions.rdr', inputString: () => null, event: () => true }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
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
  const module = (read.value.data as Record<string, Record<string, { type: string; value: unknown }>>)[UI_VAR_MODULE] ?? {};
  return Object.entries(module).map(([name, v]) => [name, v.value]);
}

describe.skipIf(!HAVE_DISC || !HAVE_CARDS)('OPT-15: the SOPs and taunts after SAVE against s16_l1b_step0b (SOCOM_PC_ROOT; R7, the values compared)', () => {
  it('the recomp\'s cards: s16_l1b_step0b holds the ten, MPLOCALSOP1-5 then MPTAUNTMSG1-5, each its HudCLOC key 60757-60766; f0 (offline) none', () => {
    const card = cardUiVars(STEP0B);
    expect(card.map(([n]) => n)).toEqual(TEN);
    expect(card.map(([, v]) => Number(/^_(\d+)_/.exec(String(v))?.[1]))).toEqual([60757, 60758, 60759, 60760, 60761, 60762, 60763, 60764, 60765, 60766]);
    expect(cardUiVars(F0)).toEqual([]);
  });

  it('the page\'s SAVE after dlgNetLogin\'s ONSTART writes the same ten names and values, in the card\'s order', () => {
    const t = netLoginRig();
    t.run(1);
    t.m.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    expect(pageSave(t.uiVars, t.m.valves)).toEqual(cardUiVars(STEP0B));
  }, 120_000);

  it('an edited SOP and taunt (as SETUP MESSAGING\'s and SETUP TAUNTS\' keyboards leave them) differ from the card at those two keys only', () => {
    const t = netLoginRig();
    t.run(1);
    t.m.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    for (const name of ['MPLOCALSOP2', 'MPTAUNTMSG4']) t.uiVars.set(t.uiVars.find(name)!, { type: 'string', value: `edited ${name}` });
    const page = pageSave(t.uiVars, t.m.valves), card = cardUiVars(STEP0B);
    expect(page.map(([n]) => n)).toEqual(TEN);
    expect(TEN.filter((_, i) => page[i]![1] !== card[i]![1])).toEqual(['MPLOCALSOP2', 'MPTAUNTMSG4']);
  }, 120_000);
});
