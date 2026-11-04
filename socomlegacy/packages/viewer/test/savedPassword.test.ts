// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { CardSlots, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, personaFileSize, personaFromLogin, type CardStorage, type PersonaRecord } from '@s2u/card';
import {
  MEDIUS_STATUS, MenuCommands, SKB_KEY_TYPE, UI_PARAMS_RDR, UiCommandHost, UiVarManager, UniverseList, VALVE_TYPE, ValveStore, readSoftKeyboards, usbKeyAction,
  type DialogPartsHost, type FrontEndMachine, type UniverseEntry, type ZAnimUiCommand,
} from '@s2u/ui';
import { connectLobby, fetchAccountService, savedPasswordLogin } from '../src/connectHost';
import { SAVED_PASSWORD_STAND_IN, connectPersona, savedPasswordStandIn } from '../src/personaHost';

/**
 * SAVE-PASSWORD (OT.R61, the game half): the saved password's stand-in (`SAVED_PASSWORD_STAND_IN_ADAPTATION`, U+0001
 * a character of the record's length) pinned three ways -- never sent (no request body or address carries it), never
 * stored (the card keeps the length alone, as before), never logged -- and the soft keyboard shown unable to type it
 * (`UiParams.rdr`'s twelve grids on the disc or the committed fixtures, and every USB key; with neither file the grid
 * test skips, and says so).
 */

/** `SAVED_PASSWORD_STAND_IN`, written out so the pins stand before the module has it. */
const STAND_IN = '\u0001';
/** fetch's credentials mode the remember service asks for (`AccountRequestOptions`). */
const INCLUDE = 'include' as const;
const UNIVERSE: UniverseEntry = {
  status: 0, name: 'SOCOM II Local', dns: 'lobby.test', port: 10075, description: '', universeStatus: 1, userCount: 0, maxUsers: 256,
  billing: '', billingName: '', extendedInfo: '', endOfList: true,
};
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x18) });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Every console call, and the persona host's log lines, recorded. */
function logs() {
  const out: string[] = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { out.push(a.map(String).join(' ')); });
  return out;
}
afterEach(() => { vi.restoreAllMocks(); });

/** The page's card over a memory storage, a save of these personas on slot 1, and the form's rows over it. */
function form(records: PersonaRecord[]) {
  const data = new Map<string, string>();
  const writes: string[] = [];
  const storage: CardStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { writes.push(String(v)); data.set(k, String(v)); } };
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const libmc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  slots.slot(1).makeDir(PERSONA_SAVE_DIR.slice(1), 0);
  slots.slot(1).writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(records.length), { CAcctDB: { AcctInfo: records } }, 1);
  const valves = new ValveStore();
  const machine = { valves, shell: () => ({ currentName: 'dlgNetPlayerName.rdr', inputString: () => null, event: () => true }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const list = new UniverseList({ uiVars });
  list.entry(UNIVERSE);
  const menu = new MenuCommands({ valves: () => valves, uiVars, card: libmc, event: () => {} });
  menu.register(host);
  const lines: string[] = [];
  const p = connectPersona(host, { machine: () => machine, uiVars, libmc, slots, legacy: null, menu, universes: list, parts: { current: null } as unknown as DialogPartsHost, log: (l) => lines.push(l) });
  const run = (fn: string, arg?: string) => host.dispatch(cmd(fn, arg));
  const file = () => { const r = slots.slot(1).readFile(PERSONA_FILE_PATH.slice(1)); if (!r.ok) throw new Error('no file'); return r.value; };
  return { valves, uiVars, host, run, file, writes, lines, db: p.db, libmc };
}

const savedYes = (length: number): PersonaRecord =>
  ({ ...personaFromLogin({ host: UNIVERSE.dns, port: UNIVERSE.port, name: 'socomc', password: 'x'.repeat(length), savePassword: true, gender: 0 }) });

describe('the saved password\'s stand-in (SAVED_PASSWORD_STAND_IN_ADAPTATION)', () => {
  it('never sent: the quick LOGIN, its -978 and -998, NO after YES and a registration -- no request body or address carries U+0001', async () => {
    const out = logs();
    for (const [strip, status] of [[1, 0], [1, MEDIUS_STATUS.InvalidPassword], [0, 0], [1, MEDIUS_STATUS.AccountNotFound]] as const) {
      const t = form([savedYes(6)]);
      const bodies: string[] = [];
      const fetchFn = ((url: string, init: RequestInit = {}) => {
        bodies.push(url, String(init.body ?? ''), JSON.stringify(init.headers ?? {}));
        return Promise.resolve({ status: 200, json: () => Promise.resolve(url.endsWith('/account/login') ? (status === 0 ? { status, ticket: 'tkt' } : { status }) : { status: 0 }) } as Response);
      }) as typeof fetch;
      const service = savedPasswordLogin(fetchAccountService('https://site.test', fetchFn), fetchAccountService('https://site.test', fetchFn, undefined, undefined, { credentials: INCLUDE }));
      const c = connectLobby(t.host, { valves: () => t.valves, uiVars: t.uiVars, service, event: () => {}, dialog: () => 'dlgNetConnect.rdr', db: () => t.db });
      t.run('LobbyConnect', UNIVERSE.name);
      t.valves.set('SecurePassword', strip, VALVE_TYPE.PERM);
      c.lobby.connect('', 0);
      for (let i = 0; i < 3; i++) { c.frame(); await flush(); }
      expect(t.uiVars.find('PLAYERPASSWORD')!.value).toEqual({ type: 'string', value: savedPasswordStandIn(6) });
      expect(t.run('LobbyLogin').answer).toBe(true);
      for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
      if (status === MEDIUS_STATUS.AccountNotFound) {             // state 10's YES: LobbyRegister with the form's password
        t.run('LobbyRegister');
        for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
      }
      expect(bodies.length).toBeGreaterThan(0);
      for (const b of bodies) expect(b).not.toContain(STAND_IN);
      expect(bodies.some((b) => b.includes('/account/create'))).toBe(false);
    }
    for (const l of out) expect(l).not.toContain(STAND_IN);
  });

  it('never stored: the card\'s PASSWORD stays the length alone, and no write to the page\'s storage carries U+0001', () => {
    expect(SAVED_PASSWORD_STAND_IN).toBe(STAND_IN);
    const t = form([savedYes(6)]);
    t.run('LobbyConnect', UNIVERSE.name);
    expect(t.uiVars.find('PLAYERPASSWORD')!.value).toEqual({ type: 'string', value: savedPasswordStandIn(6) });
    t.run('UpdateAcctInfo');
    t.libmc.chdir(0, 0, PERSONA_SAVE_DIR);
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    const data = t.file().data as { CAcctDB: { AcctInfo: PersonaRecord[] }; CUIVarManager?: Record<string, unknown> };
    expect(data.CAcctDB.AcctInfo.map((r) => [r.SAVEPASSWORD, r.PASSWORD])).toEqual([[1, { length: 6 }]]);
    expect(t.writes.length).toBeGreaterThan(0);
    for (const w of t.writes) expect(w).not.toContain(STAND_IN);
    expect(JSON.stringify(data)).not.toMatch(/PLAYERPASSWORD/);
  });

  it('never logged: the card read, the prefill, the save and the login log nothing that carries U+0001', async () => {
    const out = logs();
    const t = form([savedYes(6)]);
    t.run('LobbyConnect', UNIVERSE.name);
    t.run('UpdateAcctInfo');
    t.libmc.chdir(0, 0, PERSONA_SAVE_DIR);
    t.run('SaveConfig', 'BASCUS-97275SOCOMII');
    const fetchFn = ((url: string) => Promise.resolve({ status: 200, json: () => Promise.resolve(url.endsWith('/account/login') ? { status: MEDIUS_STATUS.InvalidPassword } : { status: 0 }) } as Response)) as typeof fetch;
    const service = savedPasswordLogin(fetchAccountService('https://site.test', fetchFn), fetchAccountService('https://site.test', fetchFn, undefined, undefined, { credentials: INCLUDE }));
    const c = connectLobby(t.host, { valves: () => t.valves, uiVars: t.uiVars, service, event: () => {}, dialog: () => 'dlgNetConnect.rdr', db: () => t.db });
    c.lobby.connect('', 0);
    for (let i = 0; i < 3; i++) { c.frame(); await flush(); }
    t.run('LobbyLogin');
    for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    for (const l of [...out, ...t.lines]) expect(l).not.toContain(STAND_IN);
  });
});

/** The disc's `RUN/UI/READERC.ZAR` (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`), else the committed fixtures. */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const READERC = from(DISC, UI_PARAMS_RDR.archive) ?? from(FIXTURES, UI_PARAMS_RDR.archive);

describe('the soft keyboard cannot type the stand-in', () => {
  it.skipIf(READERC === null)('UiParams.rdr: no character key of the twelve layouts is U+0001 (the password\'s CREATEPLAYERNAME among them)', () => {
    const z = Zar.parse(READERC!);
    const k = z.root.children.find((c) => c.name.toLowerCase() === UI_PARAMS_RDR.member.toLowerCase())!;
    const { layouts } = readSoftKeyboards(parseRdr(z.data(k)));
    expect(layouts).toHaveLength(12);
    expect(layouts.map((l) => l.name)).toContain('CREATEPLAYERNAME');
    let chars = 0;
    for (const l of layouts) for (const row of l.grid) for (const key of row) {
      if (key.type !== SKB_KEY_TYPE.CHAR || key.value === 0) continue;   // value 0: the empty key
      chars++;
      expect(key.value, `${l.name}`).not.toBe(STAND_IN.charCodeAt(0));
      expect(key.value, `${l.name}`).toBeGreaterThanOrEqual(0x20);
    }
    expect(chars).toBeGreaterThan(0);
  });

  it('no USB key types it: every HID usage, shifted or not, caps lamp on or off, types a character of 0x20 or above, or none', () => {
    for (let hid = 0; hid < 0x100; hid++) for (const shift of [false, true]) for (const capsLamp of [false, true]) {
      const a = usbKeyAction({ hid, shift, capsLamp });
      if (a.kind === 'char') expect(a.code, `hid ${hid}`).toBeGreaterThanOrEqual(0x20);
    }
  });
});
