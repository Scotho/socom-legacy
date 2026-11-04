import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { CardSlots, Libmc, type CardStorage } from '@s2u/card';
import {
  DESKTOP_SCREEN_GATE, DESKTOP_SCREEN_HOOKS, UiCommandHost, UiVarManager, checkDesktopHook, desktopHookRig, dialogLookup,
  loadDialog, type FrontEndMachine,
} from '@s2u/ui';
import { connectMenuCommands } from '../src/menuCommandsHost';
import { connectNetLogin } from '../src/netLoginHost';

/**
 * PLAT-28's screen on the page (web research 142 §6): `connectMenuCommands` sets the screen's binding gate in the
 * session's host beside MENU-01a's rows, and the harness's card diff runs over the page's own card -- PLAT-25's slot
 * store and PLAT-26a's libmc, the slices on this branch -- on the real `dlgMenu` (the disc, else the committed fixtures;
 * with neither the harness half skips). A memory storage stands in for localStorage; nothing measured on the original.
 */

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const NEEDED = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'];
const ROOT = [DISC, FIXTURES].find((r) => r !== '' && NEEDED.every((p) => existsSync(join(r, p)))) ?? '';
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(ROOT, p)));

describe('connectMenuCommands sets PLAT-28\'s gate', () => {
  it('a hooked binding of dlgMenu is taken by the gate; an unhooked one is not', () => {
    const host = new UiCommandHost();
    const machine = { valves: null, queue: { popupObject: null }, shell: () => null } as unknown as FrontEndMachine;
    const { desktop } = connectMenuCommands(host, { machine: () => machine, uiVars: new UiVarManager(), card: null });
    expect(desktop.hooks.all()).toHaveLength(DESKTOP_SCREEN_HOOKS.length);
    const r = (...kv: unknown[]): unknown[] => { const out: unknown[] = []; for (let i = 0; i < kv.length; i += 2) out.push(kv[i], [kv[i + 1]]); return out; };
    const button = (name: string, anim: string) => r('NAME', name, 'TYPE', 'BUTTON', 'XPOS', '0', 'YPOS', '0', 'SPEC', r('XSIZE', '10', 'YSIZE', '10', 'ANIMATIONS', [r('BUTTON', 'CROSS', 'ANIMATION', anim)]));
    const design = loadDialog([['SCREENS', r('CONTROLS', [button('new_game_button', 'UiprepMission1'), button('multiplayer_button', 'do_multi_or_medius')], 'OBJECTS', [])]] as never);
    expect(host.bindingStart({ dialog: 'dlgMenu.rdr', design, animation: 'UiprepMission1', argument: null })).toBe(true);
    expect(host.bindingStart({ dialog: 'dlgMenu.rdr', design, animation: 'do_multi_or_medius', argument: null })).toBe(false);
    expect(DESKTOP_SCREEN_GATE).toBe('PLAT-28');
  });
});

describe.skipIf(ROOT === '')(`the harness over the page's card slices${ROOT === '' ? ' (no disc, no fixtures)' : ''}`, () => {
  const sets = ROOT ? parseAnimSets(Zar.parse(read('RUN/UIZANIM.ZAR'))).sets : [];
  const lookup = ROOT ? dialogLookup([Zar.parse(read('RUN/UI/READERC.ZAR'))]) : () => null;

  // The main menu's hooks here; ONL-02's on dlgNetLogin below, over the page's NetCnf rows (`connectNetLogin`).
  for (const hook of DESKTOP_SCREEN_HOOKS.filter((h) => h.dialog === 'dlgMenu.rdr')) {
    it(`${hook.task} ${hook.feature}: CONTINUE leaves both slots' records byte for byte as the twin's (a card with a save folder)`, () => {
      const make = () => {
        const storage = new MemoryStorage();
        const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
        const slot = slots.slot(1);
        expect(slot.makeDir('BASCUS-97275SOCOMII', slot.info().rev as number).ok).toBe(true);
        const libmc = new Libmc(slots, { log: () => {} });
        const state = () => JSON.stringify([...storage.data].sort());
        return desktopHookRig({ dialog: lookup, sets, startDialog: 'dlgMenu.rdr', card: libmc, cardState: state });
      };
      const c = checkDesktopHook(make, hook);
      expect(c.failures).toEqual([]);
      expect(c.after.card).toBe(c.twin.card);
      expect(c.after.card).toBe(c.before.card);
      expect(c.after.card).toContain('BASCUS-97275SOCOMII');
    }, 120_000);
  }

  // ONL-02 (research 145) over the page's card and `connectNetLogin`: LOGIN's ONSTART writes OT.R3's configuration on
  // slot 1 in both rigs, the list shows it, and CONTINUE leaves both slots' records as the twin's.
  for (const hook of DESKTOP_SCREEN_HOOKS.filter((h) => h.dialog === 'dlgNetLogin.rdr')) {
    it(`${hook.task} ${hook.feature}: over the page's libmc and connectNetLogin, CONTINUE lands on the row, the card as the twin's`, () => {
      const make = () => {
        const storage = new MemoryStorage();
        const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
        const libmc = new Libmc(slots, { log: () => {} });
        const state = () => JSON.stringify([...storage.data].sort());
        return desktopHookRig({
          dialog: lookup, sets, startDialog: 'dlgNetLogin.rdr', card: libmc, cardState: state,
          register: (host, machine, uiVars) => { connectNetLogin(host, { machine, uiVars, libmc, log: () => {} }); },
        });
      };
      const c = checkDesktopHook(make, hook, { settle: 120 });
      expect(c.failures).toEqual([]);
      expect(c.after.dialog).toBe('dlgNetLogin.rdr');
      expect(c.after.focused).toBe('configureBtn');
      expect(c.chain).toEqual([]);
      expect(c.after.card).toBe(c.twin.card);
      expect(c.after.card).toBe(c.before.card);
      expect(c.after.card).toContain('BWNETCNF');                  // OT.R3's first-use write stood under the notice
      expect(c.after.uiVars.some((v) => v.startsWith('NETCNF_DB='))).toBe(true);
    }, 120_000);
  }
});
