import { beforeAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadLocService } from '@s2u/scene';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { CaptionSource } from '../../src/text/captions';
import { ListboxWidget } from '../../src/widgets/listbox';
import { RadioStripWidget } from '../../src/widgets/radioStrip';
import { LOGIN_CONNECT_HOLD_TICKS } from '../../src/screens/netLoginCommands';
import { DISC, HAVE_DISC, LOGIN_ENTRY, netLoginRig } from './netLoginRig';

/**
 * ONL-01 over the disc (a dev-disc test, W6.R8; web research 144 §6): LOGIN TO SOCOM II ONLINE (`dlgNetLogin.rdr`)
 * opened with every module of the path registered, its own ANIMATIONS run through the real command bodies, and the
 * cursor walked over its rows -- LOGIN, SELECT NETWORK CONFIGURATION, SELECT MEMORY CARD slot, EDIT NETWORK
 * CONFIGURATIONS -- by PLAT-11's dispatch of a pad snapshot. Names, valve and variable values, the widgets' states; no
 * frame (the frame is `tools/test/netLoginScore.test.ts`'s). The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`;
 * with neither (CI) every test skips.
 */

/** ONSTART's `SuspendMenuInput(3.0)`, its 2-s WAIT and OpenCardOne's `IF NetCnfIsInited != 1` wait: 3.1 s of ticks. */
const SETTLED = 93;

describe.skipIf(!HAVE_DISC)(`LOGIN TO SOCOM II ONLINE over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  /** PLAT-04's tables (UIMn's 559-586 are LOGIN's), so the help line and the title carry their text. */
  let captions: CaptionSource | null = null;
  beforeAll(async () => { captions = (await loadLocService(new FsAssetSource(DISC), 'RUN/MP2.ZDB')).service; });

  it('ONSTART runs through the real bodies: no row is left to a later task; the card\'s one configuration is the list\'s row, LOGIN lit', () => {
    const t = netLoginRig();
    expect(t.run(1)).toEqual(['', 'dlgNetLogin.rdr']);
    t.run(SETTLED);
    expect(t.notImplemented()).toEqual([]);
    for (const row of ['SuspendMenuInput', 'ClearUIVar', 'IsMemCardInserted', 'IsMemCardFormatted', 'NetCnfInit', 'NetGetInterfaceList', 'TestUIVar', 'MC_ChPort', 'NetCnfClose', 'NetCnfOpen', 'NetCnfCurrCombo', 'PasswordSecurity']) {
      expect(t.tableHits(row), row).toBeGreaterThan(0);
    }
    expect(t.iopCalls).toEqual(['list mc0:']);                     // OpenCardOne: NetCnfOpen(mc0:)
    expect(t.events).toEqual([]);                                   // no NETCNF_ERROR, no MEMCARD_ERROR
    expect(t.m.valves.find('NetCnfIsInited')!.value).toBe(1);
    expect(t.m.valves.find('MemcardOpen')!.value).toBe(1);
    expect(t.m.valves.find('SELECTED_COMBO')!.value).toBe(0);
    // NETCNF_DB holds the one row; COMBOLIST and HWLIST follow it (research 144 §3), the focus on it (op7 SELECTED_COMBO).
    expect(t.uiVars.find('NETCNF_DB')!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [
      { type: 'int', value: 1 }, { type: 'string', value: LOGIN_ENTRY.name }, { type: 'string', value: LOGIN_ENTRY.hardware },
    ] }] });
    const combo = t.parts.current!.widgets.get('COMBOLIST') as ListboxWidget, hw = t.parts.current!.widgets.get('HWLIST') as ListboxWidget;
    expect(combo.items.map((i) => i.captions)).toEqual([['1', LOGIN_ENTRY.name]]);                       // COLUMNS 0, 40: "1 Setting 1"
    expect(hw.items.map((i) => i.captions)).toEqual([['1', LOGIN_ENTRY.name, LOGIN_ENTRY.hardware]]);   // three columns, the third at 0: the HARDWARE line
    expect([combo.focus, hw.focus]).toEqual([0, 0]);
    expect(hw.noSelect).toBe(true);                                 // the HARDWARE line: no highlight
    // LOGIN is the lit row (ActivateButton(login_btn) after EnableButton), the strip on slot 1.
    expect(t.focused()).toBe('login_btn');
    const strip = t.parts.current!.widgets.get('MemoryCard') as RadioStripWidget;
    expect(strip.selection).toBe(0);
    expect(t.sound.log.some((l) => l.startsWith('play'))).toBe(true);   // .DINK played at the open
    expect(t.m.shell()!.popups.shown(t.m.shell()!.screen)).toBe(false);   // #572 raised and killed in one step: never drawn
  }, 120_000);

  it('the cursor walk (DOWN, DOWN, DOWN, DOWN wraps; UP back): each row\'s ONACTIVATE writes the help line', () => {
    const t = netLoginRig({ captions });
    t.run(1 + SETTLED);
    expect(t.focused()).toBe('login_btn');
    const help = () => t.text('DescriptionText');
    expect(t.text('bar_title')).toBe('LOGIN TO SOCOM II ONLINE');          // OnLoginactive: #568 (ComeFromLan 0)
    expect(t.text('Slot_title')).toBe('MEMORY CARD slot 1');               // OpenCardOne: #559
    const atLogin = help();
    expect(atLogin).toContain('Login to SOCOM II to play online.');        // #569 (A_31's help line)
    t.press('DOWN');
    expect(t.focused()).toBe('selectBtn');                          // OnSelectactive: #582
    const atSelect = help();
    expect(atSelect).toContain('Select your NETWORK CONFIGURATION from the list.');   // #582
    t.press('DOWN');
    expect(t.focused()).toBe('MemoryCard');                         // MemcardAct: #575
    const atCard = help();
    expect(atCard).toContain('Select which MEMORY CARD slot to access.');  // #575 (the recomp's 00_login help line)
    t.press('DOWN');
    expect(t.focused()).toBe('configureBtn');                       // OnConfigureactive: #583
    const atEdit = help();
    expect(atEdit).toContain('Edit your NETWORK CONFIGURATIONS.');          // #583 (A_06's help line)
    // COMBOLIST and HWLIST, disabled by ONSTART (their +0x4c the base element's bit writer 0x1fde10), are skipped; the
    // CONTROLS list then wraps past its first four -- the IMAGEs MainWindow, GreenBackTitle2, memcard_back and the TEXT
    // hw_title -- which their creation left disabled: the plain bitmap's constructor (`FUN_0020cd50` D:L65834-65853,
    // its copy at D:L278176) and the text's set-up (`FUN_003792f0` D:L273066) clear the bit the base's reader 0x1fe270
    // answers with. DOWN on EDIT NETWORK CONFIGURATIONS lands on LOGIN at once (research 116 §17, which corrects
    // research 144 R144.3's "four dead steps": that reading traced the reader and not the constructors).
    const bit = (name: string): boolean => t.input.ring()!.controls.find((c) => c.name === name)!.enabled();
    expect(['MainWindow', 'GreenBackTitle2', 'memcard_back', 'hw_title'].map(bit)).toEqual([false, false, false, false]);
    t.press('DOWN');
    expect(t.focused()).toBe('login_btn');                          // round to LOGIN
    expect(help()).toBe(atLogin);
    t.press('UP');
    expect(t.focused()).toBe('configureBtn');                       // and back the same way
    expect(help()).toBe(atEdit);
    expect(new Set([atLogin, atSelect, atCard, atEdit]).size).toBe(4);   // four help lines, each its own caption (#569, #582, #575, #583)
    // COMBOLIST and HWLIST are not on the walk: disabled by ONSTART, the list opened only by SELECT NETWORK CONFIGURATION.
    expect((t.parts.current!.widgets.get('COMBOLIST') as ListboxWidget).enabled).toBe(false);
  }, 120_000);

  it('SELECT NETWORK CONFIGURATION: CROSS opens the list (ActivateComboList), CROSS on the row selects it (SelectCombo: SELECTED_COMBO, back to the button), TRIANGLE closes it', () => {
    const t = netLoginRig();
    t.run(1 + SETTLED);
    t.press('DOWN');
    expect(t.focused()).toBe('selectBtn');
    t.press('CROSS');
    const combo = t.parts.current!.widgets.get('COMBOLIST') as ListboxWidget;
    expect([t.focused(), combo.enabled, combo.state]).toEqual(['COMBOLIST', true, 'active']);
    t.press('DOWN');                                                // one row: no move
    expect(combo.focus).toBe(0);
    t.press('CROSS', 6);
    expect(t.m.valves.find('SelectedDifCombo')!.value).toBe(1);
    expect(t.m.valves.find('SELECTED_COMBO')!.value).toBe(0);
    expect([t.focused(), combo.enabled]).toEqual(['selectBtn', false]);
    t.press('CROSS');
    expect(t.focused()).toBe('COMBOLIST');
    t.press('TRIANGLE', 4);                                         // DeactivateComboList
    expect([t.focused(), combo.enabled]).toEqual(['selectBtn', false]);
  }, 120_000);

  it('SELECT MEMORY CARD slot: RIGHT on the strip checks slot 2 (OpenCardTwo): a second card without a configuration shows the no-configuration popup (#581); CONTINUE returns to EDIT NETWORK CONFIGURATIONS', () => {
    const t = netLoginRig();
    t.run(1 + SETTLED);
    t.press('DOWN'); t.press('DOWN');
    expect(t.focused()).toBe('MemoryCard');
    const strip = t.parts.current!.widgets.get('MemoryCard') as RadioStripWidget;
    t.press('RIGHT', 8);
    expect(strip.selection).toBe(1);
    expect(t.iopCalls).toEqual(['list mc0:', 'list mc1:']);
    expect(t.m.valves.find('MemcardOpen')!.value).toBe(2);
    const g = t.m.shell()!;
    expect(g.popups.shown(g.screen)).toBe(true);                    // #581 over the dimmed screen
    expect(t.uiVars.find('NETCNF_DB')!.value).toEqual({ type: 'array', value: [] });
    t.press('CROSS', 8);                                            // CONTINUE: SitHere = 1
    expect(g.popups.shown(g.screen)).toBe(false);
    expect(t.focused()).toBe('configureBtn');                       // ActivateButton(configureBtn); LOGIN and SELECT disabled
    expect((t.parts.current!.widgets.get('login_btn') as RadioStripWidget).enabled).toBe(false);
    t.press('UP');                                                 // back up to the strip (the list rows stay off the ring)
    expect(t.focused()).toBe('MemoryCard');
    t.press('LEFT', 8);                                             // back to slot 1: OpenCardOne lists the configuration again
    expect(strip.selection).toBe(0);
    expect(t.iopCalls).toEqual(['list mc0:', 'list mc1:', 'list mc0:']);
    expect(t.focused()).toBe('login_btn');
  }, 120_000);

  it('LOGIN: CROSS runs proceed_net_login -- NetCnfSelectCombo, NetCnfUnInit, RebootIOP(MULTIPLAYER), the switch to dlgNetAuthenticate', () => {
    const t = netLoginRig();
    t.run(1 + SETTLED);
    expect(t.focused()).toBe('login_btn');
    t.press('CROSS', 0);
    const seen = t.run(60 + LOGIN_CONNECT_HOLD_TICKS);              // the popup's 0.1-s WAIT, OT.R20's hold, the switch and its fade
    expect(seen).toEqual(['dlgNetLogin.rdr', 'dlgNetAuthenticate.rdr']);
    expect(t.iopCalls).toEqual(['list mc0:', 'select mc0: Combination1']);
    for (const row of ['NetCnfSelectCombo', 'NetCnfUninit', 'RebootIOP']) expect(t.tableHits(row), row).toBeGreaterThan(0);
    expect(t.m.valves.find('net_config_is_init')!.value).toBe(0);
    expect(t.notImplemented('dlgNetLogin.rdr')).toEqual([]);
  }, 120_000);

  it('OT.R20: CROSS to the DNAS screen\'s build -- 23 frames with the hold at 0 (the numbers before it), 23 + 90 with the owner\'s', () => {
    /** Frames from the frame CROSS goes down to the one the DNAS screen is built on. */
    const framesToDnas = (connectHoldSeconds?: number): number => {
      const t = netLoginRig(connectHoldSeconds === undefined ? {} : { connectHoldSeconds });
      t.run(1 + SETTLED);
      expect(t.focused()).toBe('login_btn');
      t.press('CROSS', 0);
      let n = 2;                                                   // CROSS's two frames (down, then up)
      const built = (): boolean => t.m.shell()?.currentName === 'dlgNetAuthenticate.rdr' && t.m.shell()!.switchState < 0;
      while (!built() && n < 400) { t.frame(); n++; }
      return n;
    };
    const before = framesToDnas(0);
    expect(before).toBe(23);                                       // WAIT 0.1 (3 ticks), the switch, its fade 15 + 3 + 1
    expect(framesToDnas()).toBe(before + LOGIN_CONNECT_HOLD_TICKS);
  }, 120_000);

  it('TRIANGLE: exit_net_login -- NetCnfUnInit, RebootIOP(MAINMENU), back to dlgMenu', () => {
    const t = netLoginRig();
    t.run(1 + SETTLED);
    t.press('TRIANGLE', 0);
    expect(t.run(60)).toEqual(['dlgNetLogin.rdr', 'dlgMenu.rdr']);
    expect(t.tableHits('NetCnfUninit')).toBe(1);
  }, 120_000);

  it('a card error on the way (NETCNF_ERROR with errno 15) shows #585 and leaves EDIT NETWORK CONFIGURATIONS lit', () => {
    const t = netLoginRig({ lists: { 'mc0:': { result: -15, entries: [] } } });
    t.run(1 + SETTLED);
    expect(t.events).toEqual([DIALOG_EVENTS.NETCNF_ERROR]);
    expect(t.m.valves.find('NETCNF_ERRNO')!.value).toBe(15);
    const g = t.m.shell()!;
    expect(g.popups.shown(g.screen)).toBe(true);
    expect(t.focused()).toBe('configureBtn');
  }, 120_000);
});
