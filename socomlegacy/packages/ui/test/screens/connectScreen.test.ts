import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { AcctRecord } from '../../src/screens/personaCommands';
import { LOGIN_FAILURE_TEXT, MEDIUS_STATUS, type LobbyService } from '../../src/screens/lobbyClient';
import { CONNECT, HAVE, PERSONA, SELECT, UNIVERSE, personaRig } from './personaRig';

/**
 * ONL-07 over the machine (web research 157 §4): the connecting screen (`dlgNetConnect.rdr`) built from the disc's own
 * layout and set with every module of the path registered -- reached as the original reaches it, by CONNECT on the
 * persona form -- with the lobby client over a fake service. What is pinned: the screen as built (its captions, the
 * persona's name, nothing active), the captions a state, the way on (USER AGREEMENT with `UsagePolicyReturnScreen` 1,
 * ACCEPT to `dlgWorldOfSOCOM.rdr`), each failure's dialog and where it returns, the 90 s watchdog, the register
 * question, and the typed password's end (OT.R17). The files come from the disc or the committed fixtures: it runs in
 * CI. Nothing here is measured on the original running; the frames' scores are `tools/test/connectScore.test.ts`.
 */

const H = UNIVERSE.dns, P = UNIVERSE.port;
/** A typed password, made up for the tests. */
const TYPED = 'secret';
const TICKET = 't1';
const E = DIALOG_EVENTS;
const rec = (name: string, over: Partial<AcctRecord> = {}): AcctRecord => ({ host: H, port: P, name, password: '', hometown: '', gender: 0, savePassword: 0, ...over });
/** The persona form's ONSTART and the connection's MP_SUCCESS have run. */
const SETTLED = 40;
/** PLAT-12's frames in a second (29.97 Hz). */
const SECOND = 30;

type Rig = ReturnType<typeof personaRig>;
const svc = (over: Partial<LobbyService> = {}): LobbyService & { logins: string[] } => {
  const logins: string[] = [];
  return {
    logins,
    login: (q) => { logins.push(`${q.name} ${q.password}`); return Promise.resolve({ status: 0, ticket: TICKET }); },
    register: () => Promise.resolve({ status: 0 }),
    ...over,
  };
};
/** The form with a persona whose password is in the form (typed this session), CONNECT lit: one CROSS from the connecting screen. */
async function onForm(service: LobbyService): Promise<Rig> {
  const t = personaRig({ records: [rec('socomc', { password: TYPED, savePassword: 1 })], connectService: service });
  await t.runReplies(SETTLED);
  expect([t.current(), t.focused(), t.client!.state()]).toEqual([PERSONA, 'connect_btn', 12]);
  return t;
}
/** CONNECT pressed and the connecting screen built, `frames` frames in. */
async function connecting(service: LobbyService, frames = 30): Promise<Rig> {
  const t = await onForm(service);
  t.press('CROSS', 0);
  await t.runReplies(frames);
  return t;
}
const enabledBit = (t: Rig, name: string): boolean => (t.parts.current!.widgets.get(name) as unknown as { enabled: boolean }).enabled;

describe.skipIf(!HAVE)(`CONNECTING over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it("the captions are the disc's (UIMnLOC 448, 542, the errors 543-547, 515 and 450)", () => {
    const t = personaRig();
    // Decoded texts (RS.R8); ¦ is the pad's CROSS glyph byte.
    expect([448, 542, 515].map((id) => t.loc.byId.get(id))).toEqual(['CONNECTING', 'CONNECTING TO SOCOM II ONLINE', 'LOADING...']);
    expect(t.loc.byId.get(543)).toBe('The account information you provided is already logged in to SOCOM II Online. Please use a different Player Name and Password or log out the other player account. ¦ CONTINUE.');
    expect(t.loc.byId.get(544)).toBe('The Player Name you selected could not be registered due to questionable content in the name. Please select another name and try to login again. ¦ CONTINUE.');
    expect(t.loc.byId.get(545)).toBe('The password supplied does not match the registered password for this player name. Verify that the player name and the password are input correctly and try again. ¦ CONTINUE.');
    expect(t.loc.byId.get(546)).toMatch(/^Could not connect to the SOCOM II server\./);
    expect(t.loc.byId.get(547)).toMatch(/^A valid link could not be established with your Internet\/Network connection\./);
    expect(t.loc.byId.get(548)).toBe('Disconnected due to a network error. ¦ CONTINUE.');   // named by no dialog and no set (research 132 R132.2)
    expect(t.loc.byId.get(450)).toBe('Connect failure. Press ¦ to return to the Main Menu.');
  });

  it('the screen as built: CONNECTING, "CONNECTING TO SOCOM II ONLINE", the persona\'s name, the state line; its one control is a TEXT built disabled, so nothing is active', async () => {
    const t = await connecting(svc({ login: () => new Promise(() => undefined) }), 40);
    expect(t.builds).toEqual([PERSONA, CONNECT]);
    expect([t.text('bar_title'), t.text('ConnectingAnim'), t.text('playername')]).toEqual(['CONNECTING', 'CONNECTING TO SOCOM II ONLINE', 'socomc']);
    expect(t.text('ONLINE_LOBBY_STATE')).toBe('STATE: ACCOUNT LOGIN');
    const ring = t.input.ring()!.focused!;
    expect([ring.name, ring.enabled()]).toEqual(['ConnectAnim', false]);   // research 116 §17: the ring's index rests on it, the bit is clear
    expect(t.node('Progress_dummy')!.visible).toBe(true);            // Connect_flash -> ScaleProgress: the strip shown
    expect(t.valve('UsagePolicyReturnScreen')).toBe(1);              // init_socom_online's own VALVE, for ONL-08's ACCEPT
    expect(t.notImplemented(CONNECT)).toEqual([]);
  });

  it('no button is bound on the screen: CROSS, TRIANGLE, START and the d-pad do nothing while it connects', async () => {
    const t = await connecting(svc({ login: () => new Promise(() => undefined) }), 40);
    const at = t.outcomes.length;
    for (const b of ['CROSS', 'TRIANGLE', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'CIRCLE', 'SQUARE'] as const) t.press(b, 2);
    expect([t.current(), t.shown(), t.dispatched(at)]).toEqual([CONNECT, false, []]);
  });

  it('the state line follows socom_online_state: SESSION BEGIN, ACCOUNT LOGIN, then LOGGED IN at 11 (16 has no caption)', async () => {
    const t = await onForm(svc());
    t.press('CROSS', 0);
    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      await t.runReplies(1);
      if (t.current() !== CONNECT) continue;
      const line = `${t.valve('socom_online_state')} ${t.text('ONLINE_LOBBY_STATE')}`;
      if (seen[seen.length - 1] !== line) seen.push(line);
    }
    expect(seen).toEqual(['12 ', '12 STATE: SESSION BEGIN', '7 STATE: ACCOUNT LOGIN', '16 STATE: ACCOUNT LOGIN', '11 STATE: LOGGED IN']);
  });

  it('success: LobbyLogin once with the form\'s name and password; LOGGED IN, the profile download\'s 3 s cut-off, WAIT 1, then USER AGREEMENT; ACCEPT lands on dlgWorldOfSOCOM', async () => {
    const s = svc();
    const t = await onForm(s);
    const subOps: number[] = [];
    const dispatch = t.host.dispatch;
    t.host.dispatch = (cmd, time) => {
      if (cmd.fn === 'CharacterProfile') subOps.push(new DataView(cmd.bytes.buffer, cmd.bytes.byteOffset).getInt32(0x10, true));
      return dispatch(cmd, time);
    };
    const at = t.outcomes.length;
    t.press('CROSS', 0);
    let loggedInAt = -1, switchedAt = -1;
    for (let i = 0; i < 200 && switchedAt < 0; i++) {
      await t.runReplies(1);
      if (loggedInAt < 0 && t.current() === CONNECT && t.text('ONLINE_LOBBY_STATE') === 'STATE: LOGGED IN') loggedInAt = i;
      if (t.current() === 'dlgUsagePolicy.rdr') switchedAt = i;
    }
    expect(s.logins).toEqual([`socomc ${TYPED}`]);
    expect(switchedAt - loggedInAt).toBeGreaterThanOrEqual(4 * SECOND - 2);   // DownloadCharacterProfile's WAIT 3, then WAIT 1
    expect(switchedAt - loggedInAt).toBeLessThanOrEqual(4 * SECOND + 2);
    expect(subOps).toEqual([5, 6]);                                  // LoadFromServer, WaitForLoadComplete (FUN_00275d30's words)
    expect(t.notImplemented(CONNECT)).toEqual(['CharacterProfile (PLAT-34)']);
    expect([t.client!.loggedIn(), t.client!.ticket(), t.client!.account(), t.client!.state()]).toEqual([true, TICKET, 'socomc', 11]);
    expect(t.lobbyEvents.map((e) => e[0])).toEqual([E.MP_SUCCESS, E.MP_JOIN_ROOM]);
    await t.runReplies(40);
    // What CONNECT dispatched from the form to the agreement's ONSTART, in order (a repeat once).
    expect(t.dispatched(at).filter((n) => n !== 'MC_Changed')).toEqual([
      'SwitchMenu', 'LobbyLogin', 'CharacterProfile', 'SwitchMenu', 'RefreshRoomList', 'GetFriendInvitations', 'GetUsagePolicy',
    ]);
    expect([t.text('bar_title'), t.text('playername'), t.focused(), t.valve('UsagePolicyReturnScreen')]).toEqual(['USER AGREEMENT', 'socomc', 'YesAccept', 1]);
    t.press('CROSS', 0);
    await t.runReplies(40);
    expect(t.builds).toEqual([PERSONA, CONNECT, 'dlgUsagePolicy.rdr', 'dlgWorldOfSOCOM.rdr']);
  });

  it('OT.R17: the typed password is in PLAYERPASSWORD and the account list until the login answers, and nowhere after', async () => {
    let answer!: (r: { status: number; ticket?: string }) => void;
    const t = await connecting(svc({ login: () => new Promise((r) => { answer = r; }) }), 30);
    const held = (): [string | null, string, boolean] => [t.str('PLAYERPASSWORD'), t.db.records().map((r) => r.password).join('|'), t.client!.holdsPassword()];
    expect(held()).toEqual([TYPED, TYPED, true]);
    answer({ status: 0, ticket: TICKET });
    await t.runReplies(2);
    expect(held()).toEqual(['', '', false]);
    expect([t.str('PLAYERNAMEVAR'), t.text('playername')]).toEqual(['socomc', 'socomc']);
  });

  const refused = async (status: number): Promise<Rig> => connecting(svc({ login: () => Promise.resolve({ status }) }), 40);
  /** CROSS on a `buttons none` popup, then the way back to the form. */
  const backToForm = async (t: Rig, frames = 60): Promise<void> => { t.press('CROSS', 0); await t.runReplies(frames); };

  it('-978: the popup #545, CROSS, back on the persona form with PASSWORD lit and empty', async () => {
    const t = await refused(MEDIUS_STATUS.InvalidPassword);
    expect([t.current(), t.shown()]).toEqual([CONNECT, true]);
    expect(t.popupText()).toBe(t.loc.byId.get(545));
    expect(t.lobbyEvents.map((e) => e[0])).toEqual([E.MP_SUCCESS, E.MP_INVALID_PASSWORD]);
    await backToForm(t);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
    expect([t.shown(), t.valve('socom_online_state'), t.client!.state()]).toEqual([false, 0, 7]);   // exit_connect_screen writes the valve; the lobby's byte stays
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.focused()]).toEqual(['socomc', '', 'passwd_btn']);
    expect(enabledBit(t, 'connect_btn')).toBe(false);
  });

  it('-997: the popup #543, CROSS, back on the persona form', async () => {
    const t = await refused(MEDIUS_STATUS.AccountLoggedIn);
    expect(t.popupText()).toBe(t.loc.byId.get(543));
    expect(t.lobbyEvents.map((e) => e[0])).toEqual([E.MP_SUCCESS, E.MP_PLAYER_LOGGED_IN]);
    await backToForm(t);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
  });

  it('any other status: MP_MEDIUS_ERROR\'s own text "Login Failure", CROSS, then #515 LOADING... for 5 s, then the persona form', async () => {
    const t = await refused(MEDIUS_STATUS.LoginFailed);
    expect(t.popupText()).toBe(LOGIN_FAILURE_TEXT);
    t.press('CROSS', 0);
    await t.runReplies(10);
    expect([t.current(), t.popupText()]).toEqual([CONNECT, 'LOADING...']);
    await t.runReplies(4 * SECOND);
    expect(t.current()).toBe(CONNECT);                               // still inside the WAIT 5
    await t.runReplies(2 * SECOND);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
    expect(t.shown()).toBe(false);
  });

  it('a retry after a refusal logs in again: the second CONNECT sends the retyped password', async () => {
    let n = 0;
    const s = svc();
    s.login = (q) => { s.logins.push(`${q.name} ${q.password}`); return Promise.resolve(n++ === 0 ? { status: MEDIUS_STATUS.InvalidPassword } : { status: 0, ticket: TICKET }); };
    const t = await connecting(s, 40);
    await backToForm(t);
    expect(t.focused()).toBe('passwd_btn');
    t.press('CROSS', 14);
    t.type('retyped');
    for (let i = 0; i < 4; i++) t.press('DOWN', 3);
    expect(t.focused()).toBe('connect_btn');
    t.press('CROSS', 10);                                            // PasswordChanged: #606
    expect(t.popupText()).toBe(t.loc.byId.get(606));
    t.press('CROSS', 20);                                            // CONTINUE; SecurePassword 1 set SaveAvailable: #831
    expect(t.popupText()).toBe(t.loc.byId.get(831));
    t.press('RIGHT', 3);
    t.press('CROSS', 0);                                             // NO
    await t.runReplies(6 * SECOND);
    expect(s.logins).toEqual([`socomc ${TYPED}`, 'socomc retyped']);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA, CONNECT, 'dlgUsagePolicy.rdr']);
  });

  it('a login never answered: the 90 s watchdog raises #547, CROSS, #515 for 5 s, then the persona form; the password is dropped on the way out', async () => {
    const t = await connecting(svc({ login: () => new Promise(() => undefined) }), 40);
    await t.runReplies(88 * SECOND);
    expect([t.current(), t.shown()]).toEqual([CONNECT, false]);
    await t.runReplies(3 * SECOND);
    expect(t.popupText()).toBe(t.loc.byId.get(547));
    expect(t.str('PLAYERPASSWORD')).toBe(TYPED);                     // still on the screen: the request is still out
    t.press('CROSS', 0);
    await t.runReplies(10);
    expect(t.popupText()).toBe('LOADING...');
    await t.runReplies(6 * SECOND);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
    expect([t.str('PLAYERPASSWORD'), t.client!.holdsPassword()]).toEqual(['', false]);
  }, 60_000);

  const QUESTION = 'Player Name not found. Would you like to register this Player Name?';
  const notFound = (over: Partial<LobbyService> = {}) => {
    let n = 0;
    const s = svc(over);
    s.login = (q) => { s.logins.push(`${q.name} ${q.password}`); return Promise.resolve(n++ === 0 ? { status: MEDIUS_STATUS.AccountNotFound } : { status: 0, ticket: TICKET }); };
    return s;
  };

  it('-998: "STATE: LOGIN FAILURE" and the set\'s own question, YES (#253) first and lit, NO (#246)', async () => {
    const t = await connecting(notFound(), 40);
    expect([t.valve('socom_online_state'), t.text('ONLINE_LOBBY_STATE'), t.shown()]).toEqual([10, 'STATE: LOGIN FAILURE', true]);
    expect(t.popupText()).toBe(QUESTION);
    expect(t.m.shell()!.screen.fader.opacity).toBeCloseTo(0.7, 5);
    expect([253, 246].map((id) => t.loc.byId.get(id))).toEqual(['YES', 'NO']);
    expect(t.str('PLAYERPASSWORD')).toBe(TYPED);                     // kept for LobbyRegister (FUN_0027dde0 reads it again)
  });

  it('-998, YES: LobbyRegister -- the registration, the login again -- then the agreement as after a login', async () => {
    const registered: string[] = [];
    const s = notFound({ register: (q) => { registered.push(`${q.name} ${q.password}`); return Promise.resolve({ status: 0 }); } });
    const t = await connecting(s, 40);
    const at = t.outcomes.length;
    t.press('CROSS', 0);
    await t.runReplies(6 * SECOND);
    expect(t.dispatched(at).slice(0, 1)).toEqual(['LobbyRegister']);
    expect([registered, s.logins]).toEqual([[`socomc ${TYPED}`], [`socomc ${TYPED}`, `socomc ${TYPED}`]]);
    expect(t.builds).toEqual([PERSONA, CONNECT, 'dlgUsagePolicy.rdr']);
    expect([t.str('PLAYERPASSWORD'), t.client!.ticket()]).toEqual(['', TICKET]);
  });

  it('-998, NO: exit_connect_screen -- back on the persona form, nothing registered, the password dropped', async () => {
    const registered: string[] = [];
    const t = await connecting(notFound({ register: (q) => { registered.push(q.name); return Promise.resolve({ status: 0 }); } }), 40);
    t.press('RIGHT', 3);
    t.press('CROSS', 0);
    await t.runReplies(60);
    expect([t.builds, registered, t.str('PLAYERPASSWORD')]).toEqual([[PERSONA, CONNECT, PERSONA], [], '']);
  });

  it('-998, YES, the registration refused (a taken name, -999): "STATE: REGISTRATION FAILURE", WAIT 1, the persona form -- no popup', async () => {
    const t = await connecting(notFound({ register: () => Promise.resolve({ status: MEDIUS_STATUS.AccountAlreadyExists }) }), 40);
    t.press('CROSS', 0);
    await t.runReplies(12);
    expect([t.valve('socom_online_state'), t.text('ONLINE_LOBBY_STATE'), t.shown()]).toEqual([6, 'STATE: REGISTRATION FAILURE', false]);
    await t.runReplies(3 * SECOND);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
  });

  it('-998, YES, a name the filter refuses: the popup #544, NameIsVulgar 1, and the form comes back with PLAYER NAME lit', async () => {
    const registered: string[] = [];
    const t = await connecting(notFound({ filterName: () => Promise.resolve({ result: -1 }), register: (q) => { registered.push(q.name); return Promise.resolve({ status: 0 }); } }), 40);
    t.press('CROSS', 0);
    await t.runReplies(12);
    expect(t.popupText()).toBe(t.loc.byId.get(544));
    expect(t.lobbyEvents.map((e) => e[0])).toEqual([E.MP_SUCCESS, E.MP_FILTER_FAILURE]);
    t.press('CROSS', 0);
    await t.runReplies(3);
    expect(t.valve('NameIsVulgar')).toBe(1);
    await t.runReplies(60);
    expect([t.builds, registered]).toEqual([[PERSONA, CONNECT, PERSONA], []]);
    expect([t.focused(), t.valve('NameIsVulgar')]).toEqual(['playername_btn', 0]);   // OnLoginRoomstart tests and clears it
  });

  it('the lobby server refused after the login (state 2): MP_MEDIUS_ERROR with #450\'s text, then #515, then the persona form', async () => {
    const t = await connecting(svc({ enterLobby: () => Promise.resolve(false) }), 40);
    expect([t.valve('socom_online_state'), t.popupText()]).toEqual([2, t.loc.byId.get(450)]);
    t.press('CROSS', 0);
    await t.runReplies(7 * SECOND);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
  });

  it('with no lobby session (LobbyLogin answers 0) the screen leaves at once: exit_connect_screen', async () => {
    const t = await onForm(svc());
    t.client!.disconnect();
    t.press('CROSS', 0);
    await t.runReplies(60);
    expect(t.builds).toEqual([PERSONA, CONNECT, PERSONA]);
    expect(t.text('ONLINE_LOBBY_STATE')).toBe('');
  });
});

describe.skipIf(!HAVE)('the connection is the lobby client\'s: LOBBY_CONNECT_PLACEHOLDER retired where a lobby is handed in', () => {
  it("SELECT UNIVERSE's CROSS: LobbyConnect starts the connection, state 12's SessionBegin answers, and its MP_SUCCESS (D:L190919) switches to the form", async () => {
    const t = personaRig({ start: SELECT, connectService: svc() });
    await t.runReplies(10);
    t.press('DOWN', 3);
    expect(t.focused()).toBe('SERVERLIST');
    t.press('CROSS', 0);
    await t.runReplies(10);
    expect([t.current(), t.shown(), t.events]).toEqual([SELECT, true, []]);   // #614 up; the persona row posted nothing itself
    await t.runReplies(40);
    expect(t.builds).toEqual([SELECT, PERSONA]);
    expect(t.lobbyEvents).toEqual([[E.MP_SUCCESS, null]]);
    expect([t.client!.up, t.client!.state(), t.valve('socom_online_state'), t.client!.connectedTo()]).toEqual([true, 12, 12, { host: H, port: P }]);
  });

  it('TRIANGLE on the form: LobbyLogout holds until the lobby\'s state is back to 0, then PREVIOUS_SCREEN; SELECT UNIVERSE\'s ONSTART disconnects, and CROSS connects again', async () => {
    const t = personaRig({ start: SELECT, connectService: svc() });
    await t.runReplies(10);
    t.press('DOWN', 3);
    t.press('CROSS', 0);
    await t.runReplies(60);
    expect(t.current()).toBe(PERSONA);
    t.press('TRIANGLE', 0);
    await t.runReplies(60);
    expect(t.builds).toEqual([SELECT, PERSONA, SELECT]);
    expect([t.client!.up, t.client!.state()]).toEqual([false, 0]);  // the logout's state 0x12 -> 0; enter_server_select's LobbyDisconnect
    t.press('DOWN', 3);
    t.press('CROSS', 0);
    await t.runReplies(60);
    expect(t.builds).toEqual([SELECT, PERSONA, SELECT, PERSONA]);
    expect(t.client!.state()).toBe(12);
  });

  it('a SessionBegin never answered holds SELECT UNIVERSE under #614', async () => {
    const t = personaRig({ start: SELECT, connectService: svc({ sessionBegin: () => new Promise(() => undefined) }) });
    await t.runReplies(10);
    t.press('DOWN', 3);
    t.press('CROSS', 0);
    await t.runReplies(120);
    expect([t.current(), t.shown(), t.client!.state()]).toEqual([SELECT, true, 12]);
  });
});
