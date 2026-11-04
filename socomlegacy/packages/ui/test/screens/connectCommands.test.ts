import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, UIVAR_LONGEVITY } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { CONNECT_COMMAND_ROWS, CONNECT_DIALOG, ConnectCommands, type ConnectCommandsOptions } from '../../src/screens/connectCommands';
import { LobbyClient, MEDIUS_STATUS, type LobbyService } from '../../src/screens/lobbyClient';
import { AcctDb } from '../../src/screens/personaCommands';

/**
 * ONL-07's rows (web research 157 §3): `LobbyLogin` and `LobbyRegister`, which `dlgNetConnect.rdr`'s `init_socom_online`
 * dispatches -- each against its transcription of the cited function, over a UI variable manager and the lobby client
 * made in the test -- and the owner's ruling on the typed password (OT.R17): held nowhere once the login is answered.
 * Nothing here is measured on the original running.
 */

const HOST = 'lobby.test', PORT = 10075;
/** A typed password, made up for the tests. */
const TYPED = 'secret';
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'init_socom_online', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x18) });

function setup(service: Partial<LobbyService> = {}, over: Partial<ConnectCommandsOptions> = {}) {
  const valves = new ValveStore();
  const uiVars = new UiVarManager();
  const db = new AcctDb();
  const calls: string[] = [];
  const events: Array<[number, string | null]> = [];
  let forgotten = 0;
  const svc: LobbyService = {
    login: (q) => { calls.push(`login ${q.name} ${q.password}`); return Promise.resolve({ status: 0, ticket: 't1' }); },
    register: (q) => { calls.push(`register ${q.name} ${q.password}`); return Promise.resolve({ status: 0 }); },
    ...service,
  };
  // The commands are made first and the client told of them, as the page does: the client's `settled` is their `forget`.
  let commands!: ConnectCommands;
  const lobby = new LobbyClient({ valves: () => valves, service: svc, event: (k, t) => { events.push([k, t]); }, settled: () => commands.forgetPassword() });
  commands = new ConnectCommands({ uiVars, lobby, db: () => db, forget: () => { forgotten++; }, ...over });
  const host = new UiCommandHost({ log: () => undefined });
  commands.register(host);
  const run = (c: ZAnimUiCommand): boolean => { const o = host.dispatch(c); if (o.kind !== 'table') throw new Error(`${c.fn}: ${o.kind}`); return o.answer; };
  const str = (name: string): string | null => { const v = uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };
  const form = (name: string | null, password: string | null): void => {
    if (name !== null) uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: name });
    if (password !== null) uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: password });
  };
  /** `n` frames on the connect screen (or on `dialog`): the lobby's step, a reply's turn before each. */
  const frames = async (n = 1, dialog: string | null = CONNECT_DIALOG): Promise<void> => { for (let i = 0; i < n; i++) { await flush(); commands.frame(dialog); } };
  return { valves, uiVars, db, lobby, commands, host, run, str, form, frames, calls, events, forgotten: () => forgotten };
}

async function connected(service: Partial<LobbyService> = {}) {
  const t = setup(service);
  t.lobby.connect(HOST, PORT);
  await t.frames(2);
  return t;
}

describe("the rows (PLAT-08's table)", () => {
  it("each row's index, id and function are the table's, and each is bound", () => {
    const t = setup();
    for (const r of CONNECT_COMMAND_ROWS) {
      const tr = UI_COMMAND_TABLE[r.row]!;
      expect([tr.id, tr.name, tr.fn]).toEqual([r.id, r.name, r.fn]);
      expect(uiCommandRowByName(r.name)?.index).toBe(r.row);
      expect(t.host.dispatch(cmd(r.name)).kind).toBe('table');
    }
    expect(CONNECT_COMMAND_ROWS.map((r) => r.name)).toEqual(['LobbyRegister', 'LobbyLogin']);
  });
});

describe('LobbyLogin (FUN_0027dd20)', () => {
  it('PLAYERNAMEVAR and PLAYERPASSWORD, both strings with text, go to the lobby\'s login: answer 1, state 7 queued', async () => {
    const t = await connected();
    t.form('socomc', TYPED);
    expect(t.run(cmd('LobbyLogin'))).toBe(true);
    await t.frames(1);
    expect([t.lobby.state(), t.calls]).toEqual([7, [`login socomc ${TYPED}`]]);
  });

  it('no name, an empty name, no password or an empty password: answer 0 and nothing asked (D:L126258-126262)', async () => {
    for (const [name, password] of [[null, TYPED], ['', TYPED], ['socomc', null], ['socomc', '']] as const) {
      const t = await connected();
      t.form(name, password);
      expect(t.run(cmd('LobbyLogin'))).toBe(false);
      await t.frames(2);
      expect([t.lobby.state(), t.calls]).toEqual([12, []]);
    }
  });

  it('adds both variables TEMPORARY when absent (FUN_003857c0(.., 0, 1)); a variable that is no string reads as none', async () => {
    const t = await connected();
    expect(t.run(cmd('LobbyLogin'))).toBe(false);
    expect([t.uiVars.find('PLAYERNAMEVAR')!.longevity, t.uiVars.find('PLAYERPASSWORD')!.longevity]).toEqual([UIVAR_LONGEVITY.TEMPORARY, UIVAR_LONGEVITY.TEMPORARY]);
    t.form('socomc', null);
    t.uiVars.set(t.uiVars.find('PLAYERPASSWORD')!, { type: 'int', value: 5 });
    expect(t.run(cmd('LobbyLogin'))).toBe(false);
  });

  it('with the lobby session down the answer is the login\'s 0 (FUN_002fa5a0 D:L198291-198293)', () => {
    const t = setup();
    t.form('socomc', TYPED);
    expect(t.run(cmd('LobbyLogin'))).toBe(false);
    expect(t.calls).toEqual([]);
  });
});

describe('LobbyRegister (FUN_0027dde0)', () => {
  it('the same two variables go to the lobby\'s registration: answer 1, state 3 queued', async () => {
    const t = await connected();
    t.form('newname', TYPED);
    expect(t.run(cmd('LobbyRegister'))).toBe(true);
    await t.frames(1);
    expect(t.lobby.state()).toBe(3);
    await t.frames(4);
    expect(t.calls).toEqual([`register newname ${TYPED}`, `login newname ${TYPED}`]);
  });

  it('an empty name or password answers 0 (D:L126289-126293): the set then leaves the screen', async () => {
    const t = await connected();
    t.form('newname', '');
    expect(t.run(cmd('LobbyRegister'))).toBe(false);
    expect(t.calls).toEqual([]);
  });
});

describe('the typed password is held nowhere once the login is answered (OT.R17)', () => {
  const held = (t: ReturnType<typeof setup>): [string | null, string, boolean] =>
    [t.str('PLAYERPASSWORD'), t.db.records().map((r) => r.password).join('|'), t.lobby.holdsPassword()];

  it('a success: PLAYERPASSWORD emptied, the account list\'s copy emptied, the client\'s copy gone, the keyboard told', async () => {
    const t = await connected();
    t.form('socomc', TYPED);
    t.db.put({ host: HOST, port: PORT, name: 'socomc', password: TYPED, hometown: '', gender: 0, savePassword: 1 });
    t.run(cmd('LobbyLogin'));
    expect(held(t)).toEqual([TYPED, TYPED, true]);
    await t.frames(2);
    expect(held(t)).toEqual(['', '', false]);
    expect([t.forgotten(), t.str('PLAYERNAMEVAR'), t.db.records()[0]!.name]).toEqual([1, 'socomc', 'socomc']);   // the name stays
  });

  it('a refusal (-978, -997, any other): the same, at the answer', async () => {
    for (const status of [MEDIUS_STATUS.InvalidPassword, MEDIUS_STATUS.AccountLoggedIn, MEDIUS_STATUS.LoginFailed]) {
      const t = await connected({ login: () => Promise.resolve({ status }) });
      t.form('socomc', TYPED);
      t.run(cmd('LobbyLogin'));
      await t.frames(2);
      expect(held(t)).toEqual(['', '', false]);
    }
  });

  it('-998 keeps PLAYERPASSWORD for the set\'s register question (LobbyRegister reads it again); the registration\'s end drops it', async () => {
    let n = 0;
    const t = await connected({ login: () => Promise.resolve(n++ === 0 ? { status: MEDIUS_STATUS.AccountNotFound } : { status: 0, ticket: 't1' }) });
    t.form('newname', TYPED);
    t.run(cmd('LobbyLogin'));
    await t.frames(3);
    expect([t.lobby.state(), ...held(t)]).toEqual([10, TYPED, '', false]);
    expect(t.run(cmd('LobbyRegister'))).toBe(true);
    await t.frames(5);
    expect([t.lobby.state(), ...held(t)]).toEqual([11, '', '', false]);
  });

  it('-998 answered NO: the screen is left (exit_connect_screen) and the first frame off it drops the password', async () => {
    const t = await connected({ login: () => Promise.resolve({ status: MEDIUS_STATUS.AccountNotFound }) });
    t.form('newname', TYPED);
    t.run(cmd('LobbyLogin'));
    await t.frames(3);
    expect(t.str('PLAYERPASSWORD')).toBe(TYPED);
    await t.frames(1, 'dlgNetPlayerName.rdr');
    expect(held(t)).toEqual(['', '', false]);
  });

  it('a login never answered: the watchdog leaves the screen, and the first frame off it drops the password', async () => {
    const t = await connected({ login: () => new Promise(() => undefined) });
    t.form('socomc', TYPED);
    t.run(cmd('LobbyLogin'));
    await t.frames(5);
    expect(held(t)).toEqual([TYPED, '', true]);
    await t.frames(1, 'dlgNetPlayerName.rdr');
    expect(held(t)).toEqual(['', '', false]);
  });

  it('N2: a LobbyLogin that reads a password with the lobby down (answer 0) drops it at once -- PLAYERPASSWORD, the account list, the keyboard', async () => {
    // The persona form's deep link with no universe reply never connects (personaHost's `entered`): CONNECT then runs
    // LobbyLogin on a session that is down, the row answers 0 and `exit_connect_screen` runs at once.
    const t = setup();
    t.form('socomc', TYPED);
    t.db.put({ host: HOST, port: PORT, name: 'socomc', password: TYPED, hometown: '', gender: 0, savePassword: 1 });
    expect(t.run(cmd('LobbyLogin'))).toBe(false);
    expect(held(t)).toEqual(['', '', false]);
    expect([t.forgotten(), t.str('PLAYERNAMEVAR'), t.calls]).toEqual([1, 'socomc', []]);
  });

  it('N2: the same for LobbyRegister with the lobby down, and for a LobbyLogin that read a password with no name', async () => {
    const r = setup();
    r.form('newname', TYPED);
    expect(r.run(cmd('LobbyRegister'))).toBe(false);
    expect(held(r)).toEqual(['', '', false]);
    const n = await connected();
    n.form('', TYPED);
    expect(n.run(cmd('LobbyLogin'))).toBe(false);
    expect([n.str('PLAYERPASSWORD'), n.forgotten()]).toEqual(['', 1]);
  });

  it('N2: a LobbyLogin that read no password touches nothing (no keyboard told)', () => {
    const t = setup();
    t.form('socomc', '');
    expect(t.run(cmd('LobbyLogin'))).toBe(false);
    expect(t.forgotten()).toBe(0);
  });

  it('a password typed on the form before any CONNECT is not touched by the frames off the screen', async () => {
    const t = await connected();
    t.form('socomc', TYPED);
    await t.frames(3, 'dlgNetPlayerName.rdr');
    expect(t.str('PLAYERPASSWORD')).toBe(TYPED);
  });
});

describe('frame', () => {
  it('steps the lobby once (FUN_002dfe50, the network update\'s call)', async () => {
    const t = setup();
    t.lobby.connect(HOST, PORT);
    t.commands.frame(null);
    expect(t.lobby.state()).toBe(12);
    await flush();
    expect(t.events).toEqual([[DIALOG_EVENTS.MP_SUCCESS, null]]);
  });
});
