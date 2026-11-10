// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, parseUiLayout, type Loadout, type Side, type UiOp, type UiProgram } from '@s2u/scene';
import type { ArmoryData } from '../src/armoryData';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { Hud } from '../src/hud';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES, type MatchCapabilities } from '../src/matchCore';
import { mountArmory, type MatchArmoryDeps } from '../src/matchArmory';
import { matchNetDeps, PART_DEPS, type MatchNetParts } from '../src/matchNet';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * PAR-2 (PARITY-2; audit A.2; OT.R43): the seat ARMORY as one part (`../src/matchArmory`) both pages mount -- `/testroom`
 * (`main.ts`) and the menu-launched match (`matchMount.ts`) -- `main.ts`'s lines written once (main.ts:306-432,
 * 1615-1619, 1736-1748 at 37c1dd0bd). Each behaviour is asserted on both pages through the shared part, with each page's
 * own adapters: the seat's join (ARMORY_SEAT_READING), a ghost's or a waiting room's seat, the pre-round pull-out
 * (popup 47, `ARMORY_CLOCK_READING`), a round's start dropping a pending change and closing the screen
 * (ARMORY_ROUND_START_RACE_READING), an abandon sending it with the screen left open (ARMORY_ABANDON_READING). The
 * screen is a hand-built dialog (`test/armory.test.ts`'s); the match a real `NetPage` -- `/testroom`'s on its own
 * client, the front end's on the lobby's handed-off client -- over fake sockets. No server, no browser.
 */

// ---- the screen's data and the map's world (test/armory.test.ts's hand-built dialog) ----
const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARIES', ['ui/assetlib/uimp'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['multplay_back.tif']], 'FONT', ['font_text_01'],
    'SCRIPT_LIBRARY', ['dlg_equipment_mp.rdr'],
    'OBJECTS', [
      obj('NAME', ['InstructionText'], 'TYPE', ['TEXT'], 'XPOS', ['320'], 'YPOS', ['92'], 'SPEC', ['CAPTION', [' '], 'HCENTERED', []]),
      obj('NAME', ['Seal1PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['25'], 'YPOS', ['150'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['Seal2PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['180'], 'YPOS', ['150'], 'SPEC', ['CAPTION', [' ']]),
    ],
    'ANIMATIONS', [obj('EVENT', ['ONSTART'], 'ANIMATION', ['UiEquipSwitch']), obj('EVENT', ['ONSTART'], 'ANIMATION', ['UiBackToLobby'])],
    'CONTROLS', [
      obj('NAME', ['EquipMpSealBtn'], 'TYPE', ['BUTTON'], 'SPEC', ['ANIMATIONS', [obj('EVENT', ['ONACTIVATE'], 'ANIMATION', ['OnMpSealBtnAct'])]]),
    ],
  ],
]]);
const ui = (fn: string, arg: string): UiOp => ({ op: 'ui', command: { node: null, op: 0, fn, arg, loc: 0, extra: [] } });
const program = (name: string, ops: UiOp[]): UiProgram => ({ name, nodes: [], sequences: [{ name: 'NA', activation: 1, ops }] });
const programs = [program('UiEquipSwitch', [ui('ActivateButton', 'EquipMpSealBtn')]), program('OnMpSealBtnAct', []), program('UiBackToLobby', [])];
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number): RdrNode[] => rec(['InternalName', name], ['ID', String(id)], ['AMMO_TYPES', []]);
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M4A1', 54), item('M16A2', 51), item('HK5', 31), item('Mark 23', 15), item('M67', 121), item('HE', 126), item('Double Ammo Load', 194)]] as RdrNode);
const valves = new Map([['Enable_m4Acarbine', 1], ['Enable_M16', 1], ['Enable_mp5', 9], ['Enable_Mark23', 1], ['Enable_frag', 9], ['Enable_HEgren', 9], ['Enable_2xammo', 9]]);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const SEAL_KIT = kit(54, 15, 121, 126, 194);
const character = (column: string, index: number, loadout: Loadout) => ({
  column: column as 'Seal1', side: 'seal' as const, index, type: column, character: column, model: null, textures: [], loadout, portrait: `${column}.tif`,
});
const DATA: ArmoryData = {
  archive: 'MP2', layout, uiSounds: [], scripts: [{ set: 'dlg_equipment_mp.rdr', programs }], items: [], fonts: [], models: [], modelTextures: [],
  strings: [], bitmaps: [], light: null, missing: [],
  roster: { equipmentLibrary: null, equipmentStem: null, missionTitle: 'FROSTFIRE', characters: [character('Seal1', 0, SEAL_KIT), character('Seal2', 1, kit(31, 15, 121, 126, 194))] },
};
/** The map on screen, as `LoadedMap` holds what the screen reads: its arsenal and valves, its path and archive, its name. */
const MAP = { path: 'RUN/MP2.ZDB', archive: 'MP2', name: 'FROSTFIRE', arsenal: { table: { arsenal }, map: { valves } } } as never;

// ---- each page's adapters on the part (main.ts's and matchMount.ts's lines), the shared deps faked ----
type PageName = 'testroom' | 'front end';
type FakeNet = { armoryDone(): void; serverName(): string | null; nextRoundIn(): number | null; answersType(s: Side): boolean; typeChosen(s: Side): void };

function rig(page: PageName, o: { net?: () => FakeNet | null; playing?: () => boolean; deadZone?: () => number } = {}) {
  const log: string[] = [];
  let next: number | null = null;
  const fake: FakeNet = {
    armoryDone: () => { log.push('ready'); }, serverName: () => 'US East (Ohio)', nextRoundIn: () => next,
    answersType: () => true, typeChosen: (s) => { log.push(`typeChosen ${s}`); },
  };
  const t = { now: 0 };
  const loadouts = {
    type: () => 0, pending: () => null, base: () => SEAL_KIT,
    setType: (s: Side, ty: number) => { log.push(`setType ${s} ${ty}`); return true; },
    setPicks: (s: Side) => { log.push(`setPicks ${s}`); return true; },
    setLoadout: (_k: Loadout, s: Side) => { log.push(`setLoadout ${s}`); },
  };
  const shared: Omit<MatchArmoryDeps, 'playing' | 'online' | 'device'> = {
    net: o.net ?? (() => fake), map: () => MAP, side: () => 'seal', loadouts, answer: () => { log.push('answer'); },
    audio: { play: () => true, restart: () => true }, opened: () => { log.push('opened'); }, clock: () => t.now,
    ...(o.deadZone ? { deadZone: o.deadZone } : {}),
  };
  // /testroom: main.ts's `!NO_ARMORY && playOn`, `!solo`, `promptDevice()`, its two clears and the offline room's `done`;
  // the front end: online, the pad, its clear `./matchNet`'s `roundClear` (none handed to the part) -- and here the part's
  // switch on (`playing`), to test the part's own handling; the live menu match hands it off (`matchMount.ts`: dormant,
  // the PAR-2 review's ruling -- the original's ARMORY is the lobby's), which the dormant cases below hold.
  const own: Pick<MatchArmoryDeps, 'playing' | 'online' | 'device' | 'done' | 'clearDecals' | 'clearAir'> = page === 'testroom'
    ? { playing: o.playing ?? (() => true), online: () => true, device: () => 'keyboard', done: () => { log.push('solo'); }, clearDecals: () => { log.push('decals'); }, clearAir: () => { log.push('air'); } }
    : { playing: o.playing ?? (() => true), online: () => true, device: () => 'pad' };
  const part = mountArmory({ ...shared, ...own });
  /** One pad frame of presses on the open screen, its scripts stepped (`Armory.pad`: the controller first, OT.R29). */
  const press = (...buttons: ('Right' | 'Cross' | 'Up')[]): void => { for (const b of buttons) { t.now += 1; part.armory.pad(new Set([b])); part.armory.frame(0); } };
  return { part, log, press, t, setNext: (s: number | null) => { next = s; } };
}

const PAGES: PageName[] = ['testroom', 'front end'];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe.each(PAGES)('the seat ARMORY through the one part: %s', (page) => {
  it('a join opens it as /testroom does (W5.R1, ARMORY_SEAT_READING): at once with its data in, else when the data lands', () => {
    const r = rig(page);
    r.part.setData(DATA);
    r.part.netDeps().joined();
    expect(r.part.isOpen()).toBe(true);
    expect(r.log).toEqual(['opened']);                                   // the game's input the screen's from this frame
    const late = rig(page);
    late.part.netDeps().joined();                                         // the welcome before the data: waits for it
    expect(late.part.isOpen()).toBe(false);
    late.part.setData(DATA);
    expect(late.part.isOpen()).toBe(true);
    expect(late.log).not.toContain('ready');                              // the screen's own close tells the room
  });
  it('a seat it cannot open on is told at once (the room spawns it): no data, or the page not playing', () => {
    const r = rig(page);
    r.part.netDeps().joined();
    r.part.setData(null);
    expect(r.part.isOpen()).toBe(false);
    expect(r.log[0]).toBe('ready');
    const off = rig(page, { playing: () => false });
    off.part.setData(DATA);
    off.part.netDeps().joined();
    expect([off.part.isOpen(), off.log[0]]).toEqual([false, 'ready']);
    expect(off.part.netDeps().armory).toBe(false);                        // nor does its hello ask the room to hold a seat
    // PAR-2's re-review, F1: off, no data yet (or none to come) -- still told at once, never left waiting for data.
    const early = rig(page, { playing: () => false });
    early.part.netDeps().joined();
    expect([early.part.isOpen(), early.log[0]]).toEqual([false, 'ready']);
  });
  it('the pre-round pull-out (popup 47, ARMORY_CLOCK_READING): 5 s before the next round, a notice -- the screen still open', () => {
    const r = rig(page);
    r.part.setData(DATA);
    r.part.seat();
    r.setNext(6);
    r.part.frame(1 / 60, null);
    expect(r.part.armory.state()?.pulledAt ?? null).toBeNull();
    r.setNext(4.9);
    r.part.frame(1 / 60, null);
    expect(r.part.armory.state()?.pulledAt).not.toBeNull();
    expect(r.part.isOpen()).toBe(true);
  });
  it('a round\'s start drops a pending change and closes the screen (ARMORY_ROUND_START_RACE_READING); the close tells the room', () => {
    vi.useFakeTimers();
    const r = rig(page);
    r.part.setData(DATA);
    r.part.seat();
    r.press('Right', 'Cross');                                            // SEAL 2 committed: a change in the send's debounce
    r.part.netDeps().newRound();
    vi.runAllTimers();
    expect(r.part.isOpen()).toBe(false);
    expect(r.log.filter((l) => l.startsWith('set'))).toEqual([]);        // never sent: the room has spawned the seat
    expect(r.log.filter((l) => l === 'ready')).toHaveLength(1);
  });
  it('an abandon sends the pending change and leaves the screen open (ARMORY_ABANDON_READING)', () => {
    vi.useFakeTimers();
    const r = rig(page);
    r.part.setData(DATA);
    r.part.seat();
    r.press('Right', 'Cross');
    r.part.netDeps().abandoned();
    expect(r.log).toEqual(expect.arrayContaining(['setType seal 1', 'setPicks seal', 'setLoadout seal', 'answer', 'typeChosen seal']));
    expect(r.part.isOpen()).toBe(true);
    expect(r.log).not.toContain('ready');
  });
  it('let go with the match: closed without telling the room, nothing pending sent', () => {
    vi.useFakeTimers();
    const r = rig(page);
    r.part.setData(DATA);
    r.part.seat();
    r.press('Right', 'Cross');
    r.part.dispose();
    vi.runAllTimers();
    expect(r.part.isOpen()).toBe(false);
    expect(r.log.filter((l) => l === 'ready' || l.startsWith('set'))).toEqual([]);
  });
});

/**
 * The two round ends' decal and air clear: `/testroom`'s through the ARMORY's glue (its `clearDecals` / `clearAir`),
 * the front end's through `./matchNet`'s `roundClear`, run ahead of the same glue (PAR-2: the front end's switch on).
 */
describe('the round ends\' clear on each page', () => {
  it('/testroom: the glue\'s order (decals, air, then the ARMORY\'s own lines)', () => {
    vi.useFakeTimers();
    const r = rig('testroom');
    r.part.setData(DATA);
    r.part.seat();
    r.part.netDeps().newRound();
    expect(r.log.slice(1)).toEqual(['decals', 'air', 'ready', 'solo']);   // then the offline room made (`done`)
  });
});

// ---- a real NetPage on each page: /testroom's own client, the front end's the lobby's hand-off ----
const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[] };
const sock = (): Sock => { const sent: string[] = []; return { binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => {} } as unknown as Sock; };
const welcome = {
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [{ id: 3, name: 'kilo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
} as unknown as ServerEvent;
const walk = {
  setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
  setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', feet: () => null,
} as unknown as WalkMode;
const remote = { setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [] } as unknown as RemotePlayers;
/** Every part's deps a page's switch owes but the ARMORY's (stubs). */
const OTHER_PARTS = {
  remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {}, whiteOut: () => {}, sceneRound: () => {},
  voiceFloor: () => {}, voiceFrame: () => {},
  reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {}, roundAudio: { roundStart: () => {}, eliminated: () => {}, timeExpired: () => {}, roundOver: () => {}, reset: () => {}, frame: () => {} } as never, objective: () => null, escorteeVoice: () => {},
  taunt: () => {}, communication: () => {}, hostageState: () => {},
  drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {},
} satisfies Partial<NetPageDeps>;

/**
 * The page's match on a real `NetPage` with the part's deps (`PART_DEPS.armory`): `/testroom` on its own client (the
 * welcome said on its socket), the front end on the lobby's (the welcome among the adopted events, `game.adopt`).
 */
function realPage(page: PageName, first: Record<string, unknown>, playing?: () => boolean) {
  let net: NetPage | null = null;
  const cleared: string[] = [];
  const caps: MatchCapabilities = page === 'testroom' ? TESTROOM_CAPABILITIES : FRONT_END_CAPABILITIES;
  const r = rig(page, { net: () => net, ...(playing ? { playing } : {}) });
  r.part.setData(DATA);
  const parts: MatchNetParts = {
    caps, walk, remote, hud: new Hud(), fly: { setPose: () => {} },
    loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => {}, roomAnswer: () => {} },
    firearm: {
      records: () => [] as never, roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {},
      fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
    },
    clips: () => null, map: () => MAP, side: () => net?.client.team ?? 'seal', followTeam: () => {},
    menuOpen: () => r.part.isOpen(),
    ...(page === 'front end' ? { roundClear: () => { cleared.push('clear'); } } : {}),
  };
  let socket: Sock;
  let say: (ev: Record<string, unknown>) => void;
  if (page === 'testroom') {
    socket = sock();
    const deps = matchNetDeps(parts as MatchNetParts & { caps: typeof TESTROOM_CAPABILITIES }, { answered: () => {} }, { ...OTHER_PARTS, client: null, ...r.part.netDeps(), socket: () => socket });
    net = new NetPage(deps, 'ws://site.test/match', 'MP2', 'socomc', undefined, false, 'classic');
    socket.onopen?.({} as never);
    say = (ev) => { socket.onmessage?.({ data: JSON.stringify(ev) } as never); };
    say({ ...welcome, ...first });
  } else {
    const socks: Sock[] = [];
    const hands: GameLobbyHandOff[] = [];
    const host = new GameSocketHost({ pinned: PINNED, ticket: () => 'tkt', holds: () => {}, matchStart: (h) => { hands.push(h); }, socket: () => { const s = sock(); socks.push(s); return s; } });
    host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
    host.open(7);
    socks[0]!.onopen?.({} as never);
    say = (ev) => { socks[0]!.onmessage?.({ data: JSON.stringify(ev) } as never); };
    const w = { ...welcome, ...first } as unknown as ServerEvent;
    say(w as unknown as Record<string, unknown>);
    host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });
    socket = socks[0]!;
    const deps = matchNetDeps(parts as MatchNetParts & { caps: typeof FRONT_END_CAPABILITIES }, { answered: () => {} }, {
      ...OTHER_PARTS, ...r.part.netDeps(),
      game: { id: 7, ticket: 'tkt', pinned: PINNED, adopt: { client: hands[0]!.client, events: [w] } },
    } as never);
    net = new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
  }
  const sent = (type: string): number => socket.sent.filter((d) => typeof d === 'string' && d.includes(`"type":"${type}"`)).length;
  return { r, net: () => net!, say, sent, cleared, socket };
}

/**
 * The part's handling of a welcome or a promotion that says `armory`, on each page's `NetPage` wiring with the part's
 * switch on. On the front end this is the part under test, not the live menu match: no hello of the menu match asks the
 * room for a held seat (its part is dormant, `playing` false: the PAR-2 review's ruling), so the room never sends one there.
 */
describe.each(PAGES)('the part\'s handling of a welcome or promotion that says `armory`, on a real NetPage (its switch on): %s', (page) => {
  it.each([
    ['a first seat', { armory: true }],
    ['a ghost\'s seat', { ghost: true, armory: true }],
    ['a waiting room\'s seat', { waiting: true, armory: true }],
  ])('%s the room holds for it (the welcome\'s `armory`): the screen opens; DONE\'s close sends `ready`', (_what, first) => {
    const p = realPage(page, first);
    expect(p.r.part.isOpen()).toBe(true);
    expect(p.sent('ready')).toBe(0);
    p.r.part.armory.close();                                              // left (DONE): the held seat's first spawn
    expect(p.sent('ready')).toBe(1);
    p.net().close();
  });
  it('a seat the room does not hold (no `armory`) opens nothing', () => {
    const p = realPage(page, {});
    expect(p.r.part.isOpen()).toBe(false);
    p.net().close();
  });
  it('a promotion the room holds opens it (ARMORY_SEAT_READING)', () => {
    const p = realPage(page, { role: 'spectator', team: null });
    expect(p.r.part.isOpen()).toBe(false);
    p.say({ type: 'promoted', team: 'seal', ghost: false, char: 0, armory: true });
    expect(p.r.part.isOpen()).toBe(true);
    p.net().close();
  });
  it('the room\'s round start closes it and sends no pending change; an abandon keeps it open and sends the change', () => {
    vi.useFakeTimers();
    const p = realPage(page, { armory: true });
    p.r.press('Right', 'Cross');
    p.say({ type: 'abandoned' });
    expect(p.r.part.isOpen()).toBe(true);
    expect(p.r.log).toContain('setType seal 1');                          // sent at once, not dropped
    if (page === 'front end') expect(p.cleared).toEqual(['clear']);       // the parts' own clear, ahead of the glue
    const q = realPage(page, { armory: true });
    q.r.press('Right', 'Cross');
    q.say({ type: 'roundStart', round: 2, seconds: 300, epoch: 2 });
    vi.runAllTimers();
    expect(q.r.part.isOpen()).toBe(false);
    expect(q.r.log.filter((l) => l.startsWith('set'))).toEqual([]);
    if (page === 'front end') expect(q.cleared).toEqual(['clear']);
    p.net().close();
    q.net().close();
  });
  it('with its switch on, the hello asks the room to hold a seat for it on a socket the page opens (`armory`, `armoryOpen`)', () => {
    const p = realPage(page, {});
    const deps = p.r.part.netDeps();
    expect(deps.armory).toBe(true);
    expect(deps.armoryOpen()).toBe(false);
    if (page === 'testroom') expect(p.socket.sent.some((d) => typeof d === 'string' && d.includes('"armory":true'))).toBe(true);
    p.net().close();
  });
});

/**
 * The menu match's own adapter (`matchMount.ts`: `playing: () => false`; the PAR-2 review's ruling): the part mounted but
 * dormant -- its hello asks for no held seat, and should a welcome say `armory` all the same, no screen opens and the room
 * is told at once (`ready`), so no spawn is held. The live behaviour on a reopened socket: `test/matchMount.test.ts`.
 */
describe('the menu match\'s part, dormant (`playing` false)', () => {
  it('its NetPage dep asks for no seat; a welcome or a promotion saying `armory` opens nothing, the promotion\'s `ready` sent at once', () => {
    const w = realPage('front end', { armory: true }, () => false);
    expect(w.r.part.netDeps().armory).toBe(false);
    expect(w.r.part.isOpen()).toBe(false);
    w.net().close();
    const p = realPage('front end', { role: 'spectator', team: null }, () => false);
    p.say({ type: 'promoted', team: 'seal', ghost: false, char: 0, armory: true });
    expect(p.r.part.isOpen()).toBe(false);
    expect(p.sent('ready')).toBe(1);                                      // the seat spawns: nothing held
    p.net().close();
  });
});

// ---- the one wiring: both pages mount the part (a wiring pin, as test/matchExchange.test.ts's) ----
const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

describe('the one wiring: main.ts\'s lines in the part, both pages mount it (PAR-2)', () => {
  it('the switch: both pages mount the seat ARMORY; its deps are the part\'s', () => {
    expect(TESTROOM_CAPABILITIES.armory).toBe(true);
    expect(FRONT_END_CAPABILITIES.armory).toBe(true);
    expect(Object.keys(mountArmory({ net: () => null, map: () => null, side: () => 'seal', loadouts: {} as never, answer: () => {}, playing: () => true, online: () => true, audio: { play: () => true, restart: () => true }, device: () => 'pad' }).netDeps()).sort())
      .toEqual([...PART_DEPS.armory].sort());
  });
  it('main.ts calls mountArmory and holds none of the lines it moved', () => {
    const main = src('main.ts');
    expect(main).toMatch(/const armoryPart = mountArmory\(\{/);
    expect(main).toMatch(/const \{ armory, view: armoryView \} = armoryPart;/);
    expect(main).not.toMatch(/new Armory\(\{|makeArmorySend|armoryRoundHooks\(|function armoryWorld\(|function applyArmory\(|function armoryOpenOrDone\(/);
  });
  it('both pages call the part\'s steps: its NetPage deps, the frame after the HUD, the pad before the exchange\'s', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const text = src(f);
      expect(text, f).toMatch(/const armoryPart = mountArmory\(\{/);
      expect(text, f).toMatch(/\.\.\.armoryPart\.netDeps\(\),/);
      expect(text, f).toMatch(/armoryPart\.frame\(dt, /);
      expect(text, f).toMatch(/armory\.isOpen\(\) \? armory\.pad\(edges\) : exchange(Part)?\.pad\(edges\)/);
      expect(text.indexOf('armoryPart.frame(dt, '), f).toBeGreaterThan(text.indexOf('hud.render('));
    }
  });
  it('the menu match: its data the lobby\'s ARMORY read, the screen over the input and the trigger, let go at the teardown', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/armoryPart\.setData\(/);
    expect(mount).toMatch(/menuOpen: \(\) => \(o\.blocked\?\.\(\) \?\? false\) \|\| exchange\.isOpen\(\) \|\| taunts\.isOpen\(\) \|\| armory\.isOpen\(\) \|\| startMenu\.isOpen\(\),/);
    expect(mount).toMatch(/const over: CancelCause \| null = armory\.isOpen\(\) \? 'armory' : /);
    expect(mount).toMatch(/armoryPart\.dispose\(\);/);
    // OT.R29 still has no human keyboard path on a menu/server match. The constructor-injected Forge instrument
    // can forward a typed key only inside its private loopback adapter; every other call site remains forbidden.
    const privateInput = /normalInput\?\.bind\(\{[\s\S]*?\n {2}\}\);/.exec(mount)?.[0];
    expect(privateInput).toBeDefined();
    expect(mount).toMatch(/const normalInput = o\.client\.url === 'loopback:' \? o\.normalInput : undefined;/);
    expect(privateInput).toMatch(/armoryKey: \(code\) => !gone && !\(o\.blocked\?\.\(\) \?\? false\) && armory\.isOpen\(\) && armory\.key\(code\),/);
    expect(mount.replace(privateInput!, '')).not.toMatch(/armory\.key\(/);
  });
  it('the part reads no markup and no ./main (OT.R12)', () => {
    expect(src('matchArmory.ts')).not.toMatch(/from '\.\/main'|document\.|getElementById|querySelector|localStorage/);
  });
});

/*
 * AM-2 (research 340 §2; the FI plan, checkpoint 2): the shared screen is the original's dialog, which takes the left
 * stick's flick as the d-pad press (`FUN_00377040` D:L271900-271915). The match pages' host reads the stick every frame
 * (`MatchArmory.stick`): a flick only while the screen owns the pad and no button it reads was pressed.
 */
describe('AM-2: the match ARMORY takes the stick\'s flick (research 340 §2)', () => {
  /** A W3C pad: x right, y down (the part turns it into the game's signs). */
  const pad = (x: number, y: number) => ({ axes: [x, y, 0, 0], buttons: [] });
  const opened = (o: Parameters<typeof rig>[1] = {}) => {
    const r = rig('testroom', o);
    r.part.setData(DATA);
    r.part.netDeps().joined();
    const input = vi.spyOn(r.part.armory, 'input');
    /** One frame: the clock on, the screen stepped, then the page's stick line. */
    const frame = (x: number, y: number, pressed: string[] = [], owns = true): void => {
      r.t.now += 1;
      r.part.armory.frame(0);
      r.part.stick(pad(x, y), new Set(pressed as never[]), owns);
    };
    return { r, input, frame };
  };

  it('open and owning: a push past 0.6 is the d-pad press once, none held, re-armed only within 0.2', () => {
    const { input, frame } = opened();
    frame(0, 0);
    frame(0, 0.9);                                                           // W3C down: the game's DOWN
    expect(input.mock.calls).toEqual([['down']]);
    frame(0, 0.9);
    frame(0, 0.4);                                                           // between the two: still held
    frame(0, 0.9);
    expect(input.mock.calls).toEqual([['down']]);                            // no repeat
    frame(0.1, 0.1);                                                         // within 0.2: re-armed
    frame(0.9, 0);                                                           // W3C right: the game's RIGHT
    expect(input.mock.calls).toEqual([['down'], ['right']]);
  });

  /*
   * LATER 408: the dialog reads the pad's stick 0 as `FUN_002da930` leaves it (`./menuInput` `menuStick`,
   * `MENU_STICK_READING`: `+0x220` / `+0x224`, D:L263848-263849) -- through the live DEAD ZONE (`+0x288`), the rescale
   * and the circle -- as the menus do since LATER 350. Was: the raw W3C axes, negated.
   */
  it("LATER 408: a worn stick's drift inside the dead zone re-arms (the pad's 0); the rig's default zone, 0.3", () => {
    const { input, frame } = opened();
    frame(0, 0);
    frame(0, 0.9);
    expect(input.mock.calls).toEqual([['down']]);
    frame(0, 0.28);                                                          // past 0.2 raw, inside the zone: centred
    frame(0.9, 0);
    expect(input.mock.calls).toEqual([['down'], ['right']]);
  });

  it('LATER 408: the page\'s live DEAD ZONE, read at each read: at 0 the same drift holds the stick out; at 0.3 it re-arms', () => {
    let zone = 0;
    const { input, frame } = opened({ deadZone: () => zone });
    frame(0, 0);
    frame(0, 0.9);
    frame(0, 0.28);                                                          // zone 0: 0.28 x sqrt 2 (the circle), out
    frame(0.9, 0);
    expect(input.mock.calls).toEqual([['down']]);
    zone = 0.3;                                                              // CONTROLLER OPTIONS moved
    frame(0, 0.28);
    frame(0, 0.9);
    expect(input.mock.calls).toEqual([['down'], ['down']]);
  });

  it('LATER 408: both pages hand the part the camera\'s live dead zone; the part reads no raw axes', () => {
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).toMatch(/\n {2,4}deadZone: \(\) => fly\.lookOptions\(\)\.stick\.deadZone,/);
    expect(src('matchArmory.ts')).not.toMatch(/armoryStick\.read\(-\(/);
  });

  it('a stick held as the screen opens (a player running at a respawn) is no flick', () => {
    const r = rig('testroom');
    r.part.stick(pad(0, 0.9), new Set(), true);                             // shut: read, armed, nothing handed on
    r.part.stick(pad(0, 0.9), new Set(), true);
    r.part.setData(DATA);
    r.part.netDeps().joined();
    const input = vi.spyOn(r.part.armory, 'input');
    for (let i = 0; i < 3; i++) { r.t.now += 1; r.part.armory.frame(0); r.part.stick(pad(0, 0.9), new Set(), true); }
    expect(input).not.toHaveBeenCalled();
  });

  it('not the screen\'s pad (the START menu, Chat or the editor over it): no flick; a press it reads this frame: no flick', () => {
    const { input, frame } = opened();
    frame(0, 0);
    frame(0, 0.9, [], false);
    expect(input).not.toHaveBeenCalled();
    frame(0, 0);
    frame(0, 0.9, ['Right']);                                                // ARMORY_STICK_SAME_FRAME_READING
    expect(input).not.toHaveBeenCalled();
  });

  it('both pages: the stick line right before the menu line (the original arms first, F2), owning as the menu does, the physical pad (never the touch pad\'s); armed in the loading hold (F1)', () => {
    const lines: [string, RegExp, RegExp, RegExp][] = [
      ['main.ts', /\n {2}armoryPart\.stick\(polled, edges, playOn && !\(start\.owns \|\| editorOwns \|\| chat\.owns\)\);[^\n]*\n/,
        /^ {2}const menu = start\.owns \|\| editorOwns \|\| chat\.owns \|\| playOn && \(armory\.isOpen\(\) \? armory\.pad\(edges\) : exchangePart\.pad\(edges\)\);/,
        /exchangePart\.hold\([^\n]*\n {4}armoryPart\.stick\(held, new Set\(\), false\);/],
      ['matchMount.ts', /\n {4}armoryPart\.stick\(polled, edges, !\(start\.owns \|\| chat\.owns\)\);[^\n]*\n/,
        /^ {4}const menu = start\.owns \|\| chat\.owns \|\| \(armory\.isOpen\(\) \? armory\.pad\(edges\) : exchange\.pad\(edges\)\);/,
        /exchange\.hold\([^\n]*\n {6}armoryPart\.stick\(polled, new Set\(\), false\);/],
    ];
    for (const [f, stick, menu, hold] of lines) {
      const text = src(f);
      const m = stick.exec(text);
      expect(m, f).not.toBeNull();
      expect(text.slice(m!.index + m![0].length), f).toMatch(menu);        // the next line is the menu's
      expect(text, f).toMatch(hold);                                       // the hold branch arms it, handing nothing on
      expect(text, f).not.toMatch(/armoryPart\.stick\(touch\.pad/);
    }
    // The frame the screen owns the pad, `menu` is true and the game's lanes take nothing from the same stick.
    expect(src('matchMount.ts')).toMatch(/const input = exchange\.input\.frame\(chat\.input, menu\);/);
    expect(src('main.ts')).toMatch(/input = exchangeInput\.frame\(input, menu\);/);
  });

  it("the review's F1: a stick held through the loading hold, onto a screen the welcome opened behind it, is no flick at the release; a fresh push is", () => {
    const r = rig('testroom');
    const input = vi.spyOn(r.part.armory, 'input');
    // The hold: the page's hold branch reads the stick (no press set, not owning) -- the welcome opens the screen behind it.
    r.part.stick(pad(0, 0.9), new Set(), false);
    r.part.setData(DATA);
    r.part.netDeps().joined();
    for (let i = 0; i < 3; i++) { r.t.now += 1; r.part.armory.frame(0); r.part.stick(pad(0, 0.9), new Set(), false); }
    // The release: the same push, still held, now the screen's pad.
    for (let i = 0; i < 3; i++) { r.t.now += 1; r.part.armory.frame(0); r.part.stick(pad(0, 0.9), new Set(), true); }
    expect(input).not.toHaveBeenCalled();
    r.t.now += 1; r.part.armory.frame(0); r.part.stick(pad(0, 0), new Set(), true);
    r.t.now += 1; r.part.armory.frame(0); r.part.stick(pad(0, 0.9), new Set(), true);
    expect(input.mock.calls).toEqual([['down']]);
  });
});
