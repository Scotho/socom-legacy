import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { JOIN_STATE_VERSION, type DropWire, type JoinWire, type ServerEvent } from '../src/net/protocol';
import { WorldDrops } from '../src/drops';
import type { RemotePlayers } from '../src/remotePlayers';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';
import type { WalkMode } from '../src/walk';

/**
 * PF-28 (ruling PF.R47; research 231 s4.3, 198 s4.4): the page's half of the join envelope, wired in wave 4 -- the
 * welcome's `join` laid through `./joinState`'s `applyJoinState` into the page's deps (`remoteGrenade` with the `pid` and
 * its phase, `remote.hydrateCorpse`, `remote.markGhost`, the round screens' clock), once and silently: no kill line, no
 * round audio. A welcome without `join` (a room before PF-28) changes nothing. `netPageRound.test.ts`'s fake socket,
 * copied (not imported).
 */

const TICK_HZ = 60;

function page(over: Partial<NetPageDeps> = {}) {
  let socket: WebSocketLike | null = null;
  const hud = new Hud();
  const posted: string[] = [];
  hud.postMessage = ((text: string | readonly string[]) => { posted.push(Array.isArray(text) ? text.join('/') : String(text)); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const calls: unknown[][] = [];
  const remote = {
    setTeam: () => undefined, forget: () => undefined, died: (...a: unknown[]) => { calls.push(['died', ...a]); }, clear: () => undefined, frame: () => undefined,
    hydrateCorpse: (...a: unknown[]) => { calls.push(['corpse', ...a]); },
    markGhost: (...a: unknown[]) => { calls.push(['ghost', ...a]); },
    setRules: (...a: unknown[]) => { calls.push(['rules', ...a]); },
  } as unknown as RemotePlayers;
  const audio: string[] = [];
  const roundAudio = Object.fromEntries((['roundStart', 'eliminated', 'timeExpired', 'roundOver', 'reset', 'frame'] as const)
    .map((k) => [k, () => { if (k !== 'frame') audio.push(k); }])) as unknown as NonNullable<NetPageDeps['roundAudio']>;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, spectate: () => undefined, roundAudio,
    remoteGrenade: (...a: unknown[]) => { calls.push(['projectile', ...a]); },
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
    ...over,
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const screens = (): { start: number; list: unknown; winner: unknown } | null => (net as unknown as { screens: { start: number; list: unknown; winner: unknown } | null }).screens;
  return { net, server, calls, posted, audio, screens };
}

const welcome = (join?: JoinWire): ServerEvent => ({
  type: 'welcome', id: 1, version: 11, map: 'MP2', tick: 1000, role: 'spectator', team: null, queue: 0, name: 'Tester',
  players: [{ id: 2, name: 'Kilo', team: 'terrorist' }, { id: 3, name: 'Lima', team: 'seal' }, { id: 4, name: 'Mike', team: 'seal' }],
  rules: 'classic', round: 2, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  ...(join ? { join } : {}),
} as ServerEvent);

const JOIN: JoinWire = {
  v: JOIN_STATE_VERSION,
  result: { round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [{ screen: 'roundComplete', seconds: 8 }], at: 880 },
  projectiles: [
    { pid: 5, owner: 2, kind: 'M67', pos: [1, 2, 3], vel: [0, -60, 0], state: 'flight', age: 30, fuse: 150, removal: 300, bounces: 1, dud: false },
    { pid: 5, owner: 2, kind: 'M67', pos: [1, 2, 3], vel: [0, -60, 0], state: 'flight', age: 30, fuse: 150, removal: 300, bounces: 1, dud: false },
  ],
  corpses: [{ id: 3, clip: 'seal_death_back', age: 120 }],
  ghosts: [4],
};

afterEach(() => { vi.restoreAllMocks(); });

describe('PF-28: the welcome\'s join envelope on the page (wave 4; research 231 s4.3)', () => {
  it('hands authoritative equipment metadata to the shared loadout before seating and carries staging/legacy updates', () => {
    const calls: (string | number)[] = [];
    const p = page({ equipmentLimit: (limit) => { calls.push(limit); }, seated: () => { calls.push('seated'); } });
    p.server({ ...welcome(), eqLimit: 2 } as ServerEvent);
    expect(calls).toEqual([2, 'seated']);
    p.server({ type: 'gameLobby', seats: [], countdown: null, launched: false, eqLimit: 1 });
    expect(calls.at(-1)).toBe(1);
    p.server(welcome());
    expect(calls.slice(-2)).toEqual([0, 'seated']);
  });

  it('a welcome carrying join hydrates the screens, the projectiles and the corpses through the deps once, posts no kill line and plays no round audio; a welcome without join changes nothing (an older room)', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => 50_000);
    const p = page();
    p.server(welcome(JOIN));
    // The projectile once by its pid (the envelope's duplicate dropped), its phase in seconds on the room's clock.
    expect(p.calls.filter((c) => c[0] === 'projectile')).toEqual([
      ['projectile', 'M67', [1, 2, 3], [0, -60, 0], 2, 5, { state: 'flight', age: 30 / TICK_HZ, fuse: 150 / TICK_HZ, removal: 300 / TICK_HZ, bounces: 1, dud: false }],
    ]);
    expect(p.calls.filter((c) => c[0] === 'corpse')).toEqual([['corpse', 3, 'seal_death_back', 120 / TICK_HZ]]);
    expect(p.calls.filter((c) => c[0] === 'ghost')).toEqual([['ghost', 4]]);
    expect(p.calls.filter((c) => c[0] === 'died')).toEqual([]);
    // The round screens' clock started (tick - at) / 60 s before the welcome: 2 s into ROUND COMPLETE.
    expect(p.screens()).toMatchObject({ start: 50_000 - ((1000 - 880) / TICK_HZ) * 1000, list: [{ screen: 'roundComplete', seconds: 8 }], winner: 'seal' });
    expect(p.posted.filter((l) => /KILLED|killed|VICTORIOUS/.test(l))).toEqual([]);
    expect(p.audio.filter((a) => a !== 'reset')).toEqual([]);

    const q = page();
    q.server(welcome());
    expect(q.calls.filter((c) => c[0] !== 'rules')).toEqual([]);   // NU-4: every welcome tells the bodies its rules
    expect(q.screens()).toBeNull();
    expect(q.audio.filter((a) => a !== 'reset')).toEqual([]);
  });
});

/**
 * The integration review of sprint 29, item 1: on a rejoin (an in-page reconnect, a takeover, a page shown again from its
 * cache) the room re-owns the seat's flying list to the new id before the welcome (`Room.seat`), so `join.projectiles`
 * names the page's OWN throws -- which the page still flies itself, with no pid to replace them by. The page skips its
 * own id's entries while it holds live projectiles of its own (`NetPageDeps.ownProjectiles`); a fresh page (none held)
 * hydrates them, and another's are hydrated whatever it holds. A real `GrenadeThrower` behind the deps, as `main.ts`'s.
 */
describe('PF-28 integration fix: a rejoin does not double the page\'s own projectiles', () => {
  const snap = { feet: [0, 50, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 } as unknown as PlaySnapshot;
  const rig = () => {
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => snap, view: () => 'third' });
    const blasts: string[] = [];
    g.on('explode', (e) => blasts.push(e.item));
    const p = page({
      remoteGrenade: (kind, from, velocity, owner, pid, phase) => g.launchRemote(kind, from, velocity, owner, pid === undefined ? undefined : { pid, ...phase }),
      ownProjectiles: () => g.ownLive(),
    });
    return { g, p, blasts };
  };
  const own = (pos: number[], vel: number[]): JoinWire => ({
    v: JOIN_STATE_VERSION, corpses: [], ghosts: [],
    projectiles: [
      { pid: 0, owner: 1, kind: 'M67', pos: pos as [number, number, number], vel: vel as [number, number, number], state: 'flight', age: 6, fuse: 174, removal: 180, bounces: 0, dud: false },
      { pid: 1, owner: 2, kind: 'M67', pos: [300, 500, 0], vel: [0, 0, 0], state: 'flight', age: 6, fuse: 174, removal: 180, bounces: 0, dud: false },
    ],
  });

  it('a rejoin carrying the page\'s own frag leaves one live of it and one blast; another\'s is hydrated; a fresh page hydrates its own', () => {
    const { g, p, blasts } = rig();
    p.server(welcome());
    g.select('M67');
    expect(g.throwNow(1)).not.toBeNull();                         // the page's own frag, in the air (no pid)
    g.update(0.1);
    const mine = g.stats().live[0]!;
    // The in-page reconnect's second welcome: the room names the own frag (owner 1) and another's (owner 2).
    p.server(welcome(own(mine.pos, mine.vel)));
    expect(g.stats().live.map((l) => l.pid)).toEqual([undefined, 1]);   // the own one once, the other's hydrated
    for (let i = 0; i < 4 * 60; i++) g.update(1 / 60);
    expect(blasts).toEqual(['M67', 'M67']);                       // one blast each, not three
    // A fresh page (nothing of its own in the air): the room's word is all it has -- its own frag is hydrated too.
    const fresh = rig();
    fresh.p.server(welcome(own([0, 500, 0], [0, 0, 0])));
    expect(fresh.g.stats().live.map((l) => l.pid)).toEqual([0, 1]);
  });
});

/**
 * PF-34 (research 234 s1, s6; the review's "stale drops on a rejoin"): the welcome's `join.drops` is the room's whole
 * set, and the page's `drops` sink hands it to `drops.replaceAll` -- a drop taken while the page was away is gone, an
 * envelope with none lying clears them. A real `WorldDrops` behind the dep, as `main.ts`'s will be.
 */
describe('PF-34: a rejoin\'s welcome replaces the page\'s drops (research 234 s6)', () => {
  it('a rejoin\'s welcome replaces the page\'s drops: one taken while it was away is removed (replaceAll), none lying clears them', () => {
    const drops = new WorldDrops({ model: () => null, remove: () => undefined });
    const p = page({ drops });
    const d = (did: number): DropWire => ({ did, kind: 'weapon', item: HELD_RIFLE.id, at: [did, 0, 0], yaw: 0, from: 2 });
    p.server(welcome());
    p.server({ type: 'drop', ...d(1) } as ServerEvent);
    p.server({ type: 'drop', ...d(2) } as ServerEvent);
    expect(drops.dids()).toEqual([1, 2]);
    // The page away; drop 2 taken meanwhile, a 3 laid: the rejoin's welcome names 1 and 3 (3 twice: laid once).
    p.server(welcome({ v: JOIN_STATE_VERSION, projectiles: [], corpses: [], ghosts: [], drops: [d(1), d(3), d(3)] }));
    expect(drops.dids()).toEqual([1, 3]);
    // Another rejoin with none lying: the page's set is cleared.
    p.server(welcome({ v: JOIN_STATE_VERSION, projectiles: [], corpses: [], ghosts: [], drops: [] }));
    expect(drops.dids()).toEqual([]);
  });
});

/**
 * HX-1's fix round (the review of 288f2752, finding 2; research 237 s4): a joiner's welcome names a dead hostage with
 * its death's clip and age (`HostageWire.deathClip`, `age`, as the join envelope's corpses), and the page lays it as it
 * lays a seat's corpse (`hydrateCorpse`), after naming the body an escortee -- never a standing hostage.
 */
describe('HX-1: a joiner sees a dead hostage as a corpse', () => {
  // NU-4 B4 (research 317 s1.7; `FUN_005714b0` writes no alpha, `DEAD_IN_FADE_READING`): a dead hostage keeps its clip at
  // any age. Was: "one dead past the fade lies with no clip" (`BODY_FADE_S`), the 12 s one laid with null.
  it("a welcome's dead hostage is laid as a corpse at its age (hydrateCorpse, CORPSE_HYDRATE_READING) after setEscortee; a living one is not; one dead 12 s keeps its clip (NU-4 B4)", () => {
    const order: string[] = [];
    const p = page();
    const calls = p.calls;
    const remote = (p.net as unknown as { deps: { remote: Record<string, unknown> } }).deps.remote;
    remote['setEscortee'] = (id: number, who: string) => { order.push(`escortee ${id}`); calls.push(['escortee', id, who]); };
    remote['setOpacity'] = (id: number, o: number, fading: boolean) => { calls.push(['opacity', id, o, fading]); };
    const hydrate = remote['hydrateCorpse'] as (...a: unknown[]) => void;
    remote['hydrateCorpse'] = (...a: unknown[]) => { order.push(`corpse ${String(a[0])}`); hydrate(...a); };
    const base = { yaw: 0, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 };
    const hostages = [
      { id: 240, name: 'Hostage', character: 'mp_fem1', at: [0, 0, 0], alive: true, ...base },
      { id: 241, name: 'Hostage2', character: 'mp_fem2', at: [0, 0, 0], alive: false, deathClip: 'teammate_die_back', age: 3 * TICK_HZ, ...base },
      { id: 242, name: 'Hostage3', character: 'mp_fem3', at: [0, 0, 0], alive: false, deathClip: 'teammate_die_fwd', age: 12 * TICK_HZ, ...base },
    ];
    p.server({ ...welcome(), hostages } as unknown as ServerEvent);
    expect(calls.filter((c) => c[0] === 'corpse')).toEqual([['corpse', 241, 'teammate_die_back', 3], ['corpse', 242, 'teammate_die_fwd', 12]]);
    expect(calls.filter((c) => c[0] === 'escortee').map((c) => c[1])).toEqual([240, 241, 242]);
    expect(order.indexOf('escortee 241')).toBeLessThan(order.indexOf('corpse 241'));
    expect(calls.filter((c) => c[0] === 'died')).toEqual([]);                   // no kill path: no line, no sound
    expect(p.posted.filter((t) => /fragged|kill/i.test(t))).toEqual([]);
  });
});

/**
 * NU-4 (research 317 s1.8, s5 B1): the page knows the room's rules from the welcome (`NetPage.rules`) and now tells its
 * others' bodies (`RemotePlayers.setRules`), whose corpse rule (`./net/deaths` `corpseShownS`) reads them; before, they
 * were not told. The rules reach the bodies before the join envelope lays its corpses.
 */
describe('NU-4: the welcome hands the room\'s rules to the others\' bodies', () => {
  it("the welcome's rules go to remote.setRules, before the envelope's corpses", () => {
    const p = page();
    p.server(welcome(JOIN));
    const told = p.calls.filter((c) => c[0] === 'rules' || c[0] === 'corpse').map((c) => c.slice(0, 2));
    expect(told).toEqual([['rules', 'classic'], ['corpse', 3]]);
    p.server({ ...welcome(), rules: 'respawn' } as ServerEvent);
    expect(p.calls.filter((c) => c[0] === 'rules').at(-1)).toEqual(['rules', 'respawn']);
  });
});
