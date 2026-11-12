// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, type Loadout, type Pick, type Side } from '@s2u/scene';
import { pinnedMatchSocket } from '../src/connectHost';
import { noInput, type GamepadLike, type Input, type PadButton } from '../src/gamepad';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } from '../src/matchCore';
import { mountExchange, type MatchExchange, type MatchExchangeDeps } from '../src/matchExchange';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { matchNetDeps, PART_DEPS, type MatchNetParts } from '../src/matchNet';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { StanceButton } from '../src/stanceButton';
import type { WalkMode } from '../src/walk';
import {
  EXCHANGE_STICK_DEAD_ZONE_ADAPTATION, EXCHANGE_STICK_PUSH_ADAPTATION, EXCHANGE_STICK_REST_ADAPTATION, type MatchGate,
} from '../src/weaponExchange';
import { WEAPON_SELECT_ELEMENT, type InputDevice } from '../src/weaponSelect';
import { SPECTATE_KIT_CHANGE_OWNER } from '../src/weaponSelectState';

/**
 * PAR-1 (web research 253): WEAPON EXCHANGE and the dead's prompt as one part (`../src/matchExchange`), `main.ts`'s
 * lines written once for both pages -- the gate and the prompt (`FUN_001f7ff0` D:L56648-56661, `FUN_001f97b0` D:L56980),
 * the menu on R2, the choices sent through the page's match (protocol 7), the room's answer shown, the round's reset at
 * the respawn (`FUN_002a7d40` D:L149757 -> `FUN_00240d50`), the blur, and its ownership of the pad's buttons ahead of
 * the trigger lane, the R2 inventory and the game's lanes (research 300 §3, a browser safeguard). Fakes, and one real
 * `NetPage` on the lobby's hand-off (`test/matchMount.test.ts`'s fakes, trimmed); no server, no browser.
 *
 * The front end does not mount the part until wave 4 (PAR.R3: `matchMount.ts`, `matchCore.ts`, `matchNet.ts` and
 * `main.ts` are the integrator's): the pins marked "flips at wave 4" hold today's state and turn with research 253 §3's
 * hunks.
 */

// ---- the arsenal (weaponExchange.test.ts's): the SEALs' M4A1 / M4A1 SD, the Terrorists' 552 / AK-47 ----
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number): RdrNode[] => rec(['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['AMMO_TYPES', []], ['IconTextureName', `${name}_icon.tif`]);
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('Mark 23', 15), item('M9', 5), item('M4A1', 54), item('M4A1 SD', 62), item('AK-47', 58), item('552', 57),
  item('M67', 121), item('AN-M8', 122), item('HE', 126), item('C4', 151), item('Double Ammo Load', 194),
]] as RdrNode);
const valves = new Map([
  ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_m4Acarbine', 1], ['Enable_M4A1_SD', 1], ['Enable_ak47', 8],
  ['Enablesig_commando', 8], ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_c4', 17], ['Enable_2xammo', 9],
]);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const SEAL_KIT = kit(54, 15, 121, 151, 194);
/** The map on screen, as `LoadedMap.arsenal` holds it: the kit tables' arsenal and the map's valves. */
const MAP = { arsenal: { table: { arsenal }, map: { valves } } } as never;
const DEAD: MatchGate = { inMatch: true, alive: false, cameraOnSelf: true, spectator: false };

/** A page's match, faked: its gate, its dead's prompt and the `loadout` requests it sends. */
function fakeNet(gate: MatchGate = DEAD, prompt: { ghost: boolean; sinceDeath: number; respawnReady?: boolean } | null = { ghost: false, sinceDeath: 1 }) {
  const sent: Pick[][] = [];
  const net = { gate: () => gate, prompt: () => prompt, requestLoadout: (l: readonly Pick[]) => { sent.push(l.map((p) => ({ ...p }))); } };
  return { net, sent, set: (g: MatchGate, p: typeof prompt = prompt) => { gate = g; prompt = p; } };
}

/** The window's blur and its listeners, counted (`test/matchMount.test.ts`'s `fakeWindow`, its listeners alone). */
function fakeWindow() {
  const heard = new Map<string, Set<EventListener>>();
  const win = {
    addEventListener: (type: string, fn: EventListener) => { (heard.get(type) ?? heard.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener: (type: string, fn: EventListener) => { heard.get(type)?.delete(fn); },
  };
  const fire = (type: string): void => { for (const fn of [...(heard.get(type) ?? [])]) fn(new Event(type)); };
  return { win, heard, fire };
}

function rig(o: { net?: ReturnType<typeof fakeNet>['net'] | null; walking?: () => boolean; side?: () => Side; loadouts?: PlayerLoadout; map?: () => never | null; device?: () => InputDevice } = {}) {
  const n = fakeNet();
  const net = o.net === undefined ? n.net : o.net;
  const w = fakeWindow();
  const loadouts = o.loadouts ?? new PlayerLoadout();
  if (!o.loadouts) loadouts.setDevKit(SEAL_KIT);                          // the kit the type's picks are replayed from
  let now = 0;
  const deps: MatchExchangeDeps = {
    net: () => net, map: o.map ?? (() => MAP), side: o.side ?? (() => 'seal'), loadouts,
    walking: o.walking ?? (() => true), device: o.device ?? (() => 'pad'), win: w.win, clock: () => now,
  };
  const ex = mountExchange(deps);
  ex.refresh();
  /** One pad frame: the buttons down, the menu's step; whether it holds the pad. */
  const press = (...held: PadButton[]): boolean => ex.pad(ex.edges(new Set(held)));
  /** A press and its release. */
  const tap = (b: PadButton): void => { press(b); press(); };
  return { ex, n, w, loadouts, press, tap, advance: (s: number) => { now += s; } };
}

describe('the gate and the dead\'s prompt (FUN_001f7ff0 D:L56648-56661, FUN_001f97b0 D:L56980; main.ts:439-450)', () => {
  it('refreshes the shared dead-exchange context when only the trusted equipment limit changes', () => {
    const r = rig();
    expect(r.ex.menu.context()!.valves.get('Enable_m4Acarbine')).toBe(1);
    r.loadouts.setEquipmentLimit(2);
    r.ex.refresh();
    expect(r.ex.menu.context()!.valves.get('Enable_m4Acarbine')).toBe(0);
    expect(r.ex.menu.context()!.valves.get('Enable_spas')).toBe(9);
    expect(r.ex.menu.context()!.valves.get('Enable_Mark23')).toBe(1);
    expect(valves.get('Enable_m4Acarbine')).toBe(1);
  });

  it.each([
    // [what, the gate, opens]
    ['dead, in a round, on oneself', DEAD, true],
    ['alive (R2 is the R2 inventory then)', { ...DEAD, alive: true }, false],
    // SPECTATE_KIT_CHANGE_OWNER (the owner, 2026-11-11): the original refuses here (D:L56659-56660); the port opens it.
    ['following a teammate (SPECTATE_KIT_CHANGE_OWNER)', { ...DEAD, cameraOnSelf: false }, SPECTATE_KIT_CHANGE_OWNER],
    ['a spectator', { ...DEAD, spectator: true }, false],
    ['out of the match', { ...DEAD, inMatch: false }, false],
  ] as const)('R2 opens the menu through the page\'s gate: %s', (_what, gate, opens) => {
    const n = fakeNet(gate);
    const r = rig({ net: n.net });
    expect(r.press('R2')).toBe(opens);
    expect(r.ex.isOpen()).toBe(opens);
    expect(r.ex.gate()).toEqual(gate);
  });
  it('no match: the gate is main.ts\'s "no match, alive" and nothing opens; no prompt', () => {
    const r = rig({ net: null });
    expect(r.ex.gate()).toEqual({ inMatch: false, alive: true, cameraOnSelf: true, spectator: false });
    expect(r.press('R2')).toBe(false);
    expect(r.ex.prompt()).toBeNull();
  });
  it('the prompt: the room\'s dead or ghost lines on foot in the game, on the page\'s device; none off the walk or with no lines', () => {
    let walking = true;
    const n = fakeNet(DEAD, { ghost: true, sinceDeath: 2.5 });
    const r = rig({ net: n.net, walking: () => walking });
    expect(r.ex.prompt()).toEqual({ ghost: true, device: 'pad', sinceDeath: 2.5 });
    walking = false;
    expect(r.ex.prompt()).toBeNull();
    walking = true;
    n.set({ ...DEAD, alive: true }, null);
    expect(r.ex.prompt()).toBeNull();
  });
  it("LATER 118: the prompt's device, one source for the prompt and the HUD's help lines (the page's `device`, read at each call)", () => {
    let device: InputDevice = 'touch';
    const r = rig({ device: () => device });
    expect(r.ex.device()).toBe('touch');
    expect(r.ex.prompt()?.device).toBe(r.ex.device());
    device = 'pad';
    expect(r.ex.device()).toBe('pad');
    expect(r.ex.prompt()?.device).toBe('pad');
    expect(rig({ net: null }).ex.device()).toBe('pad');                    // no match: the page's device all the same
  });
  it('RSP-6: the shared prompt preserves respawn eligibility, and the hook names only its two help lines', () => {
    const n = fakeNet(DEAD, { ghost: false, sinceDeath: 2, respawnReady: false });
    const r = rig({ net: n.net, device: () => 'keyboard' });
    expect(r.ex.prompt()).toEqual({ ghost: false, sinceDeath: 2, respawnReady: false, device: 'keyboard' });
    expect(r.ex.state().prompt).toEqual(['You have died.  [I] Select new weapons.']);
    n.set(DEAD, { ghost: false, sinceDeath: 12, respawnReady: true });
    expect(r.ex.state().prompt).toEqual(['You have died.  [I] Select new weapons.', 'Press the [X] button to respawn.']);
  });
  it('the overlay draws the menu only: the dead\'s lines are the HUD\'s six help lines (LATER 118, research 282 §8); the hook still reads their text', () => {
    const r = rig();
    const sizes = { 'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 256, height: 256 } };
    const frame = { width: 640, height: 448 };
    const closed = r.ex.overlay(frame, sizes);
    expect(closed.quads).toEqual([]);                                     // the menu closed, the prompt the HUD's: nothing
    expect(r.ex.state().prompt?.length).toBeGreaterThan(0);              // the hook's read of the lines, unchanged
    r.press('R2');
    r.advance(1);
    const open = r.ex.overlay(frame, sizes);
    expect(open.quads.length).toBeGreaterThan(0);
    expect(new Set(open.quads.map((q) => q.element))).toEqual(new Set([WEAPON_SELECT_ELEMENT]));
    expect(open.quads).toEqual(r.ex.menu.draw(frame, sizes, null).quads);   // the menu's quads, no prompt among them
  });
  it('the menu\'s world kept current: none without the kit tables or a match; a new map, match or side sets it once', () => {
    let map: never | null = null, side: Side = 'seal';
    const r = rig({ map: () => map, side: () => side });
    expect(r.ex.menu.context()).toBeNull();
    expect(r.press('R2')).toBe(false);                                     // no ZWEAPON.ZAR: nothing to open
    map = MAP;
    r.ex.frame();
    expect(r.ex.menu.context()).toMatchObject({ side: 'seal', valves });
    const set = vi.spyOn(r.ex.menu, 'setContext');
    r.ex.frame();
    r.ex.refresh();
    expect(set).not.toHaveBeenCalled();                                    // unchanged: not set again
    side = 'terrorist';
    r.ex.frame();
    expect(set).toHaveBeenCalledTimes(1);
    expect(r.ex.menu.context()?.side).toBe('terrorist');
  });
});

describe('the choices through the page\'s match (FUN_0023e5e0 D:L88379; protocol 7; main.ts:289-299)', () => {
  it('Cross confirms a pick: the side\'s list sent as the loadout request; the menu shows the kit with it', () => {
    const r = rig();
    r.tap('R2'); r.tap('Cross'); r.tap('Down');                            // the list, the picker on the M4A1, the M4A1 SD
    expect(r.ex.menu.state()).toMatchObject({ screen: 'picker', item: 62 });
    r.tap('Cross');
    expect(r.n.sent).toEqual([[{ slot: 0, id: 62 }]]);
    expect(r.loadouts.picks('seal')).toEqual([{ slot: 0, id: 62 }]);
    expect(r.ex.state()).toMatchObject({ screen: 'list', loadout: [62, 15, 121, 151, 194], sent: [{ slot: 0, id: 62 }] });
  });
  it('the list kept short (compactPicks): a pick back to the kit the type holds sends what reaches the same kit', () => {
    const r = rig();
    r.tap('R2'); r.tap('Cross'); r.tap('Down'); r.tap('Cross');           // M4A1 SD
    r.tap('Cross'); r.tap('Up'); r.tap('Cross');                           // and back to the M4A1
    expect(r.n.sent.at(-1)).toEqual([]);                                   // the type's own kit: no pick needed
  });
  it('a list the room would refuse as too long is not taken: nothing sent, the kit held shown again', () => {
    const loadouts = new PlayerLoadout();
    loadouts.setDevKit(SEAL_KIT);
    vi.spyOn(loadouts, 'confirm').mockReturnValue(null);
    const r = rig({ loadouts });
    r.tap('R2'); r.tap('Cross'); r.tap('Down'); r.tap('Cross');
    expect(r.n.sent).toEqual([]);
    expect(r.ex.menu.state().loadout).toEqual(SEAL_KIT);
  });
  it('opens on the type\'s next kit -- the pick held, else its own -- asked at each opening', () => {
    const r = rig();
    r.loadouts.setLoadout(kit(62, 15, 122, 151, 194), 'seal');
    r.tap('R2');
    expect(r.ex.menu.state().loadout).toEqual([62, 15, 122, 151, 194]);
  });
});

describe('the cancel through the part (FUN_0023e5e0 D:L88379: Triangle or Start back, R2 closes the list; research 94 §B4, 300 §3)', () => {
  it('Triangle backs the picker out to the list, Start closes the list, R2 closes it too: nothing sent, the kit as it was', () => {
    const r = rig();
    r.tap('R2');
    expect(r.ex.menu.state()).toMatchObject({ screen: 'list', slot: 0 });
    r.tap('Cross'); r.tap('Down');                                         // the picker, on the M4A1 SD
    expect(r.ex.menu.state()).toMatchObject({ screen: 'picker', item: 62 });
    r.tap('Triangle');                                                     // back: the pick not taken
    expect(r.ex.menu.state()).toMatchObject({ screen: 'list', loadout: [...SEAL_KIT] });
    r.tap('Start');                                                        // back from the list: closed
    expect(r.ex.isOpen()).toBe(false);
    r.tap('R2');
    expect(r.ex.menu.state().screen).toBe('list');
    r.tap('R2');                                                           // R2 closes the list
    expect(r.ex.isOpen()).toBe(false);
    r.tap('R2'); r.tap('Cross');
    r.tap('R2');                                                           // R2 is ignored by the picker
    expect(r.ex.menu.state().screen).toBe('picker');
    expect(r.n.sent).toEqual([]);
    expect(r.loadouts.picks('seal')).toEqual([]);
    expect(r.ex.menu.state().loadout).toEqual(SEAL_KIT);
  });
  it('open, the part holds the pad on a frame with no press (its step answers the menu, not the edges); closed, it does not', () => {
    const r = rig();
    expect(r.ex.pad(r.ex.edges(new Set()))).toBe(false);
    r.tap('R2');
    expect(r.ex.pad(r.ex.edges(new Set()))).toBe(true);
    expect(r.ex.pad(new Set())).toBe(true);
    r.tap('Start');
    expect(r.ex.pad(r.ex.edges(new Set()))).toBe(false);
  });
});

describe('answered, the reset at the respawn, the blur, the teardown (main.ts:288, 1723-1726)', () => {
  it('answered (the part\'s MatchNetHooks addition): the room\'s kit on the menu\'s rows; answer() the same for the ARMORY\'s', () => {
    const r = rig();
    expect(Object.keys(r.ex.netHooks())).toEqual(['answered']);
    r.tap('R2');
    r.ex.netHooks().answered(kit(62, 15, 122, 151, 194));
    expect(r.ex.state().loadout).toEqual([62, 15, 122, 151, 194]);
    r.ex.answer(kit(54, 15, 126, 151, 194));
    expect(r.ex.state().loadout).toEqual([54, 15, 126, 151, 194]);
  });
  it('S8: the reset closes the menu over the kit the spawn took (PlayerLoadout.loadout); an unconfirmed pick is lost', () => {
    const r = rig();
    r.tap('R2'); r.tap('Cross'); r.tap('Down');
    r.ex.reset();
    expect(r.ex.isOpen()).toBe(false);
    expect(r.ex.menu.state().loadout).toEqual([...r.loadouts.loadout()]);
    expect(r.n.sent).toEqual([]);
  });
  it('the blur forgets the keys the menu held (a keyup never comes); the menu stays as it was, as main.ts\'s blur', () => {
    const r = rig();
    r.tap('R2');
    expect(r.ex.input.key('KeyW', true, true)).toBe(true);                 // taken by the open menu, owned till let go
    expect(r.ex.input.key('KeyW', true, false)).toBe(true);
    r.w.fire('blur');
    expect(r.ex.input.key('KeyW', true, false)).toBe(false);               // forgotten: the game's again
    expect(r.ex.isOpen()).toBe(true);
  });
  it('dispose: the blur listener off, the menu closed for good', () => {
    const r = rig();
    expect(r.w.heard.get('blur')?.size).toBe(1);
    r.tap('R2');
    r.ex.dispose();
    expect(r.w.heard.get('blur')?.size).toBe(0);
    expect(r.ex.isOpen()).toBe(false);
    expect(r.press('R2')).toBe(false);
  });
});

// ---- a real NetPage on the lobby's hand-off (test/matchMount.test.ts's handOff and page fakes, trimmed) ----
const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[] };
const welcome = {
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [{ id: 3, name: 'kilo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
} as unknown as ServerEvent;
function handOff() {
  const socks: Sock[] = [];
  const hands: GameLobbyHandOff[] = [];
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: () => {}, matchStart: (h) => { hands.push(h); },
    socket: () => {
      const sent: string[] = [];
      const s = { binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => {} } as unknown as Sock;
      socks.push(s);
      return s;
    },
  });
  host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
  host.open(7);
  socks[0]!.onopen?.({});
  const say = (ev: ServerEvent): void => { socks[0]!.onmessage?.({ data: JSON.stringify(ev) }); };
  say(welcome);
  host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false });
  return { h: hands[0]!, socks, say };
}

describe('the front end\'s wiring on a real NetPage (research 253 §3\'s hunk, on today\'s matchNetDeps)', () => {
  it('a death on the lobby\'s client: the prompt and R2\'s menu; Cross\'s pick a loadout request on the socket; the room\'s answer shown; the spawn closes it', () => {
    const x = handOff();
    const loadouts = new PlayerLoadout();
    loadouts.setDevKit(SEAL_KIT);
    let net: NetPage | null = null;
    const ex = mountExchange({ net: () => net, map: () => MAP, side: () => net?.client.team ?? 'seal', loadouts, walking: () => true, device: () => 'pad' });
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', feet: () => null,
    } as unknown as WalkMode;
    const remote = { setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [] } as unknown as RemotePlayers;
    const parts: MatchNetParts = {
      caps: FRONT_END_CAPABILITIES, walk, remote, hud: new Hud(), fly: { setPose: () => {} }, loadouts,
      firearm: {
        records: () => [] as never, roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {},
        fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
      },
      clips: () => null, map: () => MAP, side: () => net?.client.team ?? 'seal', followTeam: () => {},
      menuOpen: () => ex.isOpen(),
    };
    const deps: NetPageDeps = matchNetDeps(parts, { ...ex.netHooks(), respawned: () => { ex.reset(); } }, {
      remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {}, whiteOut: () => {}, sceneRound: () => {},
      voiceFloor: () => {}, voiceFrame: () => {},   // SVC-20b-page: the voice client's, owed by the front end since sprint 20
      reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {}, roundAudio: { roundStart: () => {}, eliminated: () => {}, timeExpired: () => {}, roundOver: () => {}, reset: () => {}, frame: () => {} } as never, objective: () => null, escorteeVoice: () => {},
      taunt: () => {}, communication: () => {}, hostageState: () => {},
      drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {},   // PAR-4: the world drops' two, owed on the front end's switch
      armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {},   // PAR-2: the seat ARMORY's, owed since
      game: { id: 7, ticket: 'tkt', pinned: PINNED, adopt: { client: x.h.client, events: [welcome] } },
    });
    net = new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
    ex.frame();
    expect(ex.prompt()).toBeNull();                                        // alive: no lines, R2 is the inventory's
    const step = (...held: PadButton[]): boolean => ex.pad(ex.edges(new Set(held)));
    expect(step('R2')).toBe(false);
    step();
    x.say({ type: 'kill', killer: 3, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: null } as unknown as ServerEvent);
    expect(ex.gate()).toMatchObject({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
    expect(ex.prompt()).toMatchObject({ ghost: false, device: 'pad' });
    for (const b of ['R2', 'Cross', 'Down', 'Cross'] as const) { expect(step(b)).toBe(true); step(); }
    const loadoutsSent = x.socks[0]!.sent.filter((d) => typeof d === 'string' && d.includes('"loadout"')).map((d) => JSON.parse(d) as { picks: Pick[] });
    expect(loadoutsSent.at(-1)?.picks).toEqual([{ slot: 0, id: 62 }]);
    expect(deps.menuOpen?.()).toBe(true);                                  // the dead's teammate cycle held (DEAD_CYCLE_WHILE_MENU_READING)
    x.say({ type: 'loadout', kit: [62, 15, 122, 151, 194], refused: null } as unknown as ServerEvent);
    expect(ex.state().loadout).toEqual([62, 15, 122, 151, 194]);          // the room's answer on the rows
    x.say({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0, kit: [62, 15, 122, 151, 194] } as unknown as ServerEvent);
    expect(ex.isOpen()).toBe(false);                                       // the round's reset closed it
    expect(ex.prompt()).toBeNull();
    net.close();
  });
});

// ---- the pad's ownership ahead of the lanes, in main.ts's padFrame order ----
/** main.ts's padFrame past its hold, the part's lines in it (research 253 §3): the edges, the step, the ownership, then R1, the R2 inventory and the lanes. */
function padPage(ex: MatchExchange) {
  const seen: string[] = [];
  const l: LaneParts = {
    walk: {
      mode: () => 'walk', isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand',
      jump: () => { seen.push('jump'); return true; }, crouch: () => { seen.push('crouch'); return true; }, setStance: (s) => { seen.push(`stance:${s}`); return true; },
    },
    firearm: {
      stepZoom: (how) => { seen.push(`zoom:${how}`); return 1; }, switchFireMode: () => { seen.push('fireMode'); return 'auto'; }, viewLanes: () => {},
      fire: { reload: () => { seen.push('reload'); return true; } },
    },
    stanceButton: new StanceButton(),
    shoulder: (w) => { seen.push(`shoulder:${w}`); },
    action: (before, after) => { if (after.action && !before.action) seen.push('action:press'); else if (!after.action && before.action) seen.push('action:release'); },
  };
  let padMerged: Input = noInput(), padGame: Input = noInput();
  const frame = (held: PadButton[], lanes: Partial<Input> = {}): boolean => {
    let input: Input = { ...noInput(), ...lanes };
    const edges = ex.edges(new Set(held));
    const menu = ex.pad(edges);
    input = ex.input.frame(input, menu);
    if (!menu && input.fire !== padMerged.fire) seen.push(`trigger:${input.fire}`);
    else if (menu && padMerged.fire) seen.push('trigger:false');
    const game = menu ? input : (input.inventory && !padMerged.inventory && seen.push('inventory:R2'), input);
    playerLanes(l, padGame, game, 1 / 60, { walking: true, menu });
    padMerged = input;
    padGame = game;
    return menu;
  };
  return { frame, seen };
}

describe('the pad\'s buttons owned ahead of the trigger lane, the R2 inventory and the game\'s lanes (research 300 §3)', () => {
  it('edges: a button pressed this frame, not one held; the loading hold\'s baseline makes a held one no press at the release', () => {
    const r = rig();
    expect([...r.ex.edges(new Set(['R2', 'Cross']))].sort()).toEqual(['Cross', 'R2']);
    expect([...r.ex.edges(new Set(['R2', 'Cross']))]).toEqual([]);
    r.ex.edges(new Set());
    r.ex.hold(new Set(['R2']));                                             // R2 held through the hold
    expect([...r.ex.edges(new Set(['R2']))]).toEqual([]);
  });
  it('dead, R2 opens the menu: no inventory, no trigger, no lane sees R2, Cross, R1 or the d-pad while it is open', () => {
    const r = rig();
    const p = padPage(r.ex);
    expect(p.frame(['R2'], { inventory: true })).toBe(true);
    p.frame([]);
    expect(p.frame(['Cross'], { action: true })).toBe(true);
    expect(p.frame(['Cross', 'R1'], { action: true, fire: true })).toBe(true);
    expect(p.frame(['Cross', 'R1', 'Down'], { action: true, fire: true, zoomOut: true })).toBe(true);
    expect(p.seen).toEqual([]);
    expect(r.ex.menu.state().screen).toBe('picker');
  });
  it('a Cross and an R1 held through the round\'s reset stay the menu\'s until let go: no action press, no shot; the next press is one', () => {
    const r = rig();
    const p = padPage(r.ex);
    p.frame(['R2'], { inventory: true }); p.frame([]);
    p.frame(['Cross'], { action: true });                                  // the picker
    p.frame(['Cross', 'R1'], { action: true, fire: true });
    r.ex.reset();                                                          // the respawn under the held buttons
    for (let i = 0; i < 30; i++) expect(p.frame(['Cross', 'R1'], { action: true, fire: true })).toBe(false);
    p.frame([]);
    expect(p.seen).toEqual([]);                                            // no press, no release, no trigger
    p.frame(['Cross', 'R1'], { action: true, fire: true });
    expect(p.seen).toEqual(['trigger:true', 'action:press']);
  });
  it('a Triangle held through the menu\'s own close reaches no lane until let go: no stance step, no prone; the next tap is one', () => {
    const r = rig();
    const p = padPage(r.ex);
    p.frame(['R2'], { inventory: true }); expect(p.frame([])).toBe(true);   // open, and held open with no press
    p.frame(['Cross'], { action: true }); p.frame([]);                      // the picker
    expect(p.frame(['Triangle'], { stance: true })).toBe(true);             // back to the list, Triangle held
    expect(p.frame(['Triangle', 'Start'], { stance: true, mode: true })).toBe(true);   // Start closes it, both held
    expect(r.ex.isOpen()).toBe(false);
    for (let i = 0; i < 90; i++) expect(p.frame(['Triangle', 'Start'], { stance: true, mode: true })).toBe(false);   // 1.5 s held: a prone's hold
    p.frame([]);
    expect(p.seen).toEqual([]);                                             // no stance step, no crouch at the release
    p.frame(['Triangle'], { stance: true }); p.frame([]);
    expect(p.seen.length).toBeGreaterThan(0);                               // a fresh tap is the stance button's again
    expect(p.seen.every((s) => s.startsWith('stance:'))).toBe(true);
  });
  it('an R2 held through the list\'s close reaches neither the R2 inventory nor a reopening until let go; then R2 is a press again', () => {
    const n = fakeNet();
    const r = rig({ net: n.net });
    const p = padPage(r.ex);
    p.frame(['R2'], { inventory: true }); p.frame([]);
    expect(p.frame([])).toBe(true);
    expect(p.frame(['R2'], { inventory: true })).toBe(true);               // R2 closes the list, and stays down
    expect(r.ex.isOpen()).toBe(false);
    for (let i = 0; i < 60; i++) expect(p.frame(['R2'], { inventory: true })).toBe(false);   // still dead: no edge, no reopening
    expect(r.ex.isOpen()).toBe(false);
    n.set({ ...DEAD, alive: true }, null);                                  // respawned under the held R2
    for (let i = 0; i < 10; i++) p.frame(['R2'], { inventory: true });
    expect(p.seen).toEqual([]);                                             // the R2 inventory never saw it
    p.frame([]);
    p.frame(['R2'], { inventory: true });
    expect(p.seen).toEqual(['inventory:R2']);
  });
  it('alive, R2 is not the menu\'s: it reaches the R2 inventory and the game\'s lanes as before', () => {
    const n = fakeNet({ ...DEAD, alive: true }, null);
    const r = rig({ net: n.net });
    const p = padPage(r.ex);
    expect(p.frame(['R2'], { inventory: true })).toBe(false);
    expect(p.frame(['R2', 'Cross'], { inventory: true, action: true })).toBe(false);
    expect(p.seen).toEqual(['inventory:R2', 'action:press']);
  });
});

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

describe('the one wiring: main.ts\'s lines in the part, both pages mount it since wave 4 (research 253 §2-§3)', () => {
  /** [main.ts today, the part]: each line /testroom runs, transcribed. */
  const LINES: [string, string][] = [
    ['const exchange = new WeaponExchange({\n  clock: () => performance.now() / 1000,', 'const clock = d.clock ?? ((): number => performance.now() / 1000);'],
    ["globalThis.addEventListener('blur', () => exchangeInput.blur());", "d.win?.addEventListener('blur', blur);"],
    ['opensOn: () => loadouts.pending(matchSide()) ?? loadouts.base(matchSide()),', 'opensOn: () => d.loadouts.pending(d.side()) ?? d.loadouts.base(d.side()),'],
    ['const list = loadouts.confirm(side, pick, (l) => (ctx ? compactPicks(ctx, loadouts.base(side), l) : [...l]));', 'const list = d.loadouts.confirm(side, pick, (l) => (ctx ? compactPicks(ctx, d.loadouts.base(side), l) : [...l]));'],
    ['if (!list) { exchange.answer(loadouts.pending(side) ?? loadouts.base(side)); return; }', 'if (!list) { menu.answer(d.loadouts.pending(side) ?? d.loadouts.base(side)); return; }'],
    ['net?.requestLoadout(list);', 'd.net()?.requestLoadout(list);'],
    ["return a && net ? { arsenal: a.table.arsenal, valves: a.map?.valves ?? new Map(), side: matchSide() } : null;", "return a && d.net() ? { arsenal: a.table.arsenal, valves: equipmentLimitValves(a.map?.valves ?? new Map(), d.loadouts.equipmentLimit?.() ?? 0), side: d.side() } : null;"],
    ['const key = [loaded, net, matchSide()];', 'const now = [d.map(), d.net(), d.side(), d.loadouts.equipmentLimit?.() ?? 0];'],
    ['return net ? net.gate() : { inMatch: false, alive: true, cameraOnSelf: true, spectator: false };', 'NO_MATCH: MatchGate = { inMatch: false, alive: true, cameraOnSelf: true, spectator: false };'],
    ["const p = playOn && walk.mode() === 'walk' ? net?.prompt() ?? null : null;", 'const p = d.walking() ? d.net()?.prompt() ?? null : null;'],
    ['const ws = exchange.draw(frame, sizes, promptInfo());', 'menu.draw(frame, sizes, null)'],   // LATER 118: the prompt the HUD's now
    ['const edges = new Set([...down].filter((b) => !padButtonsLast.has(b)));', 'const out = new Set([...down].filter((b) => !last.has(b)));'],
    ['edges.size ? exchange.pad(edges, exchangeGate()) : exchange.isOpen()', 'edges.size ? menu.pad(edges, gate()) : menu.isOpen()'],
    ['answered: (l) => { exchange.answer(l); },', 'answered: (kit) => { menu.answer(kit); }'],
    ['respawned: () => { grenade.refill(); exchange.reset(loadouts.loadout()); },', 'menu.reset(d.loadouts.loadout())'],
  ];
  it('main.ts calls mountExchange and holds none of the lines it moved; the part holds each (flipped at wave 4)', () => {
    const main = src('main.ts'), part = src('matchExchange.ts');
    for (const [today, moved] of LINES) {
      expect(main, today).not.toContain(today);
      expect(part, moved).toContain(moved);
    }
    expect(main).not.toMatch(/new WeaponExchange\(|new ExchangeInput\(/);
    expect(main).toMatch(/const exchangePart = mountExchange\(\{/);
    expect(main).toMatch(/const \{ menu: exchange, input: exchangeInput, refresh: refreshExchange, gate: exchangeGate, prompt: promptInfo \} = exchangePart;/);
  });
  it('both pages call the part\'s steps: the overlay, the edges and the step before the ownership, the frame after followNet, the hooks, the reset at the respawn', () => {
    for (const [f, name] of [['main.ts', 'exchangePart'], ['matchMount.ts', 'exchange']] as const) {
      const text = src(f);
      for (const call of ['.overlay(frame, sizes)', '.edges(down)', '.pad(edges)', '.hold(new Set([...padButtonsDown(', '.netHooks(),', '.reset();', '.frame();']) {
        expect(text, `${f}: ${call}`).toContain(`${name}${call}`);
      }
      expect(text.indexOf(`${name}.frame();`), f).toBeGreaterThan(text.indexOf('acts.followNet();'));
    }
    expect(src('matchMount.ts')).toMatch(/exchange\.dispose\(\);/);
  });
  it('the part makes the menu and the ownership itself, and reads no markup and no ./main (OT.R12)', () => {
    const part = src('matchExchange.ts');
    expect(part).toMatch(/new WeaponExchange\(\{/);
    expect(part).toMatch(/new ExchangeInput\(\)/);
    expect(part).not.toMatch(/from '\.\/main'|document\.|getElementById|querySelector|globalThis/);
  });
  it('/testroom\'s ownership comes before the trigger lane, the R2 inventory and playerLanes (holds before and after wave 4)', () => {
    const main = src('main.ts');
    const pad = main.slice(main.indexOf('function padFrame('));
    const at = (re: RegExp): number => { const i = pad.search(re); expect(i, String(re)).toBeGreaterThan(0); return i; };
    const step = at(/exchange(Part)?\.pad\(edges/), owned = at(/input = exchangeInput\.frame\(input, menu\);/);
    expect(step).toBeLessThan(owned);
    for (const later of [/trigger\(input\.fire\);/, /inventory\.frame\(padMerged, input, dt, frameTime\.real\(\)\)/, /playerLanes\(lanes, padGame, game, frameTime\.real\(\), \{ walking, menu, runAndTalk: startMenu\.runAndTalk\(\) \}\);/]) expect(owned).toBeLessThan(at(later));
  });
  it('the switch: /testroom and the front end both mount WEAPON EXCHANGE (flipped at wave 4: FRONT_END_CAPABILITIES.exchange true, matchMount.ts mounts the part)', () => {
    expect(TESTROOM_CAPABILITIES.exchange).toBe(true);
    expect(FRONT_END_CAPABILITIES.exchange).toBe(true);                    // flipped at wave 4
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/const exchange = mountExchange\(\{/);
    // PAR-2: the seat ARMORY open holds them too (`./matchArmory`), as on /testroom.
    expect(mount).toMatch(/menuOpen: \(\) => \(o\.blocked\?\.\(\) \?\? false\) \|\| exchange\.isOpen\(\) \|\| taunts\.isOpen\(\) \|\| armory\.isOpen\(\) \|\| startMenu\.isOpen\(\),/);
    expect(mount).toMatch(/blocked: \(\) => \(o\.blocked\?\.\(\) \?\? false\) \|\| armory\.isOpen\(\) \|\| exchange\.isOpen\(\) \|\| taunts\.isOpen\(\), refreshFog:/);
  });
  it('answered is no NetPage dep: PART_DEPS has no exchange entry; its owed/refused pin is PART_HOOKS.exchange (flipped at wave 4)', () => {
    expect(Object.keys(PART_DEPS)).not.toContain('exchange');
    expect(Object.values(PART_DEPS).flat()).not.toContain('answered');
    expect(src('matchNet.ts')).toMatch(/exchange: \['answered'\],/);
    expect(Object.keys(mountExchange({ net: () => null, map: () => null, side: () => 'seal', loadouts: new PlayerLoadout(), walking: () => true, device: () => 'pad' }).netHooks())).toEqual(['answered']);
  });
});

describe('EXCHANGE-STICK: the left stick steps WEAPON EXCHANGE as the d-pad does (a browser adaptation, the owner\'s ruling 2026-11-12)', () => {
  /** A pad with only its left stick pushed (W3C signs: x right, y down). */
  const padAt = (x: number, y: number): GamepadLike => ({ axes: [x, y], buttons: [] });
  /** One pad frame as both pages run it: the stick read, then the buttons' edges and the menu's step. */
  const frame = (r: ReturnType<typeof rig>, x: number, y: number, ...held: PadButton[]): boolean => {
    r.ex.stick(padAt(x, y));
    return r.ex.pad(r.ex.edges(new Set(held)));
  };
  const state = (r: ReturnType<typeof rig>) => r.ex.menu.state();

  it('the dead zone and the push and rest thresholds are named *_ADAPTATION constants (the pad\'s 0.3, the menus\' 0.6 / 0.2)', () => {
    expect(EXCHANGE_STICK_DEAD_ZONE_ADAPTATION).toBe(0.3);
    expect(EXCHANGE_STICK_PUSH_ADAPTATION).toBeCloseTo(0.6, 6);
    expect(EXCHANGE_STICK_REST_ADAPTATION).toBeCloseTo(0.2, 6);
    expect(EXCHANGE_STICK_REST_ADAPTATION).toBeLessThan(EXCHANGE_STICK_PUSH_ADAPTATION);
  });

  it('stick down / up step the list\'s highlight as the d-pad\'s Down / Up; left / right and down in the picker as the d-pad\'s', () => {
    const dpad = rig(), stick = rig();
    dpad.tap('R2'); frame(stick, 0, 0, 'R2'); frame(stick, 0, 0);
    dpad.tap('Down');
    expect(frame(stick, 0, 1)).toBe(true); frame(stick, 0, 0);
    expect(state(stick).slot).toBe(state(dpad).slot);
    expect(state(stick).slot).not.toBe(0);
    dpad.tap('Up');
    frame(stick, 0, -1); frame(stick, 0, 0);
    expect(state(stick)).toEqual(state(dpad));
    dpad.tap('Cross'); frame(stick, 0, 0, 'Cross'); frame(stick, 0, 0);   // the picker on both
    for (const [b, x, y] of [['Down', 0, 1], ['Right', 1, 0], ['Left', -1, 0], ['Up', 0, -1]] as const) {
      dpad.tap(b);
      frame(stick, x, y); frame(stick, 0, 0);
      expect(state(stick), b).toEqual(state(dpad));
    }
    expect(state(stick).screen).toBe('picker');
  });

  it('a held stick is one step until it comes back near the centre; between the rest and the push it stays spent', () => {
    const r = rig();
    frame(r, 0, 0, 'R2'); frame(r, 0, 0);                                  // the page reads the stick every frame: at rest
    frame(r, 0, 1);
    const once = state(r).slot;
    expect(once).not.toBe(0);
    for (let i = 0; i < 30; i++) frame(r, 0, 1);                          // held: no repeat
    expect(state(r).slot).toBe(once);
    frame(r, 0, 0.5);                                                      // not yet at rest
    frame(r, 0, 1);
    expect(state(r).slot).toBe(once);
    frame(r, 0, 0.1);                                                      // at rest: re-armed
    frame(r, 0, 1);
    expect(state(r).slot).not.toBe(once);
  });

  it('a diagonal takes the dominant axis; an exact diagonal resolves one way (vertical), the same every time', () => {
    const r = rig(), d = rig();
    frame(r, 0, 0, 'R2'); frame(r, 0, 0); frame(r, 0, 0, 'Cross'); frame(r, 0, 0);
    d.tap('R2'); d.tap('Cross');                                           // the picker: all four directions mean something
    frame(r, 0.95, 0.7); frame(r, 0, 0);                                  // mostly right
    d.tap('Right');
    expect(state(r)).toEqual(state(d));
    frame(r, -0.7, 0.95); frame(r, 0, 0);                                 // mostly down
    d.tap('Down');
    expect(state(r)).toEqual(state(d));
    frame(r, 0.8, 0.8); frame(r, 0, 0);                                   // exact: down
    d.tap('Down');
    expect(state(r)).toEqual(state(d));
    frame(r, -0.8, -0.8); frame(r, 0, 0);                                 // exact: up
    d.tap('Up');
    expect(state(r)).toEqual(state(d));
  });

  it('closed, the stick does nothing new: no step, no opening, the pad not held (the game\'s lanes keep it)', () => {
    const r = rig();
    const before = state(r);
    for (const [x, y] of [[0, 1], [0, 0], [0, -1], [1, 0], [0, 0]] as const) expect(frame(r, x, y)).toBe(false);
    expect(r.ex.isOpen()).toBe(false);
    expect(state(r)).toEqual(before);
    const walk = { ...noInput(), moveX: 0.5, moveY: -1 };
    expect(r.ex.input.frame(walk, false)).toMatchObject({ moveX: 0.5, moveY: -1 });
  });

  it('alive (R2 is the in-match quick select there): the stick neither opens nor steps WEAPON EXCHANGE, nor holds the pad', () => {
    const n = fakeNet({ ...DEAD, alive: true });
    const r = rig({ net: n.net });
    for (const [x, y] of [[0, 1], [0, 0], [-1, 0], [0, 0]] as const) expect(frame(r, x, y)).toBe(false);
    expect(frame(r, 0, 1, 'R2')).toBe(false);
    expect(r.ex.isOpen()).toBe(false);
  });

  it('open, the stick moves no camera: the page\'s input is the menu\'s (sticks zeroed), the follow\'s too', () => {
    const r = rig();
    r.tap('R2');
    expect(frame(r, 0, 1)).toBe(true);                                     // the menu holds the pad on a stick frame
    const pushed = { ...noInput(), moveX: 0.4, moveY: 1, lookX: 0.3, lookY: -0.2 };
    expect(r.ex.input.frame(pushed, true)).toMatchObject({ moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
  });

  it('a stick held as the menu opens is no step until it rests; a press on the same frame as a flick is the press alone', () => {
    const r = rig();
    frame(r, 0, 1);                                                        // pushed while closed
    frame(r, 0, 1, 'R2');                                                  // opens under the held stick
    frame(r, 0, 1);
    expect(state(r)).toMatchObject({ screen: 'list', slot: 0 });
    frame(r, 0, 0);
    frame(r, 0, 1, 'Cross');                                               // the press, not the flick
    frame(r, 0, 0);
    const d = rig(); d.tap('R2'); d.tap('Cross');
    expect(state(r)).toEqual(state(d));
  });

  it('the d-pad is unchanged: the same taps give the same menu with the stick read at rest every frame', () => {
    const plain = rig(), withStick = rig();
    const seq: PadButton[] = ['R2', 'Down', 'Down', 'Up', 'Cross', 'Right', 'Down', 'Left', 'Up', 'Triangle', 'Down', 'Cross', 'Down', 'Cross', 'Start'];
    for (const b of seq) {
      plain.tap(b);
      frame(withStick, 0, 0, b); frame(withStick, 0, 0);
      expect(state(withStick), b).toEqual(state(plain));
    }
    expect(withStick.n.sent).toEqual(plain.n.sent);
  });

  it('both pages read the stick every frame, through the loading hold too, before the menu\'s step', () => {
    for (const [f, name] of [['main.ts', 'exchangePart'], ['matchMount.ts', 'exchange']] as const) {
      const text = src(f);
      const hold = text.indexOf(`${name}.hold(new Set([...padButtonsDown(`), step = text.indexOf(`${name}.pad(edges)`);
      const reads = [...text.matchAll(new RegExp(`${name}\\.stick\\(`, 'g'))].map((m) => m.index!);
      expect(reads.length, f).toBe(2);
      expect(reads[0]! > hold && reads[0]! < text.indexOf(`${name}.edges(down)`), f).toBe(true);
      expect(reads[1]! > text.indexOf(`${name}.edges(down)`) && reads[1]! < step, f).toBe(true);
    }
  });

  it('following a teammate (SPECTATE_KIT_CHANGE_OWNER): the stick steps the menu there too', () => {
    const n = fakeNet({ ...DEAD, cameraOnSelf: false });
    const r = rig({ net: n.net });
    frame(r, 0, 0, 'R2'); frame(r, 0, 0);
    expect(r.ex.isOpen()).toBe(SPECTATE_KIT_CHANGE_OWNER);
    frame(r, 0, 1);
    expect(state(r).slot !== 0).toBe(SPECTATE_KIT_CHANGE_OWNER);
  });

  it('the respawn closes it cleanly under a held stick: no step on the first frame alive, none after the next reopen until it rests', () => {
    const n = fakeNet({ ...DEAD, cameraOnSelf: false });
    const r = rig({ net: n.net });
    frame(r, 0, 0, 'R2'); frame(r, 0, 0);
    frame(r, 0, 1);                                                        // a step, the stick still held
    expect(state(r).slot).not.toBe(0);
    n.set({ ...DEAD, alive: true }, null);
    r.ex.reset();                                                          // the respawn
    const closed = state(r);
    expect(frame(r, 0, 1)).toBe(false);                                    // the first frame alive
    expect(r.ex.isOpen()).toBe(false);
    expect(state(r)).toEqual(closed);
    n.set(DEAD);                                                           // dead again, the stick never let go
    frame(r, 0, 1, 'R2');
    for (let i = 0; i < 5; i++) frame(r, 0, 1);
    expect(state(r)).toMatchObject({ screen: 'list', slot: 0 });
    frame(r, 0, 0); frame(r, 0, 1);
    expect(state(r).slot).not.toBe(0);
  });
});
