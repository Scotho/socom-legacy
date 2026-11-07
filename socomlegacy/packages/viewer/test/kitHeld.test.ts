// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, type KitTable, type Loadout, type MapArsenal, type Pick } from '@s2u/scene';
import { pinnedMatchSocket } from '../src/connectHost';
import type { PadButton } from '../src/gamepad';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { Hud } from '../src/hud';
import { LobbyMatch } from '../src/lobbyMatch';
import { PlayerLoadout } from '../src/loadout';
import { FRONT_END_CAPABILITIES } from '../src/matchCore';
import { mountExchange } from '../src/matchExchange';
import { matchNetDeps, type MatchNetParts } from '../src/matchNet';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * KIT-HELD (the player report "the loadout resets to the default M4 after death"): the front end's match page starts
 * with an empty kit store (`PlayerLoadout`) after the lobby's hand-off -- the lobby ARMORY's choice went over the lobby's
 * socket, the stored record is applied by the server -- so WEAPON EXCHANGE opened on the type's own kit (SEAL 1: the
 * M4A1, 54, no suppressor) and a confirm sent a one-pick list the room replayed from that kit: every lobby pick lost at
 * the next spawn. The room's `kitHeld` (its own unicast, never an unsolicited `loadout` answer: `NetPage`'s requests are
 * paired with answers in order) gives the page the type, the picks and the kit the room holds (`PlayerLoadout.held`), so
 * the menu opens on the held kit and a confirm extends the held list -- as the original's menu reads the type's kit
 * (`FUN_0023e5e0` D:L88379 writes the confirm to it; research 94 §A6, R94.3). `matchExchange.test.ts`'s rig, trimmed.
 */

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
/** SEAL 1's own kit: the M4A1 (54), no suppressor -- what the report's players were sent back to. */
const SEAL_KIT = kit(54, 15, 121, 151, 194);
const TABLE: KitTable = { arsenal, records: new Map(), rounds: new Map() };
const MAP_ARSENAL: MapArsenal = {
  valves, selectable: { seal: [], terrorist: [] },
  kits: {
    seal: [{ type: 'Seal1', character: 'mp2_seal1', loadout: SEAL_KIT }, { type: 'Seal2', character: 'mp2_seal2', loadout: kit(62, 15, 122, 126, 194) }],
    terrorist: [{ type: 'Terrorist1', character: 'mp2_terror1', loadout: kit(57, 5, 121, 126, 255) }],
  },
};
const MAP = { arsenal: { table: TABLE, map: MAP_ARSENAL } } as never;

/** The lobby's pick: the M4A1 SD (62) for SEAL 1's primary, the kit it replays to. */
const HELD_PICKS: Pick[] = [{ slot: 0, id: 62 }];
const HELD_KIT = [62, 15, 121, 151, 194];
const kitHeld = { type: 'kitHeld', team: 'seal', char: 0, picks: HELD_PICKS, kit: HELD_KIT } as unknown as ServerEvent;

describe('PlayerLoadout.held: the room\'s held type, picks and kit for a side', () => {
  it('sets the side\'s type, list, accepted list and next kit; the other side untouched', () => {
    const l = new PlayerLoadout();
    l.setMap(TABLE, MAP_ARSENAL);
    expect(l.held('seal', 0, HELD_PICKS, HELD_KIT)).toBe(true);
    expect(l.picks('seal')).toEqual(HELD_PICKS);
    expect(l.pending('seal')).toEqual(HELD_KIT);
    expect(l.type('seal')).toBe(0);
    expect(l.picks('terrorist')).toEqual([]);
    expect(l.pending('terrorist')).toBeNull();
    // A refusal of the next confirm returns to the held list (the room's), never to the type's own kit.
    l.confirm('seal', { slot: 2, id: 122 });
    l.refusedList('seal');
    expect(l.picks('seal')).toEqual(HELD_PICKS);
  });

  it.each([
    ['a type the side does not offer', 3, HELD_PICKS, HELD_KIT],
    ['a kit that is not five ids', 0, HELD_PICKS, [62, 15]],
    ['a pick that is not whole', 0, [{ slot: 0.5, id: 62 }], HELD_KIT],
    ['picks that are not a list', 0, { slot: 0, id: 62 }, HELD_KIT],
  ] as const)('ignores %s: nothing changed', (_what, char, picks, k) => {
    const l = new PlayerLoadout();
    l.setMap(TABLE, MAP_ARSENAL);
    expect(l.held('seal', char, picks as never, k as never)).toBe(false);
    expect(l.picks('seal')).toEqual([]);
    expect(l.pending('seal')).toBeNull();
  });
});

// ---- a real NetPage on the lobby's hand-off (matchExchange.test.ts's) ----
const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[] };
const welcomeOf = (char: number): ServerEvent => ({
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc',
  players: [{ id: 3, name: 'kilo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false, char,
}) as unknown as ServerEvent;

/** The lobby's socket, its welcome heard, handed off (`GameSocketHost.handOff`): the match's client and its `say`. */
function lobby(char = 0) {
  const welcome = welcomeOf(char);
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
  return { welcome, socks, say, h: hands[0]! };
}

/** The match page on the hand-off's client, adopting `events` (the welcome alone, unless the loader kept more). */
function page(char = 0, l = lobby(char), events: readonly ServerEvent[] = [l.welcome]) {
  const { socks, say, h } = l;
  // The match page's kit store, new at the mount: the map's tables in, nothing of the lobby's choice (matchMount.ts).
  const loadouts = new PlayerLoadout();
  loadouts.setMap(TABLE, MAP_ARSENAL);
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
    remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {}, whiteOut: () => {},
    voiceFloor: () => {}, voiceFrame: () => {},
    reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {}, roundAudio: { roundStart: () => {}, eliminated: () => {}, timeExpired: () => {}, roundOver: () => {}, reset: () => {}, frame: () => {} } as never, objective: () => null, escorteeVoice: () => {},
    taunt: () => {}, communication: () => {}, hostageState: () => {},
    drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {},
    armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {},
    game: { id: 7, ticket: 'tkt', pinned: PINNED, adopt: { client: h.client, events } },
  });
  net = new NetPage(deps, PINNED.url, 'MP2', 'socomc', undefined, false, 'classic');
  ex.frame();
  const step = (...held: PadButton[]): boolean => ex.pad(ex.edges(new Set(held)));
  const tap = (b: PadButton): void => { step(b); step(); };
  const requests = (): Pick[][] => socks[0]!.sent.filter((d) => typeof d === 'string' && d.includes('"loadout"')).map((d) => (JSON.parse(d) as { picks: Pick[] }).picks);
  const die = (): void => { say({ type: 'kill', killer: 3, victim: 2, weapon: 'AK-47', how: 'weapon', clip: null } as unknown as ServerEvent); };
  return { say, ex, net: net as NetPage, loadouts, step, tap, requests, die };
}

describe('KIT-HELD: the front end\'s WEAPON EXCHANGE opens on the kit the room holds, and extends its list', () => {
  it('after `kitHeld`, R2 opens on the held kit; a confirm of slot 2 sends [the held pick, the new pick]', () => {
    const p = page();
    p.say(kitHeld);
    p.die();
    p.tap('R2');
    expect(p.ex.isOpen()).toBe(true);
    expect(p.ex.state().loadout).toEqual(HELD_KIT);                       // not SEAL 1's M4A1 (54)
    p.tap('Down'); p.tap('Down');                                          // the list's slot 2 (equipment 1)
    expect(p.ex.state().slot).toBe(2);
    p.tap('Cross'); p.tap('Down');                                         // its picker, the next item
    const chosen = p.ex.state().item;
    expect(chosen).not.toBe(121);
    p.tap('Cross');
    expect(p.requests().at(-1)).toEqual([...HELD_PICKS, { slot: 2, id: chosen }]);
    p.net.close();
  });

  it('a `kitHeld` while a request is in flight is not taken: that request\'s answer settles what the room holds, paired as before', () => {
    const p = page();
    p.die();
    p.tap('R2'); p.tap('Cross'); p.tap('Down'); p.tap('Cross');           // the primary: the M4A1 SD, sent
    expect(p.requests().at(-1)).toEqual([{ slot: 0, id: 62 }]);
    p.say({ ...(kitHeld as object), picks: [{ slot: 2, id: 126 }], kit: [54, 15, 126, 151, 194] } as unknown as ServerEvent);
    expect(p.loadouts.picks('seal')).toEqual([{ slot: 0, id: 62 }]);     // the page's own list stands
    p.say({ type: 'loadout', kit: HELD_KIT, refused: null, char: 0 } as unknown as ServerEvent);
    expect(p.loadouts.pending('seal')).toEqual(HELD_KIT);                  // the answer paired with its own request
    expect(p.loadouts.picks('seal')).toEqual([{ slot: 0, id: 62 }]);
    p.net.close();
  });
});

describe('KIT-HELD F1: an adopted welcome\'s type is the room\'s -- the fresh page re-sends nothing and resets nothing', () => {
  // The match page's store is new at the hand-off (default types), so `seated` found the welcome's non-default type
  // "another" and the page staged its default back -- a `loadout {picks: [], char: 0}` the room took outside a round,
  // resetting the type and dropping the picks with no confirm; the `kitHeld` after it was then dropped as in flight.
  const SEAL2_PICKS: Pick[] = [{ slot: 2, id: 121 }];
  const SEAL2_KIT = [62, 15, 121, 126, 194];
  it('a handed-off welcome naming SEAL 2 sends no loadout; the page holds SEAL 2, and WEAPON EXCHANGE opens on the held kit', () => {
    const p = page(1);
    expect(p.requests()).toEqual([]);
    expect(p.loadouts.type('seal')).toBe(1);
    p.say({ type: 'kitHeld', team: 'seal', char: 1, picks: SEAL2_PICKS, kit: SEAL2_KIT } as unknown as ServerEvent);
    expect(p.loadouts.picks('seal')).toEqual(SEAL2_PICKS);
    p.die();
    p.tap('R2');
    expect(p.ex.state().loadout).toEqual(SEAL2_KIT);
    expect(p.requests()).toEqual([]);
    p.net.close();
  });
});

describe('LATER 726: a `kitHeld` heard while the match page loads is kept for its replay, and WEAPON EXCHANGE opens on it', () => {
  // The room tells a seat still loading at the launch hold's ceiling its held kit at the pass (`Room.barrierPassed`):
  // the event reaches the hand-off's client while `LobbyMatch` shows the loading screen, is kept after the welcome, and
  // the match page adopts both (`game.adopt`) -- its store then holds the room's picks, not SEAL 1's own kit.
  it('the loader keeps it, the adopted page takes it: R2 opens on the held kit, and a confirm extends the held list', async () => {
    const l = lobby();
    let t = 0;
    let loaded: () => void = () => {};
    const started: (readonly ServerEvent[])[] = [];
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => {}, hide: () => {} },
      load: () => new Promise<void>((res) => { loaded = res; }),
      start: (s) => { started.push(s.events); return { release: () => null, close: () => {} }; },
      back: () => {}, holds: () => {},
    });
    match.start(l.h);
    l.say(kitHeld);                                                       // the ceiling's tell, mid-load
    // Round 1, ROUND1-COUNT's 0.5 s after the pass: the host's barrier for the load (LOAD-HOLD).
    l.say({ type: 'roundStart', round: 1, seconds: 300, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 15 } as ServerEvent);
    loaded();
    await Promise.resolve(); await Promise.resolve();
    for (let i = 0; i < 20; i++) { t += 100; match.frame(); }
    expect(started).toHaveLength(1);
    expect(started[0]!.map((e) => e.type)).toEqual(['welcome', 'kitHeld', 'roundStart']);
    const p = page(0, l, started[0]!);
    expect(p.loadouts.picks('seal')).toEqual(HELD_PICKS);
    p.die();
    p.tap('R2');
    expect(p.ex.isOpen()).toBe(true);
    expect(p.ex.state().loadout).toEqual(HELD_KIT);                       // not SEAL 1's M4A1 (54)
    expect(p.requests()).toEqual([]);
    p.tap('Down'); p.tap('Down'); p.tap('Cross'); p.tap('Down');
    const chosen = p.ex.state().item;
    p.tap('Cross');
    expect(p.requests().at(-1)).toEqual([...HELD_PICKS, { slot: 2, id: chosen }]);
    p.net.close();
  });
});
