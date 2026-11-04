import { describe, expect, it } from 'vitest';
import { ValveStore } from '../../src/valves';
import { BootStubs } from '../../src/boot/bootBindings';
import { REBOOT_LAUNCH } from '../../src/screens/launch';
import { LOBBY_STATE, LobbyClient, type LobbyService } from '../../src/screens/lobbyClient';
import { LogoffCommands } from '../../src/screens/logoffCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-10 and BOOT-10a over the machine (web research 160): from SOCOM II ONLINE (`dlgWorldOfSOCOM.rdr`), TRIANGLE runs
 * the screen's `exit_lobby` -- the #793 popup with #246 NO and #253 YES; LEFT to YES, CROSS -- and the set's own chain
 * follows: the music stopped, #422, `LobbyLogout` held until the lobby's state is 0, `UnInitNetwork`, the NetCnf rows,
 * `SWITCHMENU(REBOOT)`; the relaunch on `--menu_state dlgAfterErrorReboot.rdr` (PLAT-10's `FUN_0022ed10`) runs that
 * dialog's ONSTART and switches to `dlgMenu.rdr`, with no loader and no movie of the boot. The lobby is ONL-07's client
 * over a fake account service; the dialogs and sets are the disc's (or the committed fixtures': it runs in CI).
 */

const MENU = 'dlgMenu.rdr';
const AFTER = 'dlgAfterErrorReboot.rdr';
const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

function logoffRig(o: { logoutFails?: boolean } = {}) {
  // The page's one valve store across launches (the opener's): the lobby's valve and the scripts' in one registry.
  const valves = new ValveStore();
  const logouts: string[] = [];
  let keepAlives = 0;
  const service: LobbyService = {
    login: () => Promise.resolve({ status: 0, ticket: 'tkt' }), register: () => Promise.resolve({ status: 0 }),
    logout: (t) => { logouts.push(t); return o.logoutFails ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({ status: 0 }); },
    keepAlive: () => Promise.resolve(true),
  };
  const lobby = new LobbyClient({ valves: () => valves, service, event: () => {}, every: () => { keepAlives++; return () => { keepAlives--; }; } });
  // The boot's card answers (BootStubs: the f0 card, research 139), which dlgAfterErrorReboot's `intro_onstart` asks as
  // dlgIntroScreen's does.
  const r = worldRig({
    name: 'socomc', announcement: 'News.\n', valves,
    register: (host) => { new BootStubs({ valves }).register(host); new LogoffCommands({ lobby }).register(host); },
  });
  /** Frames with the lobby's step after each (the network update's call, `FUN_002dfe50`), the replies let in. */
  const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) { r.frame(); lobby.step(); await flush(); } };
  return { r, lobby, logouts, run, keepAlives: () => keepAlives };
}

async function loggedIn(o: { logoutFails?: boolean } = {}) {
  const x = logoffRig(o);
  x.lobby.connect('localhost', 10075);
  for (let i = 0; i < 2; i++) { await flush(); x.lobby.step(); }
  x.lobby.login('socomc', 'pw');
  for (let i = 0; i < 6; i++) { await flush(); x.lobby.step(); }
  expect([x.lobby.state(), x.lobby.ticket(), x.keepAlives()]).toEqual([LOBBY_STATE.LOGGED_IN, 'tkt', 1]);
  await x.run(60);
  x.r.press('CROSS', 10);                                            // SERVER NEWS closed
  expect(x.r.focused()).toBe('newsandmessages');
  return x;
}

describe.skipIf(!HAVE)(`the logoff over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the popup\'s captions are the disc\'s: #793 the question, #246 NO, #253 YES, #422 the wait', () => {
    const r = worldRig();
    expect([793, 246, 253, 422].map((id) => r.loc.byId.get(id))).toEqual([
      'You will be logging off of SOCOM II Online. Are you sure you want to do this?', 'NO', 'YES', 'Logging off',
    ]);
  });

  it('YES: the set\'s chain in its order -- the music stopped, #422, LobbyLogout held until the state is 0, UnInitNetwork, the NetCnf rows, the reboot', async () => {
    const x = await loggedIn();
    const { r } = x;
    r.press('TRIANGLE', 8);
    r.press('LEFT', 6);
    const from = r.outcomes.length;
    const sound = r.sound.log.length;
    r.press('CROSS', 2);
    await x.run(20);
    const chain = r.calls(WORLD, from).filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)|^RefreshRoomList|^ROOMLIST/.test(c));
    const logouts = chain.filter((c) => c.startsWith('LobbyLogout')).length;
    expect(logouts).toBeGreaterThanOrEqual(3);                        // 0 at the ask, 0 while 0x12 stands, 1 at state 0: the sequence held on the row
    expect(chain.filter((c, i) => !(c.startsWith('LobbyLogout') && chain[i - 1]?.startsWith('LobbyLogout')))).toEqual([
      'StopAllSounds(NA) table', 'VagStreaming(OFF) table', 'POPUPDIALOG(NA) table', 'POPUP.op24(NA)', 'LobbyLogout(NA) table',
      'UnInitNetwork(NA) table', 'NetCnfClose(NA) table', 'NetCnfUnInit(NA) table', 'SWITCHMENU(REBOOT) table', 'KILLPOPUP(NA) table',
    ]);
    expect(r.sound.log.slice(sound, sound + 2)).toEqual(['stopAll', 'streaming false']);
    expect(x.logouts).toEqual(['tkt']);
    expect([x.lobby.up, x.lobby.ticket(), x.keepAlives(), x.lobby.loggedIn()]).toEqual([false, null, 0, false]);
    expect(r.valve('socom_online_initialized')).toBe(0);
  }, 60_000);

  it('BOOT-10a: the reboot relaunches on dlgAfterErrorReboot.rdr and reaches the main menu -- no loader, no intro movie, no music of the online menu', async () => {
    const x = await loggedIn();
    const { r } = x;
    r.press('TRIANGLE', 8);
    r.press('LEFT', 6);
    const sound = r.sound.log.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 600 && r.current() !== MENU; i++) await x.run(1);
    await x.run(120);
    expect(r.launches).toEqual([{ elf: REBOOT_LAUNCH.elf, argv: ['--menu_state', AFTER, ''] }]);
    expect(r.builds).toEqual([WORLD, AFTER, MENU]);
    expect(r.current()).toBe(MENU);
    const after = r.calls(AFTER);                                     // do_onstart: intro_onstart's card checks, the HDD branch not taken (HDD_ENABLE 0), the switch
    expect(after.some((c) => c.startsWith('HardDriveOperation'))).toBe(false);
    expect(after[after.length - 1]).toBe('SWITCHMENU(dlgMenu.rdr) table');
    expect(r.m.shell()!.design!.background).toMatchObject({ filename: expect.stringMatching(/menuloop\.pss$/i) });
    expect(r.sound.log.slice(sound).filter((s) => s.includes('MUS_ONLINE_MENU') || s === 'streaming true')).toEqual([]);
  }, 60_000);

  it('the server unreachable at YES (the logout\'s fetch rejects): the chain still reaches the main menu -- the ticket dropped, the keep-alive stopped (LOGOUT_UNANSWERED_ADAPTATION)', async () => {
    const x = await loggedIn({ logoutFails: true });
    const { r } = x;
    r.press('TRIANGLE', 8);
    r.press('LEFT', 6);
    r.press('CROSS', 2);
    for (let i = 0; i < 600 && r.current() !== MENU; i++) await x.run(1);
    await x.run(120);
    expect(x.logouts).toEqual(['tkt']);
    expect(r.builds).toEqual([WORLD, AFTER, MENU]);
    expect([x.lobby.up, x.lobby.ticket(), x.keepAlives()]).toEqual([false, null, 0]);
  }, 60_000);

  it('BOOT-10a: the main menu\'s focus after the return is the one after the boot -- NEW GAME with no saved game (SetMenuValve: MenuButtonChanged 1)', async () => {
    const x = await loggedIn();
    const { r } = x;
    r.press('TRIANGLE', 8);
    r.press('LEFT', 6);
    r.press('CROSS', 2);
    for (let i = 0; i < 600 && r.current() !== MENU; i++) await x.run(1);
    await x.run(120);
    expect(r.valve('MenuButtonChanged')).toBe(1);
    expect(r.focused()).toBe('new_game_button');
  }, 60_000);
});
