// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { ButtonWidget, DNAS_HOLD_TICKS, FRONT_END_ENTRY_READING, UI_TICK_SECONDS, findNode, readSoftKeyboards, type DialogDesign, type PadSlotName, type UiDrawItem, type ZAnimUiCommand } from '@s2u/ui';
import { readUiParams } from '../src/softKeyboardKeys';
import { sharedServer } from '../src/online';
import { writeShare } from '../src/shareUrl';
import { ACCOUNT_ORIGIN_ONLY_ENV, pageAccountService } from '../src/connectHost';
import { GameAudio, type AudioOut } from '../src/audio';
import {
  FRONT_END_FILES, FRONT_END_WINDOW_HOOK, FrontEndSession, devBuild, frontEndEntry, mountFrontEnd,
  readFrontEndDisc, type FrontEndDisc,
} from '../src/frontEnd';

/**
 * PLAT-10's page entry (W9.R4; the owner's default 3 in the sprint 9 plan): the front end is an entry of the page beside
 * the map viewer and Play, reached by its own address parameter (`FRONT_END_ENTRY_READING`), which leaves the map
 * viewer's own entry as it was. The session runs `@s2u/ui`'s front end on PLAT-12's clock with PLAT-21's movie host and
 * draws through PLAT-14's drawer.
 */

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const disc = (names: string[]): FrontEndDisc => ({ dialog: (n) => (names.includes(n) ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] });
/** The loader's screens before the game (BOOT-02, research 130): 96 ticks of PLAT-12's at the placeholders' holds. */
const LOADER_TICKS = 96;

/** A canvas target that keeps what was put. */
const target = () => {
  const put: { width: number; height: number }[] = [];
  return {
    put,
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (img: { width: number; height: number }) => { put.push({ width: img.width, height: img.height }); },
  };
};

describe('frontEndEntry (FRONT_END_ENTRY_READING)', () => {
  it('is the parameter menuflow (OT.R9); absent, the front end on its default dialog all the same (OT.R19: the default)', () => {
    expect(FRONT_END_ENTRY_READING).toBe('menuflow');
    expect(frontEndEntry('')).toEqual({ startDialog: null });
    expect(frontEndEntry('?devmode&mode=play&map=MP2')).toEqual({ startDialog: null });
  });

  it('present, the front end on its default dialog; with a dialog\'s name, that one (--menu_state)', () => {
    expect(frontEndEntry('?menuflow')).toEqual({ startDialog: null });
    expect(frontEndEntry('?devmode&menuflow=')).toEqual({ startDialog: null });
    expect(frontEndEntry('?menuflow=dlgOptions_Menu.rdr')).toEqual({ startDialog: 'dlgOptions_Menu.rdr' });
    expect(frontEndEntry('?menuflow=../../etc')).toEqual({ startDialog: null });
  });

  it('the old name frontend is not kept as an alias (OT.R9): it names no start dialog', () => {
    expect(frontEndEntry('?frontend')).toEqual({ startDialog: null });
    expect(frontEndEntry('?devmode&frontend=dlgMenu.rdr')).toEqual({ startDialog: null });
  });

  it('passes through the page\'s own address writes like any developer parameter', () => {
    expect(writeShare('?devmode&menuflow=dlgMenu.rdr', { play: false })).toBe('?mode=explore&devmode&menuflow=dlgMenu.rdr');
    expect(writeShare('?menuflow&map=MP2', { view: 'ps2' })).toBe('?map=MP2&view=ps2&menuflow');
  });
});

describe('FrontEndSession', () => {
  it('runs the front end at the clock\'s 29.97 Hz tick: the first tick opens the start dialog (no loader: a deep link\'s session)', () => {
    const s = new FrontEndSession({ disc: disc(['dlgIntroScreen.rdr', 'dlgMenu.rdr']), loader: false });
    expect(s.advance(0)).toBe(0);                                  // the first call anchors the clock
    expect(s.advance(1000 * UI_TICK_SECONDS + 1)).toBe(1);
    expect(s.machine.shell()!.currentName).toBe('dlgIntroScreen.rdr');
    expect(s.advance(1000)).toBe(1);                               // a late frame: the catch-up cap (0.05 s) -> one tick
  });

  it('at `/` runs the opener: the loader\'s screens first (BOOT-02), then the game\'s boot on dlgIntroScreen (BOOT-04)', () => {
    const s = new FrontEndSession({ disc: disc(['dlgIntroScreen.rdr', 'dlgMenu.rdr']) });
    let now = 0;
    s.advance(now);
    expect(s.opener.phase).toBe('loader');
    for (let i = 0; i < LOADER_TICKS; i++) s.advance(now += 1000 * UI_TICK_SECONDS);
    expect(s.machine.shell()).toBeNull();
    expect(s.last.some((i) => i.kind === 'sprite' && i.texture === 'loader:LOADING')).toBe(true);
    s.advance(now += 1000 * UI_TICK_SECONDS);
    expect(s.opener.phase).toBe('game');
    expect(s.machine.shell()!.currentName).toBe('dlgIntroScreen.rdr');
    expect(FRONT_END_WINDOW_HOOK).toBe('__frontEnd');
  });

  it('press(): a tap on the next frame, FALLING then RISING, read by the opener\'s input (the test hook)', () => {
    const s = new FrontEndSession({ disc: disc(['dlgIntroScreen.rdr']), loader: false });
    s.press('START');
    const pads: (number | undefined)[] = [];
    const next = (s as unknown as { nextPad(): { bytes: number[] } | null }).nextPad.bind(s);
    for (let i = 0; i < 3; i++) pads.push(next()?.bytes[0]);
    expect(pads).toEqual([1, 3, undefined]);
  });

  it('keeps one PopupSlot, shared by every dialog host: PLAT-16\'s one line is session.popups.connect(factory)', () => {
    const s = new FrontEndSession({ disc: disc(['dlgIntroScreen.rdr', 'dlgMenu.rdr']), loader: false });
    s.advance(0);
    s.advance(1000 * UI_TICK_SECONDS + 1);
    const shell = s.machine.shell()!;
    expect(shell.popups).toBe(s.popups);
    const made: string[] = [];
    s.popups.connect(() => { made.push('plat-16'); return { kind: 'plat-16', tick: () => {} } as never; });
    expect(s.popups.make()).toMatchObject({ kind: 'plat-16' });
    expect(made).toEqual(['plat-16']);
  });

  it('FE-SWEEP: dialogBuilt hears each dialog the machine builds, with its design (the page loads its lazy banks there)', () => {
    const built: DialogDesign[] = [];
    const s = new FrontEndSession({ disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr', dialogBuilt: (d) => { built.push(d); } });
    s.advance(0);
    s.advance(100);
    expect(s.machine.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(built).toHaveLength(1);
    expect(built[0]!.bindings[0]!.animation).toBe('menu_fade_up');
  });

  it('starts on the entry\'s dialog, and draws the last frame onto a canvas target at 640 x 448', () => {
    const s = new FrontEndSession({ disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr' });
    s.advance(0);
    s.advance(100);
    s.advance(200);
    expect(s.machine.shell()!.currentName).toBe('dlgMenu.rdr');
    const t = target();
    const { undrawn } = s.render(t);
    expect(t.put).toEqual([{ width: 640, height: 448 }]);
    expect(Array.isArray(undrawn)).toBe(true);
  });

  it('a dialog with a movie background gets PLAT-21\'s player: the layer under the dialog, ONMPEGEND to the dialog', () => {
    const d = (name: string): DialogDesign | null => (name === 'dlgIntroScreen.rdr'
      ? { ...design(), background: { type: 1, typeName: 'MPEG', filename: 'run/movies/common/sony448.pss' },
        bindings: [{ kind: 'event', name: 'ONMPEGEND', code: 3, state: 1, animation: 'end', argument: null }] }
      : null);
    const s = new FrontEndSession({ disc: { ...disc([]), dialog: d }, loader: false });
    s.advance(0);
    s.advance(40);
    expect(s.movie.background.state).toBe('PLAYING');
    expect(s.machine.shell()!.screen.movie).toBe(s.layer);
    expect(s.machine.shell()!.draw().some((i) => i.kind === 'movie')).toBe(true);
  });

  it('the bitmaps the session is given reach the drawer (ONL-01; FRONT_END_TEXTURES_PLACEHOLDER retired): a quad naming one draws, one naming none is undrawn', () => {
    const quad = (texture: string): UiDrawItem => ({ kind: 'sprite', node: 'n', texture, x0: 0, y0: 0, x1: 2, y1: 2, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null });
    const bitmap = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const s = new FrontEndSession({ disc: disc([]), loader: false, textures: (n) => (n === 'x.tif' ? bitmap : null) });
    s.last = [quad('x.tif'), quad('y.tif')];
    expect(s.render(target()).undrawn).toEqual(['n: no bitmap y.tif']);
    const none = new FrontEndSession({ disc: disc([]), loader: false });
    none.last = [quad('x.tif')];
    expect(none.render(target()).undrawn).toEqual(['n: no bitmap x.tif']);
  });

  it('the menu art and the page banks both reach the drawer: neither shadows the other (MENU-02a over ONL-01, the merge of 2026-10-03)', () => {
    const quad = (texture: string): UiDrawItem => ({ kind: 'sprite', node: 'n', texture, x0: 0, y0: 0, x1: 2, y1: 2, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null });
    const bitmap = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const art = { textures: (n: string) => (n === 'roller.tif' ? bitmap : null), model: () => null, missing: [], libraries: [] };
    const s = new FrontEndSession({ disc: { ...disc([]), art }, loader: false, textures: (n) => (n === 'bank.tif' ? bitmap : null) });
    s.last = [quad('roller.tif'), quad('bank.tif'), quad('y.tif')];
    expect(s.render(target()).undrawn).toEqual(['n: no bitmap y.tif']);
  });

  it('ONL-01: the NetCnf stand-in is the session\'s; the server of the combination LOGIN selects is kept for the screens after it (ONL-03)', () => {
    const s = new FrontEndSession({ disc: disc([]), loader: false });
    expect(s.netLogin.selection).toEqual({ server: null, key: null });
    const list = s.netLogin.iop.combinationList('mc0:');              // OpenCardOne's NetCnfOpen(mc0:): OT.R3's first-use write, then the list
    expect(list.entries).toHaveLength(1);
    expect(s.netLogin.iop.selectCombination('mc0:', list.entries[0]!.key)).toBe(0);
    // TRS-1 (the merge controller's (a)): the page's Shared service of its location, never the retired SHARED_SERVER.
    expect(s.netLogin.selection).toEqual({ server: sharedServer(globalThis.location ?? { protocol: 'http:', host: 'localhost' }), key: list.entries[0]!.key });
  });

  it('ONL-03: the DNAS screen\'s five rows are registered in the session\'s host (DNASAuthenticate the bypass, done after OT.R20\'s hold)', () => {
    const s = new FrontEndSession({ disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr' });
    s.advance(0);
    s.advance(100);
    const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'init_socom_online', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'success', loc: 0, bytes: new Uint8Array(16) });
    for (const name of ['InitNetwork', 'DNASAuthenticate', 'DMEInit', 'MediusInit', 'GetServerList']) expect(s.host.dispatch(cmd(name)).kind, name).toBe('table');
    // The loop made the first call; "in progress" through the owner's 90 ticks (OT.R20), done on the call after them.
    for (let i = 1; i < DNAS_HOLD_TICKS; i++) expect(s.host.dispatch(cmd('DNASAuthenticate')).answer).toBe(false);
    expect(s.host.dispatch(cmd('DNASAuthenticate')).answer).toBe(true);
    expect(s.machine.valves.find('success')).toMatchObject({ value: 1 });     // DMEInit / MediusInit wrote the valve the argument names
  });

  const universeReply = {
    universes: [{ status: 0, name: 'SOCOM II Local', dns: '', port: 0, description: 'D', universeStatus: 1, userCount: 0, maxUsers: 256, billing: '', billingName: '', extendedInfo: '', endOfList: true }],
    news: [{ status: 0, news: 'N', endOfList: true }],
  };
  const universeCmd = (fn: string, arg = 'success'): ZAnimUiCommand => ({ anim: 'a', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });

  it('ONL-04: GetServerList\'s worker asks the session\'s universe service; SELECT UNIVERSE\'s two rows are registered over its list', async () => {
    const queries: unknown[] = [];
    const s = new FrontEndSession({
      disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr', universe: { query: (q) => { queries.push(q); return Promise.resolve(universeReply); } },
    });
    s.advance(0);
    s.advance(100);
    expect(s.host.dispatch(universeCmd('GetServerList')).answer).toBe(false);     // the worker made, the query sent
    expect(queries).toEqual([{ infoType: 3, characterEncoding: 2, language: 1 }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.host.dispatch(universeCmd('GetServerList')).answer).toBe(true);
    expect(s.uiVars.find('SERVER_LIST')!.value.type).toBe('array');
    for (const name of ['LobbyDisconnect', 'UpdateServerInfo']) expect(s.host.dispatch(universeCmd(name, 'SELECTED_SERVER')).kind, name).toBe('table');
    expect(s.uiVars.find('SERVER_NAME')!.value).toEqual({ type: 'string', value: 'SOCOM II Local' });
  });

  it('ONL-04: a deep link to SELECT UNIVERSE starts with the list read before the session (universeReply), as the DNAS screen leaves it', () => {
    const s = new FrontEndSession({ disc: disc(['dlgNetServerSelect.rdr']), startDialog: 'dlgNetServerSelect.rdr', universeReply });
    expect(s.universes.count).toBe(1);
    expect(s.universes.ended).toBe(true);
    expect(s.uiVars.find('SERVER_LIST')!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [
      { type: 'string', value: 'SOCOM II Local' }, { type: 'int', value: 0 }, { type: 'int', value: 0 }, { type: 'int', value: 256 },
    ] }] });
  });

  it("ONL-08: GetUsagePolicy asks the session's policy service (SVC-05's /texts/policy) and fills UsagePolicy; LobbyLogout's stub answers 1", async () => {
    const asked: unknown[] = [];
    const s = new FrontEndSession({
      disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr',
      usagePolicy: { policy: (q) => { asked.push(q); return Promise.resolve([{ status: 0, policy: 'EULA', endOfText: true }]); } },
    });
    expect(s.host.dispatch(universeCmd('GetUsagePolicy', 'NA'))).toMatchObject({ kind: 'table', answer: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual([{ type: 0 }]);
    expect(s.uiVars.find('UsagePolicy')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: 'EULA' }] });
    expect(s.host.dispatch(universeCmd('LobbyLogout', 'NA'))).toMatchObject({ kind: 'table', answer: true });
  });

  it("ONL-06: the persona form's rows and OPT-05i's card rows are registered over the session's account list (research 153 §5)", () => {
    const s = new FrontEndSession({ disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr', universeReply });
    expect(s.uiVars.find('LOBBY_HOST')).toBeUndefined();             // not a deep link to the form: nothing prefilled
    for (const name of ['UpdateAcctInfo', 'GetMUISPersonaInfo', 'DeleteMUISPersona', 'MUISPersonaExists', 'CompareValues', 'PruneUIVarSpaces', 'NetCensorText', 'LobbyLogout', 'VerifyPatchLevel', 'SaveConfig', 'LoadConfig', 'IsMemcardSaveOK', 'IsSpaceForSaveGameFile', 'MC_CreateIconFiles']) {
      expect(s.host.dispatch(universeCmd(name, 'x')).kind, name).toBe('table');
    }
    expect(s.persona.db.records()).toEqual([]);                      // no card under Node: no personas
    expect(s.host.dispatch(universeCmd('LobbyConnect', 'SOCOM II Local')).answer).toBe(true);
    expect(s.uiVars.find('LOBBY_HOST')!.value).toEqual({ type: 'string', value: '' });   // the placeholder universe's empty DNS (PERSONA_HOST_PLACEHOLDER)
  });

  it("ONL-06: a deep link to the persona form starts as LobbyConnect leaves it: LOBBY_HOST, LOBBY_PORT and the list's three <New Persona> rows", () => {
    const s = new FrontEndSession({ disc: disc(['dlgNetPlayerName.rdr']), startDialog: 'dlgNetPlayerName.rdr', universeReply });
    expect([s.uiVars.find('LOBBY_HOST')!.value, s.uiVars.find('LOBBY_PORT')!.value]).toEqual([{ type: 'string', value: '' }, { type: 'int', value: 0 }]);
    const rows = s.uiVars.find('PLAYERPERSONALIST')!.value;
    expect(rows.type === 'array' && rows.value).toHaveLength(3);
    expect(s.machine.valves.find('SecurePassword')).toMatchObject({ value: 0 });
  });

  const noInvitation = { status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true };

  it("ONL-09: the session mounts the online menu's rows -- the announcement asked of its service (SVC-05's /texts/announcement), the invitations of SVC-09a's -- over the lobby's variables", async () => {
    const asked: string[] = [];
    const s = new FrontEndSession({
      disc: disc(['dlgMenu.rdr']), startDialog: 'dlgMenu.rdr',
      announcement: { announcement: (q) => { asked.push(`announcement ${JSON.stringify(q)}`); return Promise.resolve({ status: 0, announcementId: 1, announcement: 'News.', endOfList: true }); } },
      clanInvitations: { check: (q) => { asked.push(`invitations ${JSON.stringify(q)}`); return Promise.resolve([noInvitation]); } },
    });
    expect(s.uiVars.find('MY_CLAN_INVITES')).toMatchObject({ value: { type: 'none' } });   // added at the session's start (D:L182219-182220), before any reply
    expect(s.host.dispatch(universeCmd('HasClanInvitations', 'NA'))).toMatchObject({ kind: 'table', answer: false });   // unregistered, the table's default 1 lit the row
    for (const name of ['GetMediusAnnouncements', 'CheckMyInvites', 'RefreshRoomList', 'GetClan', 'IsMemberOfClan', 'IsLeaderOfClan']) expect(s.host.dispatch(universeCmd(name, 'NA')).kind, name).toBe('table');
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual(['announcement {"applicationId":10472}', 'invitations {"start":0,"pageSize":999}']);
    expect(s.uiVars.find('MEDIUS_MOTD')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: 'News.' }, { type: 'string', value: '\n' }] });
    expect(s.uiVars.find('MY_CLAN_INVITES')!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [' ', 'No Invitations', ' '].map((value) => ({ type: 'string', value })) }] });
    expect(s.host.dispatch(universeCmd('LobbyLogout', 'NA'))).toMatchObject({ kind: 'table', answer: true });   // ONL-10's row left as it was registered
  });

  it("ONL-09: SERVER NEWS once a launch -- PopupNewsOnce is seeded at the session's start (global_valves.rdr's 0) and again at every LoadExecPS2", () => {
    const launches: unknown[] = [];
    const s = new FrontEndSession({ disc: disc(['dlgMenu.rdr', 'dlgAfterErrorReboot.rdr']), startDialog: 'dlgMenu.rdr', onLaunch: (l) => { launches.push(l); } });
    expect(s.machine.valves.find('PopupNewsOnce')).toMatchObject({ value: 0, type: 1 });
    expect(s.machine.valves.find('GameSpeedFilter')).toMatchObject({ value: 65000, type: 3 });
    let now = 0;
    s.advance(now);
    s.advance(now += 34);
    s.machine.valves.set('PopupNewsOnce', 1, 2);                      // init_screen's VALVE PopupNewsOnce = 1
    s.host.dispatch(universeCmd('SwitchMenu', 'REBOOT'));              // the logoff's reboot (exit_lobby, ONL-10's)
    for (let i = 0; i < 200 && launches.length === 0; i++) s.advance(now += 34);
    expect(launches).toHaveLength(1);
    expect(s.machine.valves.find('PopupNewsOnce')).toMatchObject({ value: 0 });
  });
});

describe('readFrontEndDisc', () => {
  it('reads the dialog archives, the zAnim sets and the faces; never throws, a file that will not read is listed', async () => {
    expect(FRONT_END_FILES).toEqual({ dialogs: ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'], scripts: 'RUN/UIZANIM.ZAR', fonts: 'RUN/READERC.ZAR', loader: ['RUN/RAW/PULOADGP.RAW', 'RUN/RAW/LOADING.RAW'] });
    const none: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const d = await readFrontEndDisc(none);
    expect(d.dialog('dlgMenu.rdr')).toBeNull();
    expect(d.sets).toEqual([]);
    expect(d.missing.length).toBeGreaterThanOrEqual(4);
  });
});

describe('mountFrontEnd', () => {
  it('mounts without the parameter too (OT.R19: the front end is the page\'s default; the page\'s entry decides, not this)', () => {
    const m = mountFrontEnd('?devmode', null, document)!;
    expect(document.getElementById('front-end')).toBe(m.canvas);
    m.stop();
    expect(document.getElementById('front-end')).toBeNull();
  });

  it('with it, puts its 640 x 448 canvas over the page; with no source it says what it needs (the visitor\'s disc image)', () => {
    const m = mountFrontEnd('?menuflow', null, document)!;
    expect(m.canvas.width).toBe(640);
    expect(m.canvas.height).toBe(448);
    expect(document.getElementById('front-end')).toBe(m.canvas);
    expect(m.status).toMatch(/disc image/);
    m.stop();
    expect(document.getElementById('front-end')).toBeNull();
  });
});

/** A typed password, made up for the tests below. */
const TYPED_HERE = 'secret';

describe("devBuild: ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION's gate (review N1's production half)", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const PAGE = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };

  it("reads Vite's import.meta.env.DEV: false in a built page, where ?devmode&server=https://evil.example still posts to the page's own origin", async () => {
    vi.stubEnv('DEV', false);
    expect(devBuild()).toBe(false);
    const urls: string[] = [];
    const fetchFn = ((url: string) => { urls.push(url); return Promise.resolve({ status: 200, json: () => Promise.resolve({ status: 0, ticket: 'tkt' }) } as Response); }) as typeof fetch;
    await pageAccountService('?devmode&server=https://evil.example', PAGE, devBuild(), fetchFn).login({ name: 'socomc', password: TYPED_HERE });
    expect(urls).toEqual(['https://site.test/account/login']);
    vi.stubEnv('DEV', true);
    expect(devBuild()).toBe(true);
  });

  it("mountFrontEnd hands the LOGIN's account service devBuild() itself", () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');
    // LOBBY-INVITE: the service is handed through the invite's login guard (`./inviteHost` `guardInviteLogin`), devBuild() still its own.
    // SAVE-PASSWORD (OT.R61): the service is `pageLoginService`, both of whose halves are `pageAccountService`'s.
    expect(src).toMatch(/account: (guardInviteLogin\()?pageLoginService\(search, win\.location, devBuild\(\)\)/);
  });
});

class SilentOut implements AudioOut {
  unlocked = false;
  state = 'locked';
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(): void {}
  setReverb(): void {}
  rampReverb(): void {}
  loop(): null { return null; }
}

describe("mountFrontEnd's stop ends the lobby session (review (5), LOBBY_CLOSE_AT_STOP_ADAPTATION)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("FrontEndSession.close(): a logged-in lobby's keep-alive stopped, /account/logout sent with the ticket (not awaited), the lobby down", async () => {
    const ended: string[] = [];
    const s = new FrontEndSession({
      disc: disc([]), loader: false,
      account: {
        login: () => Promise.resolve({ status: 0, ticket: 'tkt' }), register: () => Promise.resolve({ status: 0 }),
        logout: (ticket) => { ended.push(ticket); return new Promise(() => {}); },                       // never answered: the page is gone
        keepAlive: () => Promise.resolve(true),
      },
    });
    const lobby = s.lobby!;
    const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    lobby.connect('', 0);
    for (let i = 0; i < 2; i++) { await flush(); lobby.step(); }
    lobby.login('socomc', TYPED_HERE);
    for (let i = 0; i < 4; i++) { await flush(); lobby.step(); }
    expect([lobby.ticket(), lobby.keepingAlive()]).toEqual(['tkt', true]);
    s.close();
    expect([lobby.keepingAlive(), lobby.up, lobby.ticket(), ended]).toEqual([false, false, null, ['tkt']]);
    new FrontEndSession({ disc: disc([]), loader: false }).close();                                      // no account service: nothing to end
  });

  it("mountFrontEnd's stop() closes the session it made", async () => {
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const m = mountFrontEnd('?menuflow', { kind: 'http', baseUrl: '/maps' }, document, { assets: nothing, audio: new GameAudio(new SilentOut()), movies: null })!;
    const s = (await m.session)!;
    expect(s.lobby).not.toBeNull();                                  // the page's account service is always there
    const close = vi.spyOn(s, 'close');
    m.stop();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

// The dev disc (W6.R8): `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped without one.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN/UI/READERC.ZAR'));

describe.skipIf(!HAVE_DISC)('the front end entry over the disc (SOCOM_DISC)', () => {
  it('reads 114 dialogs and the 95 UIZANIM sets; dlgIntroScreen.rdr fades up from black in 1.5 s', async () => {
    const d = await readFrontEndDisc(new FsAssetSource(DISC));
    expect(d.missing).toEqual([]);
    expect(d.sets).toHaveLength(95);
    expect(d.faces.length).toBeGreaterThan(0);
    expect(d.dialog('dlgMenu.rdr')).not.toBeNull();
    const s = new FrontEndSession({ disc: d, loader: false });
    let now = 0;
    s.advance(now);
    // 1.6 s at a 30 Hz display (47 ticks): past menu_fade_up's 1.5 s, before dlgIntroScreen's ONSTART switches on
    // (its card checks take 55 ticks on the stubs, research 139 §5).
    for (let i = 0; i < 48; i++) s.advance(now += 1000 / 30);
    const g = s.machine.shell()!;
    expect(g.currentName).toBe('dlgIntroScreen.rdr');
    expect(findNode(g.screen.root, 'MENUFADER')!.opacity).toBe(0);
    expect(d.loader.LOADING).toMatchObject({ width: 640, height: 448 });
  });

  it("ONL-09: a deep link to SOCOM II ONLINE -- SERVER NEWS up with the service's text, NO INVITATIONS, the foot empty with no login (ONL-27's GetMyClans needs a ticket); CROSS closes the news", async () => {
    const asked: string[] = [];
    const d = await readFrontEndDisc(new FsAssetSource(DISC));
    const s = new FrontEndSession({
      disc: d, startDialog: 'dlgWorldOfSOCOM.rdr',
      announcement: { announcement: () => Promise.resolve({ status: 0, announcementId: 1, announcement: 'News of ours.', endOfList: true }) },
      clanInvitations: { check: () => Promise.resolve([{ status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true }]) },
      // ONL-27 (research 272 §3): GetMyClans answered as Horizon answers a player in no clan -- its reply would write the foot's name
      manageRoster: {
        myClans: () => { asked.push('my-clans'); return Promise.resolve([{ status: 1, clanId: 0, clanName: '', leaderAccountId: 0, leaderAccountName: '', stats: '00'.repeat(256), endOfList: true }]); },
        roster: () => new Promise(() => {}), remove: () => new Promise(() => {}), transferLeadership: () => new Promise(() => {}),
        disband: () => new Promise(() => {}), updateStats: () => new Promise(() => {}),
      },
    });
    s.uiVars.add('PLAYERNAMEVAR', { type: 'string', value: 'socomc' }, 2);
    let now = 0;
    s.advance(now);
    const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) { s.advance(now += 1000 / 30); await Promise.resolve(); } };
    await run(60);
    const g = s.machine.shell()!;
    const lines = (name: string): string[] => { const c = findNode(g.screen.root, name)?.content; return c?.kind === 'wrapped' ? c.lines.map((l) => String.fromCharCode(...l.bytes)) : []; };
    expect(g.currentName).toBe('dlgWorldOfSOCOM.rdr');
    expect(s.input.ring()!.focused!.name).toBe('popup_motd_button');
    // ONL-27: a deep link holds no ticket, so GetClan's GetMyClans is never sent (the transport sends nothing without one) and
    // the foot stays empty -- the console reaches this menu only logged in; the stub used to write the name with no request.
    expect([findNode(g.screen.root, 'popup_motd')!.visible, lines('popup_motd_text'), lines('playername'), asked]).toEqual([true, ['News of ours.'], [], []]);
    expect(s.machine.valves.find('PopupNewsOnce')).toMatchObject({ value: 1 });
    expect(s.parts.current!.widgets.enabled(s.parts.current!.widgets.specOf('invitations')!)).toBe(false);
    let down = new Set<'CROSS'>(['CROSS']);                            // PLAT-11's pad source, as the page's adapter feeds it
    s.input.source = { read: () => ({ down, stickX: 0, stickY: 0 }) };
    await run(1);
    down = new Set();
    await run(10);
    expect([findNode(g.screen.root, 'popup_motd')!.visible, s.input.ring()!.focused!.name]).toEqual([false, 'newsandmessages']);
  });
});

/**
 * Session-level tests over the game's own dialogs and sets (the disc, else the committed fixtures: they run in CI):
 * ONL-07's wiring (web research 157 §5) and the two `frontEnd.ts` lines of ONL-06 its review found unheld (research
 * 153's nine lines: the keyboard's title through the caption tables; the boot's stubs handed to `connectPersona`).
 */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const TREE_FILES = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/READERC.ZAR', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/MP2.ZDB'];
const TREE = HAVE_DISC ? DISC : FIXTURES;
const HAVE_TREE = TREE_FILES.every((f) => existsSync(join(TREE, f)));

describe.skipIf(!HAVE_TREE)(`the session over the game's dialogs${HAVE_TREE ? '' : ' (no disc and no fixtures)'}`, () => {
  /** A typed password, made up for the tests. */
  const TYPED = 'secret';
  const universeReply = {
    universes: [{ status: 0, name: 'SOCOM II Local', dns: '', port: 0, description: 'D', universeStatus: 1, userCount: 0, maxUsers: 256, billing: '', billingName: '', extendedInfo: '', endOfList: true }],
    news: [{ status: 0, news: 'N', endOfList: true }],
  };
  const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'a', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x18) });
  const source = () => new FsAssetSource(TREE);
  let discOnce: Promise<FrontEndDisc> | null = null;
  const tree = (): Promise<FrontEndDisc> => (discOnce ??= readFrontEndDisc(source()));
  /** `n` frames at a 30 Hz display, the services' replies delivered between them. */
  const frames = async (s: Pick<FrontEndSession, 'advance'>, clock: { now: number }, n: number): Promise<void> => {
    for (let i = 0; i < n; i++) { await Promise.resolve(); await Promise.resolve(); s.advance(clock.now += 1000 / 30); }
  };
  /** One button held for one frame through PLAT-11's reader (the page's keys and pad are its source), then `settle` idle frames. */
  const press = async (s: FrontEndSession, clock: { now: number }, name: PadSlotName, settle: number): Promise<void> => {
    s.input.source = { read: () => ({ down: new Set<PadSlotName>([name]), stickX: 0, stickY: 0 }) };
    await frames(s, clock, 1);
    s.input.source = { read: () => ({ down: new Set<PadSlotName>(), stickX: 0, stickY: 0 }) };
    await frames(s, clock, settle);
  };
  const setStr = (s: FrontEndSession, name: string, value: string): void => { s.uiVars.set(s.uiVars.add(name, null, 1), { type: 'string', value }); };
  const str = (s: FrontEndSession, name: string): string | null => { const v = s.uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };

  // OT.R71: offered by default (was: "its default-off development capability", enabled only for true).
  it('the session offers the native Create Game Respawn widget by default; false (a test\'s) disables it', async () => {
    for (const respawnRules of [undefined, false, true]) {
      const s = new FrontEndSession({ disc: await tree(), startDialog: 'dlgCreateGame.rdr', loader: false, respawnRules });
      const clock = { now: 0 }; s.advance(0); await frames(s, clock, 60);
      const widget = s.parts.current!.widgets.get('Respawn');
      if (!(widget instanceof ButtonWidget)) throw new Error('Respawn must be a native ButtonWidget');
      expect(widget.enabled, String(respawnRules)).toBe(respawnRules !== false);
      expect(s.machine.valves.find('mp_allow_respawn')?.value).toBe(0);
      s.close();
    }
  });

  // OT.R71: the mounted page offers the row on every build and server (was: "only for an opted-in development build
  // using the local service" -- devrespawn=1, a development build and a loopback service).
  it('the mounted page offers that native row on every build and server (OT.R71): no development gate', async () => {
    const previousUrl = window.location.pathname + window.location.search + window.location.hash, previousState = window.history.state;
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this unit test'));
    const cases = [
      { dev: true, extra: '&devrespawn=1&server=ws://127.0.0.1:5365/ws', enabled: true },
      { dev: false, extra: '&devrespawn=1&server=ws://127.0.0.1:5365/ws', enabled: true },
      { dev: true, extra: '&server=ws://127.0.0.1:5365/ws', enabled: true },
      { dev: false, extra: '', enabled: true },
      { dev: true, extra: '&devrespawn=1&server=https://example.test', enabled: true },
    ];
    vi.stubEnv(ACCOUNT_ORIGIN_ONLY_ENV, '0'); // the explicit selected-server cases are independent of a host's nightly setting
    try {
      for (const c of cases) {
        vi.stubEnv('DEV', c.dev);
        const search = `?devmode&menuflow=dlgCreateGame.rdr${c.extra}`;
        window.history.replaceState(null, '', `/${search}`); // each mount starts at the page root, with no prior guarded route
        const m = mountFrontEnd(search, { kind: 'http', baseUrl: '/maps' }, document,
          { assets: source(), audio: new GameAudio(new SilentOut()), movies: null })!;
        try {
          const s = (await m.session)!;
          const clock = { now: 0 }; s.advance(0); await frames(s, clock, 60);
          const widget = s.parts.current!.widgets.get('Respawn');
          if (!(widget instanceof ButtonWidget)) throw new Error('Respawn must be a native ButtonWidget');
          expect(widget.enabled, JSON.stringify(c)).toBe(c.enabled);
          expect(s.machine.valves.find('mp_allow_respawn')?.value).toBe(0);
        } finally { m.stop(); }
      }
    } finally { window.history.replaceState(previousState, '', previousUrl); vi.unstubAllEnvs(); vi.restoreAllMocks(); }
  });

  it("ONL-07: CONNECT on the persona form logs in through the session's account service -- the connecting screen, the ticket in the session's lobby, USER AGREEMENT; the password gone", async () => {
    const logins: unknown[] = [], policies: unknown[] = [];
    const s = new FrontEndSession({
      disc: await tree(), startDialog: 'dlgNetPlayerName.rdr', universeReply,
      account: { login: (q) => { logins.push(q); return Promise.resolve({ status: 0, ticket: 'tkt' }); }, register: () => Promise.resolve({ status: 0 }) },
      usagePolicy: { policy: (q) => { policies.push(q); return Promise.resolve([{ status: 0, policy: 'EULA', endOfText: true }]); } },
    });
    expect(s.lobby).not.toBeNull();
    expect([s.lobby!.up, s.lobby!.connectedTo()]).toEqual([true, { host: '', port: 0 }]);   // the deep link runs LobbyConnect's two halves (research 153 §5, 157 §5)
    setStr(s, 'PLAYERNAMEVAR', 'socomc');
    setStr(s, 'PLAYERPASSWORD', TYPED);                              // as the keyboard's ENTER leaves the form (no retyped flag: no #606)
    const clock = { now: 0 };
    s.advance(clock.now);
    await frames(s, clock, 60);
    expect([s.machine.shell()!.currentName, s.input.ring()!.focused!.name, s.lobby!.state()]).toEqual(['dlgNetPlayerName.rdr', 'connect_btn', 12]);
    await press(s, clock, 'CROSS', 30);
    expect(s.machine.shell()!.currentName).toBe('dlgNetConnect.rdr');
    expect(logins).toEqual([{ name: 'socomc', password: TYPED }]);
    expect([s.lobby!.loggedIn(), s.lobby!.ticket(), s.lobby!.account(), str(s, 'PLAYERPASSWORD')]).toEqual([true, 'tkt', 'socomc', '']);
    await frames(s, clock, 150);                                     // the profile download's 3 s, WAIT 1, the switch and the agreement's ONSTART
    expect(s.machine.shell()!.currentName).toBe('dlgUsagePolicy.rdr');
    expect(policies).toEqual([{ type: 0 }]);                         // GetUsagePolicy sends while the lobby session is up (LOBBY_SESSION_UP_READING's hook)
    expect(s.machine.valves.find('UsagePolicyReturnScreen')).toMatchObject({ value: 1 });
    // The ticket and the password are nowhere a reload, a shared link or the browser's storage would hold them.
    const stored = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }) + window.location.href + document.cookie;
    expect([stored.includes('tkt'), stored.includes(TYPED)]).toEqual([false, false]);
  });

  it("ONL-07: the lobby's session flag gates GetUsagePolicy, LobbyDisconnect reaches the client, and LobbyLogout reads its state", async () => {
    const policies: unknown[] = [];
    const s = new FrontEndSession({
      disc: await tree(), startDialog: 'dlgMenu.rdr', universeReply, loader: false,
      account: { login: () => Promise.resolve({ status: 0 }), register: () => Promise.resolve({ status: 0 }) },
      usagePolicy: { policy: (q) => { policies.push(q); return Promise.resolve([]); } },
    });
    expect(s.lobby!.up).toBe(false);
    s.host.dispatch(cmd('GetUsagePolicy'));
    expect(policies).toEqual([]);                                    // FUN_002f79f0 sends only while +0x7d is set
    expect(s.host.dispatch(cmd('LobbyLogout')).answer).toBe(true);   // state 0
    expect(s.host.dispatch(cmd('LobbyConnect', 'SOCOM II Local')).answer).toBe(true);
    expect(s.lobby!.up).toBe(true);
    s.host.dispatch(cmd('GetUsagePolicy'));
    expect(policies).toEqual([{ type: 0 }]);
    const clock = { now: 0 };
    s.advance(clock.now);
    await frames(s, clock, 3);
    expect(s.lobby!.state()).toBe(12);
    expect(s.host.dispatch(cmd('LobbyLogout')).answer).toBe(false);  // the logout asked: state 0x12 queued
    await frames(s, clock, 3);
    expect([s.lobby!.state(), s.host.dispatch(cmd('LobbyLogout')).answer]).toEqual([0, true]);
    s.host.dispatch(cmd('LobbyDisconnect'));
    expect(s.lobby!.up).toBe(false);
  });

  it("ONL-07: without an account service the session has no lobby: LobbyLogin stays the table's, LobbyConnect the placeholder", async () => {
    const s = new FrontEndSession({ disc: await tree(), startDialog: 'dlgMenu.rdr', universeReply, loader: false });
    expect(s.lobby).toBeNull();
    expect(s.host.dispatch(cmd('LobbyLogin')).kind).toBe('not-implemented');
    expect(s.host.dispatch(cmd('LobbyConnect', 'SOCOM II Local')).answer).toBe(true);
  });

  it("ONL-06 (research 153 R153.10): the keyboard's title is drawn through the session's caption tables -- 'Enter Player Name', not the purpose's name", async () => {
    const titleGlyphs = async (disc: FrontEndDisc): Promise<number> => {
      const s = new FrontEndSession({ disc, startDialog: 'dlgNetPlayerName.rdr', universeReply });
      s.keyboard.load(readSoftKeyboards(await readUiParams(source())));
      const clock = { now: 0 };
      s.advance(clock.now);
      await frames(s, clock, 60);
      await press(s, clock, 'CROSS', 10);                            // PLAYER NAME: the list
      await press(s, clock, 'CROSS', 40);                            // <New Persona>: GetTextInput(PLAYERNAMEVAR)
      expect(s.keyboard.keyboard.isOpen).toBe(true);
      expect(s.keyboard.keyboard.title).toBe('_455_EnterPlayerName_MSG');
      const title = s.last.find((i) => i.kind === 'glyphs' && i.node === 'SkbPurpose');
      return title?.kind === 'glyphs' ? title.quads.length : -1;
    };
    const d = await tree();
    expect(d.captions).not.toBeNull();
    // The glyph list holds two quads a character.
    expect(await titleGlyphs(d)).toBe(2 * 'Enter Player Name'.length);
    expect(await titleGlyphs({ ...d, captions: null })).toBe(2 * '_455_EnterPlayerName_MSG'.length);   // without the tables: the name as written
  });

  it("ONL-06 (PERSONA_FORM_CARD_ROWS_ADAPTATION): off the persona form the boot's card stubs answer (slot 2 empty); on it, the page's own card", async () => {
    const slot2 = (s: FrontEndSession): boolean => { s.host.dispatch(cmd('MC_ChPort', '1')); return s.host.dispatch(cmd('IsMemCardInserted')).answer; };
    const menu = new FrontEndSession({ disc: await tree(), startDialog: 'dlgMenu.rdr', universeReply, loader: false });
    menu.advance(0);
    menu.advance(100);
    expect(menu.machine.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(slot2(menu)).toBe(false);                                 // BOOT_CARD_STUB_PLACEHOLDER: nothing in slot 2
    const form = new FrontEndSession({ disc: await tree(), startDialog: 'dlgNetPlayerName.rdr', universeReply });
    form.advance(0);
    form.advance(100);
    expect(form.machine.shell()!.currentName).toBe('dlgNetPlayerName.rdr');
    expect(slot2(form)).toBe(true);                                  // the page's virtual card: both slots hold one
  });
  it("OPT-09's day (research 302 §4): on a real session the main menu's OPTIONS hook is gone -- CallOptions runs -- while NEW GAME, LOAD GAME, EXTRAS, LAN and ONL-02 keep the desktop notice", async () => {
    const disc = await tree();
    const s = new FrontEndSession({ disc, loader: false });
    const menu = disc.dialog('dlgMenu.rdr')!, login = disc.dialog('dlgNetLogin.rdr')!;
    expect([menu, login]).not.toContain(null);
    const gated = (dialog: string, design: DialogDesign, animation: string): boolean => s.host.bindingStart({ dialog, design, animation, argument: null });
    expect(gated('dlgMenu.rdr', menu, 'CallOptions')).toBe(false);
    for (const animation of ['UiprepMission1', 'MainMenuOnLoad', 'CallExtras', 'go_to_LAN_play']) expect(gated('dlgMenu.rdr', menu, animation), animation).toBe(true);
    expect(gated('dlgNetLogin.rdr', login, 'launchNTGUI2')).toBe(true);
    s.close();
  });
});
