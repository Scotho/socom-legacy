// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LOBBY_STATE, VALVE_TYPE, type DialogDesign, type LobbyService, type ZAnimUiCommand } from '@s2u/ui';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';

/**
 * ONL-10 and BOOT-10a on the page's session (web research 160 §4): the logoff's rows mounted over the session's lobby
 * (ONL-07's client) -- `LobbyLogout` asks the logout and holds until state 0, `UnInitNetwork` disconnects (the
 * keep-alive stopped, the ticket gone) -- and every `LoadExecPS2` starts the relaunch as a new process would: the TEMP
 * valves gone (`StartMusic` among them, research 158 §7's owed item), a lobby still up closed. A fake account service;
 * stand-in dialogs; the walk over the disc's own records is `@s2u/ui`'s `logoffScreen.test.ts`.
 */

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const DIALOGS = ['dlgWorldOfSOCOM.rdr', 'dlgAfterErrorReboot.rdr', 'dlgMenu.rdr'];
const disc: FrontEndDisc = { dialog: (n) => (DIALOGS.includes(n) ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
const row = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'exit_lobby', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function session() {
  const logouts: string[] = [], logins: string[] = [];
  let n = 0;
  const account: LobbyService = {
    login: (q) => { logins.push(q.name); n++; return Promise.resolve({ status: 0, ticket: `tkt${n}` }); },
    register: () => Promise.resolve({ status: 0 }),
    logout: (t) => { logouts.push(t); return Promise.resolve({ status: 0 }); },
    keepAlive: () => Promise.resolve(true),
  };
  const launches: unknown[] = [];
  const s = new FrontEndSession({ disc, startDialog: 'dlgWorldOfSOCOM.rdr', account, onLaunch: (l) => { launches.push(l); } });
  let now = 0;
  s.advance(now);
  /** Frames of the session (the lobby's step is the first call of each), the replies let in between. */
  const run = async (k: number): Promise<void> => { for (let i = 0; i < k; i++) { s.advance(now += 34); await flush(); } };
  const logIn = async (): Promise<void> => {
    expect(s.lobby!.connect('localhost', 10075)).toBe(true);         // LobbyConnect's FUN_002e0030: 0 with the flag still set
    await run(3);
    s.lobby!.login('socomc', 'pw');
    await run(6);
    expect([s.lobby!.state(), s.lobby!.ticket(), s.lobby!.keepingAlive()]).toEqual([LOBBY_STATE.LOGGED_IN, `tkt${n}`, true]);
  };
  return { s, logouts, logins, launches, run, logIn };
}

describe("the logoff's rows on the session (ONL-10)", () => {
  it('LobbyLogout asks the logout (/account/logout with the ticket) and answers 1 once the state is 0; UnInitNetwork takes the lobby down', async () => {
    const x = session();
    await x.logIn();
    expect(x.s.host.dispatch(row('LobbyLogout'))).toMatchObject({ kind: 'table', answer: false });
    await x.run(3);
    expect(x.logouts).toEqual(['tkt1']);
    expect([x.s.lobby!.state(), x.s.lobby!.ticket(), x.s.lobby!.keepingAlive()]).toEqual([0, null, false]);
    expect(x.s.host.dispatch(row('LobbyLogout'))).toMatchObject({ answer: true });
    expect(x.s.lobby!.up).toBe(true);
    expect(x.s.host.dispatch(row('UnInitNetwork'))).toMatchObject({ kind: 'table', answer: true });
    expect(x.s.lobby!.up).toBe(false);
  });

  it('a second ONLINE entry after the logoff: the connect starts anew, LOGIN answers a new ticket, the keep-alive runs again; the old ticket is not sent again', async () => {
    const x = session();
    await x.logIn();
    x.s.host.dispatch(row('LobbyLogout'));
    await x.run(3);
    x.s.host.dispatch(row('UnInitNetwork'));
    x.s.host.dispatch(row('SwitchMenu', 'REBOOT'));
    for (let i = 0; i < 200 && x.launches.length === 0; i++) await x.run(1);
    expect(x.launches).toHaveLength(1);
    await x.logIn();
    expect([x.s.lobby!.ticket(), x.logins, x.logouts]).toEqual(['tkt2', ['socomc', 'socomc'], ['tkt1']]);
  });
});

describe('BOOT-10a: a LoadExecPS2 relaunches as a new process would (RELAUNCH_VALVES_READING, LOBBY_CLOSED_AT_LAUNCH_ADAPTATION)', () => {
  it('the TEMP valves are gone at the relaunch (StartMusic: the next login\'s CallMusic starts the music again); PERM and PERSIST stand; PopupNewsOnce is 0 again', async () => {
    const x = session();
    const v = x.s.machine.valves;
    v.set('StartMusic', 1, VALVE_TYPE.TEMP);                          // PressBriefingRoombtn's, before the logoff
    v.set('PopupNewsOnce', 1, VALVE_TYPE.PERM);                       // init_screen's
    v.set('memcard_have_loaded_config', 1, VALVE_TYPE.PERM);
    v.set('HDD_ENABLE', 0, VALVE_TYPE.PERSIST);
    x.s.host.dispatch(row('SwitchMenu', 'REBOOT'));
    for (let i = 0; i < 200 && x.launches.length === 0; i++) await x.run(1);
    await x.run(2);
    expect(x.s.machine.shell()!.currentName).toBe('dlgAfterErrorReboot.rdr');
    expect(x.s.machine.valves.find('StartMusic')).toBeUndefined();
    expect([x.s.machine.valves.find('PopupNewsOnce')?.value, x.s.machine.valves.find('memcard_have_loaded_config')?.value, x.s.machine.valves.find('HDD_ENABLE')?.type]).toEqual([0, 1, VALVE_TYPE.PERSIST]);
  });

  it('a lobby still up at the launch is logged out (not awaited) and disconnected', async () => {
    const x = session();
    await x.logIn();
    x.s.host.dispatch(row('SwitchMenu', 'REBOOT'));                   // a reboot with no logoff before it (an error path)
    for (let i = 0; i < 200 && x.launches.length === 0; i++) await x.run(1);
    expect([x.s.lobby!.up, x.s.lobby!.ticket(), x.s.lobby!.keepingAlive(), x.logouts]).toEqual([false, null, false, ['tkt1']]);
  });
});
