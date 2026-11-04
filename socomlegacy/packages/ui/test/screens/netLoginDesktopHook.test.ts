import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets } from '@s2u/scene';
import { dialogLookup } from '../../src/screens/dialogArchive';
import type { MenuCardIo } from '../../src/screens/menuCommands';
import { NetLoginCommands, type NetCnfIop } from '../../src/screens/netLoginCommands';
import { UiVarManager } from '../../src/uiVars';
import { ListboxWidget } from '../../src/widgets/listbox';
import type { ZAnimRtSet } from '../../src/zanimRuntime';
import {
  DESKTOP_SCREEN_HOOKS, MENU_03_HOOKS, MENU_08_HOOKS, ONL_02_HOOKS, bindersOf, boundAnimation, checkDesktopHook, desktopHookRig,
} from '../../src/desktopScreen/index';
import { NTGUI_RETURN_DIALOG, ONL_02_RETURN_FOCUS_READING } from '../../src/screens/netLoginDesktopHook';
import { HAVE_DISC, LOGIN_ENTRY, netLoginRig } from './netLoginRig';

/**
 * ONL-02 -- EDIT NETWORK CONFIGURATIONS as a desktop-only row (web research 145; OT.R3: Sony's network set-up program is
 * not built, the row leads to PLAT-28's screen). The hook is registered with PLAT-28's API (`ONL_02_HOOKS` appended to
 * `DESKTOP_SCREEN_HOOKS`) and held by PLAT-28's harness over the real `dlgNetLogin.rdr` with ONL-01's NetCnf rows: the
 * screen at CROSS on the row, CONTINUE back to LOGIN with the cursor on EDIT NETWORK CONFIGURATIONS, every valve, UI
 * variable and card byte as the untouched twin's, `launchNTGUI2` (`SwitchMenu(SHUTDOWN)`) never started.
 *
 * The files come from the disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures
 * (`S2U_TEST_FIXTURES`, else `test-fixtures/`): CI runs it on the fixtures. The replay of `dlgReturnFromNTGUI2` needs
 * the disc (`netLoginRig`, READERX): a dev-disc test. Names, ids and decoded values only (RS.R8).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const NEEDED = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'];
const ROOT = [DISC, FIXTURES].find((r) => r !== '' && NEEDED.every((p) => existsSync(join(r, p)))) ?? '';
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(ROOT, p)));

const HOOK = ONL_02_HOOKS[0]!;

describe('ONL-02\'s hook, registered with PLAT-28\'s API', () => {
  it('one hook: CROSS on dlgNetLogin\'s configureBtn replaces launchNTGUI2; appended to the page\'s list after MENU-03\'s and MENU-08\'s', () => {
    expect(ONL_02_HOOKS).toEqual([{
      task: 'ONL-02', feature: 'EDIT NETWORK CONFIGURATIONS', dialog: 'dlgNetLogin.rdr', control: 'configureBtn', press: 'CROSS', replaces: 'launchNTGUI2',
    }]);
    expect(DESKTOP_SCREEN_HOOKS).toEqual([...MENU_03_HOOKS, ...MENU_08_HOOKS, ...ONL_02_HOOKS]);
    expect(HOOK.removableBy).toBeUndefined();                      // OT.R3: Sony's program is never built
  });
});

let env: { sets: ZAnimRtSet[]; lookup: ReturnType<typeof dialogLookup> } | null = null;
function environment() {
  return (env ??= { sets: parseAnimSets(Zar.parse(read('RUN/UIZANIM.ZAR'))).sets, lookup: dialogLookup([Zar.parse(read('RUN/UI/READERC.ZAR'))]) });
}

/** Both ports inserted and formatted, nothing on them the rows read (the card diff: its log of writes, none). */
function card(): { io: MenuCardIo; state: () => string } {
  const writes: string[] = [];
  const io: MenuCardIo = {
    getInfo: () => ({ result: 0, type: 2, format: 1 }),
    getDir: () => ({ result: -4 }),
    chdir: () => ({ result: -4 }),
    mkdir: (port, _slot, path) => { writes.push(`mkdir ${port} ${path}`); return -4; },
  };
  return { io, state: () => JSON.stringify(writes) };
}

/** PLAT-28's rig on LOGIN, with ONL-01's NetCnf rows over a fake eznetcnf (one combination on `mc0:`, as the page's card after OT.R3's write). */
function make() {
  const { sets, lookup } = environment();
  const uiVars = new UiVarManager();
  const c = card();
  const iop: NetCnfIop = {
    combinationList: (d) => (d === 'mc0:' ? { result: 1, entries: [LOGIN_ENTRY] } : { result: 0, entries: [] }),
    selectCombination: (_d, k) => (k === LOGIN_ENTRY.key ? 0 : -1),
    interfaces: () => [LOGIN_ENTRY.hardware],
  };
  return desktopHookRig({
    dialog: lookup, sets, startDialog: 'dlgNetLogin.rdr', card: c.io, cardState: c.state, uiVars,
    register: (host, machine) => {
      new NetLoginCommands({
        valves: () => machine().valves, uiVars, iop, inputString: (cmd) => machine().shell()?.inputString(cmd.anim) ?? null,
        event: (kind) => { machine().shell()?.event(kind); },
      }).register(host);
    },
  });
}

/** ONSTART's `SuspendMenuInput(3.0)`, its 2-s WAIT and OpenCardOne's wait (research 144 §6: 93 ticks), with margin. */
const TIMING = { settle: 120 };
/** netLoginDisc.test.ts's settle (research 144 §6). */
const SETTLED = 93;

describe.skipIf(ROOT === '')(`ONL-02 on the real dlgNetLogin (research 145)${ROOT === '' ? ' (no disc, no fixtures)' : ''}`, () => {
  it('the disc binds configureBtn CROSS to launchNTGUI2, bound nowhere else; launchNTGUI2 is .DINK then SwitchMenu(SHUTDOWN)', () => {
    const { sets, lookup } = environment();
    const design = lookup('dlgNetLogin.rdr')!;
    expect(boundAnimation(design, 'configureBtn', 'CROSS')).toBe('launchNTGUI2');
    expect(bindersOf(design, 'launchNTGUI2')).toEqual(['configureBtn BUTTON CROSS']);
    const anim = sets.find((s) => s.name === 'dlgNetLogin.rdr')!.anims.find((a) => a.name === 'launchNTGUI2')!;
    const ops = decodeUiProgram(anim as never).sequences.flatMap((s) => s.ops).map((op) =>
      op.op === 'sound' ? `sound ${op.sound}` : op.op === 'ui' ? `${op.command.fn}(${op.command.arg})` : op.op);
    expect(ops).toEqual(['sound .DINK', 'SwitchMenu(SHUTDOWN)']);
  });

  it('CROSS on EDIT NETWORK CONFIGURATIONS shows the screen; CONTINUE lands on LOGIN with the cursor on the row, all as the twin\'s', () => {
    const c = checkDesktopHook(make, HOOK, TIMING);
    expect(c.failures).toEqual([]);
    expect([c.bound, c.reached, c.shown, c.drawn, c.closed]).toEqual(['launchNTGUI2', true, true, true, true]);
    expect(c.before.dialog).toBe('dlgNetLogin.rdr');
    expect(c.after.dialog).toBe('dlgNetLogin.rdr');
    expect(c.after.focused).toBe('configureBtn');
    expect(c.after).toEqual(c.twin);
    expect(c.after.card).toBe(c.before.card);
    expect(c.chain).toEqual([]);                                   // launchNTGUI2 never started: no SHUTDOWN, no reboot
    expect(c.extra).toEqual([]);
    expect(c.shared).toEqual([]);
    expect(c.after.uiVars.some((v) => v.startsWith('NETCNF_DB='))).toBe(true);   // ONL-01's list stood under the notice
  }, 120_000);

  it('without the uiVars option the widgets follow the rig manager the rows write: COMBOLIST holds the NETCNF_DB row', () => {
    // The review's finding 1: the dialog's widgets must follow the manager the rows write, option or not.
    const { sets, lookup } = environment();
    const c = card();
    const iop: NetCnfIop = {
      combinationList: (d) => (d === 'mc0:' ? { result: 1, entries: [LOGIN_ENTRY] } : { result: 0, entries: [] }),
      selectCombination: (_d, k) => (k === LOGIN_ENTRY.key ? 0 : -1),
      interfaces: () => [LOGIN_ENTRY.hardware],
    };
    const rig = desktopHookRig({
      dialog: lookup, sets, startDialog: 'dlgNetLogin.rdr', card: c.io, cardState: c.state,
      register: (host, machine, uiVars) => {
        new NetLoginCommands({
          valves: () => machine().valves, uiVars, iop, inputString: (cmd) => machine().shell()?.inputString(cmd.anim) ?? null,
          event: (kind) => { machine().shell()?.event(kind); },
        }).register(host);
      },
    });
    rig.run(TIMING.settle);
    expect(rig.state().uiVars.some((v) => v.startsWith('NETCNF_DB='))).toBe(true);
    const combo = rig.widget('COMBOLIST') as ListboxWidget;
    expect(combo.items.map((i) => i.captions)).toEqual([['1', LOGIN_ENTRY.name]]);
  }, 120_000);

  it('without the hook the same press starts launchNTGUI2 (the control: the gate is what keeps the chain out)', () => {
    const rig = make();
    rig.run(TIMING.settle);
    for (let i = 0; i < 3; i++) { rig.press('DOWN'); rig.run(8); }
    expect(rig.focused()).toBe('configureBtn');
    rig.take();
    rig.screen.hooks.unregister(HOOK.dialog, HOOK.control, HOOK.press);
    rig.press('CROSS');
    expect(rig.take().started).toContain('launchNTGUI2');
    expect(rig.screen.current).toBeNull();
  }, 120_000);

  it('the read of dlgReturnFromNTGUI2 (READERC, 904 B): no control, ONSTART do_onstart, which ends in SWITCHMENU(dlgNetLogin.rdr)', () => {
    const { sets, lookup } = environment();
    const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
    let size = -1;
    z.walk((k) => { if (k.name === NTGUI_RETURN_DIALOG) size = z.data(k).length; });
    expect(size).toBe(904);
    const design = lookup(NTGUI_RETURN_DIALOG)!;
    expect(design.controls).toEqual([]);
    expect(design.bindings.map((b) => `${b.kind} ${b.name ?? b.code} ${b.animation}`)).toEqual(['event ONSTART do_onstart']);
    const anim = sets.find((s) => s.name === NTGUI_RETURN_DIALOG)!.anims.find((a) => a.name === 'do_onstart')!;
    const ops = decodeUiProgram(anim as never).sequences.flatMap((s) => s.ops)
      .flatMap((op): string[] => {
        if (op.op === 'call') return [`call ${op.anim}`];
        if (op.op === 'ui') return [`${op.command.fn}(${op.command.arg})`];
        if (op.op === 'if') return [`if ${op.tokens.map((t) => (t.t === 'valve' ? `${t.valve} ${t.op} ${t.operand}` : t.t === 'ui' ? `${t.command.fn}(${t.command.arg})` : t.t)).join(' ')}`];
        return [];
      });
    expect(ops).toEqual([
      'call intro_onstart', 'if HDD_ENABLE == 1', 'if HardDriveOperation(OPEN)', 'HardDriveOperation(GET_MISSION_DATA)',
      'if hard_disk_error_code != 0', 'call DisplayHDDError', 'call DisplayHDDError', 'SWITCHMENU(dlgNetLogin.rdr)',
    ]);
    // So the original's cursor after the return is wherever dlgNetLogin's own ONSTART puts it (OpenCardOne): LOGIN
    // with a configuration on slot 1, EDIT NETWORK CONFIGURATIONS without one -- the reading the note records.
    expect(ONL_02_RETURN_FOCUS_READING).toEqual({ configured: 'login_btn', unconfigured: 'configureBtn' });
  });
});

describe.skipIf(!HAVE_DISC)(`the original's return: SWITCHMENU(dlgNetLogin.rdr) builds LOGIN afresh${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  // `do_onstart`'s last op opens LOGIN as a new dialog, so its ONSTART decides the cursor. `intro_onstart` before it is
  // not replayed here: with two cards and no loaded configuration it raises UIMemCardAnim's slot popup (A_30) and reaches
  // OPT-05a's `IsSpaceForSaveGameFile` (research 145 §3: owed to OPT-05i's and OPT-05a's rows).
  it('with the configuration on slot 1, the rebuilt LOGIN lights login_btn (ONL_02_RETURN_FOCUS_READING.configured)', () => {
    const t = netLoginRig();
    t.run(1 + SETTLED);
    expect(t.m.shell()!.currentName).toBe('dlgNetLogin.rdr');
    expect(t.focused()).toBe(ONL_02_RETURN_FOCUS_READING.configured);
  }, 120_000);

  it('with no configuration on slot 1, the rebuilt LOGIN raises #578 and, at CONTINUE, lights configureBtn', () => {
    const t = netLoginRig({ lists: { 'mc0:': { result: 0, entries: [] }, 'mc1:': { result: 0, entries: [] } } });
    t.run(1 + SETTLED);
    expect(t.m.shell()!.popups.shown(t.m.shell()!.screen)).toBe(true);
    t.press('CROSS', 30);
    expect(t.m.shell()!.popups.shown(t.m.shell()!.screen)).toBe(false);
    expect(t.focused()).toBe(ONL_02_RETURN_FOCUS_READING.unconfigured);
  }, 120_000);
});
