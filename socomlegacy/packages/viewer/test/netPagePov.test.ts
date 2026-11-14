// @vitest-environment jsdom
// test/netPagePov.test.ts -- PV-6b (the player's-view lane; product track, a labelled browser adaptation with no original:
// `../src/spectatorView` POV_VIEW_ADAPTATION, research 402, plan PV.R5, PV.R6): the page's half of the player's view --
// `NetPage`'s spectator host given the rig's draw (`spectatePov`) and its warm call (`spectatePovWarm`), Cross's hold voided
// while the scoreboard is up, the view not offered where the page's client does not carry it (`spectatePovCarried`: a
// replay older than protocol 16, `ReplayClient.viewCarried`), and both pages handing the rig their client (`povNet`).
// The page harness is `replaySpectate.test.ts`'s (`replayPage`, `baseDeps`, `remoteOf`: a watcher's NetPage on a
// ReplayClient), copied and cut to what these cases read. Unit and DOM tests; nothing here claims a value of the original.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { ReplayPlayer, ReplayRecord } from '../../match/src/replay/format';
import { noInput, type Input } from '../src/gamepad';
import { Hud, spectatorHudView } from '../src/hud';
import { TESTROOM_CAPABILITIES } from '../src/matchCore';
import { matchNetDeps, type MatchNetParts, type PovNet } from '../src/matchNet';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { SpectatorHost, SpectatorKey, SpectatorPose } from '../src/spectatorView';
import type { WalkMode } from '../src/walk';
import { body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

const PLAYERS: ReplayPlayer[] = [
  { id: 3, name: 'Alpha', team: 'seal', role: 'player', char: 0 },
  { id: 5, name: 'Bravo', team: 'terrorist', role: 'player', char: 0 },
];

/** Two players from tick 0, a snapshot every 2 ticks to 400, recorded at `protocol` (16 carries the view, 15 does not). */
function segment(protocol: number): LoadedSegment {
  const h = header({ protocol });
  const records: ReplayRecord[] = [{ kind: 'header', header: h }];
  for (let tick = 0; tick <= 400; tick++) {
    if (tick === 0) records.push({ kind: 'players', tick, players: PLAYERS });
    if (tick % 2 === 0) records.push({ kind: 'snap', tick, bodies: PLAYERS.map((p) => ({ ...body(p.id, p.id * 10), feet: [p.id * 10, 0, -50] as [number, number, number] })) });
  }
  records.push({ kind: 'end', tick: 400, reason: 'closed' });
  return { header: h, records, truncated: false };
}

function remoteOf(): RemotePlayers {
  return {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined,
    setOpacity: () => undefined,
  } as unknown as RemotePlayers;
}

function baseDeps(over: Partial<NetPageDeps>): NetPageDeps {
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
  } as unknown as WalkMode;
  return {
    walk, remote: remoteOf(), hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    ...over,
  };
}

type Call = [string, ...unknown[]];

/** The pov deps, recorded: `drawn` what `spectatePov` answers. */
function povDeps(calls: Call[], drawn: () => boolean = () => true): Partial<NetPageDeps> {
  return {
    spectatePov: (b, dt, watched) => { calls.push(['pov', b.id, dt, watched]); return drawn(); },
    spectatePovWarm: (b, dt, watched) => { calls.push(['warm', b.id, dt, watched]); },
  };
}

/**
 * A watcher's NetPage on a ReplayClient at `protocol` (`replaySpectate.test.ts`'s `replayPage`), its deps `deps(replay)`
 * over the base's. `step` is one page frame then one pad sample, the page's order (`main.ts` `net.frame` before
 * `net.spectatorPad`); `hold` Cross for `seconds` in steps of `dt` and released, as `spectatorPov.test.ts`'s rig.
 */
async function replayPage(o: { protocol?: number; deps?: (replay: ReplayClient, calls: Call[]) => Partial<NetPageDeps> } = {}) {
  let now = 0;
  const replay = new ReplayClient(Promise.resolve(segment(o.protocol ?? 16)), { name: 'Watcher', map: 'MP2', now: () => now });
  const calls: Call[] = [];
  const deps = baseDeps({
    spectate: (p: SpectatorPose | null) => { calls.push(['spectate', p === null ? null : 'pose']); },
    client: () => asNetClient(replay),
    ...(o.deps?.(replay, calls) ?? {}),
  });
  const net = new NetPage(deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
  await replay.ready;
  const camera = new PerspectiveCamera();
  camera.far = 1000;
  camera.updateMatrixWorld();
  const frame = (dt: number): void => { now += dt * 1000; replay.advance(); net.frame(dt, camera, false); };
  const pad = (held: Partial<Input> = {}): void => { net.spectatorPad({ ...noInput(), ...held }); };
  const step = (held: Partial<Input> = {}, dt = 0.1): void => { frame(dt); pad(held); };
  const hold = (seconds: number, dt = 0.1, extra: Partial<Input> = {}): void => {
    step({ action: true, ...extra }, dt);                          // the press's sample
    let t = 0;
    while (t + 1e-9 < seconds) { const d = Math.min(dt, seconds - t); step({ action: true, ...extra }, d); t += d; }
    step({}, dt);
  };
  const tap = (flag: keyof Input): void => { pad({ [flag]: true }); pad(); };
  /** The HUD's view of the page, as both pages ask it each frame (a spectator's fly camera). */
  const hudView = () => spectatorHudView(net, { mode: () => 'fly', isDead: () => false });
  const host = (): SpectatorHost => (net.spectator as unknown as { host: SpectatorHost }).host;
  pad();
  step();
  tap('leanRight');                                                // Right: follow 3, as `replaySpectate.test.ts` does
  step();
  expect([net.spectator.mode, net.spectator.target]).toEqual(['follow', 3]);
  return { replay, net, calls, frame, pad, step, hold, hudView, host };
}

const keyUp = (code: string): SpectatorKey & { prevented: boolean } => {
  const e = { type: 'keyup', code, repeat: false, prevented: false, preventDefault() { e.prevented = true; } };
  return e;
};

describe('PV-6b, the first acceptance line (PV-6h\'s review F3): the mode\'s mark only where a view can be drawn', () => {
  it('a page whose deps give `spectatePov`: a held X on a followed body reaches a frame the view IS drawn -- the HUD\'s \'shown\'', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    expect(r.hudView()?.pov).toBe('offered');
    r.hold(0.5);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toContainEqual(['pov', 3, 0.05, false]);
    expect([r.net.spectator.pov, r.net.spectator.povShown, r.hudView()?.pov]).toEqual([true, true, 'shown']);
    r.net.close();
  });

  it('a page whose deps give none: the sub-mode cannot be entered (no \'waiting\' forever), the hold\'s release is today\'s, no line', async () => {
    const r = await replayPage();
    expect(r.hudView()?.pov).toBeUndefined();
    r.hold(0.5);
    expect([r.net.spectator.mode, r.net.spectator.pov, r.hudView()?.pov]).toEqual(['free', undefined, undefined]);
    r.hold(0.1);                                                   // back to follow, as today
    r.net.spectator.setPov(true);
    expect(r.net.spectator.key(keyUp('KeyU'))).toBe(false);
    r.step({}, 0.05);
    expect([r.net.spectator.mode, r.net.spectator.pov, r.net.spectator.povShown, r.hudView()?.pov]).toEqual(['follow', undefined, false, undefined]);
    r.net.close();
  });
});

describe('PV-6b item 1-2: the constructor\'s host members', () => {
  it('`pov` and `povWarm` passed only when their deps exist, each reaching its dep', async () => {
    const none = await replayPage();
    expect([none.host().pov, none.host().povWarm]).toEqual([undefined, undefined]);
    none.net.close();
    const both = await replayPage({ deps: (_, calls) => povDeps(calls) });
    expect([typeof both.host().pov, typeof both.host().povWarm]).toEqual(['function', 'function']);
    both.net.close();
    const warmOnly = await replayPage({ deps: (_, calls) => ({ spectatePovWarm: povDeps(calls).spectatePovWarm! }) });
    expect([warmOnly.host().pov, typeof warmOnly.host().povWarm]).toEqual([undefined, 'function']);
    warmOnly.net.close();
  });

  it('the warm call on a follow frame, after today\'s follow (here the non-rendering host\'s `spectate`), none on a drawn frame', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['spectate', 'pose'], ['warm', 3, 0.05, false]]);
    r.hold(0.5);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 3, 0.05, false]]);
    r.net.close();
  });
});

describe('PV-6b item 3: the hold voided while the scoreboard is up (the pad\'s SELECT, `Input.scoreboard`)', () => {
  it('control: without the scoreboard the same hold switches, and its release is swallowed', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    r.hold(0.6);
    expect([r.net.spectator.mode, r.net.spectator.pov]).toEqual(['follow', true]);
    r.net.close();
  });

  it('a hold begun under the scoreboard switches nothing; its release is today\'s (to free)', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    r.hold(0.6, 0.1, { scoreboard: true });
    expect([r.net.spectator.mode, r.net.spectator.pov]).toEqual(['free', false]);
    r.net.close();
  });

  it('a hold begun under the scoreboard and held on after it is let go still switches nothing', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    r.step({ action: true, scoreboard: true }, 0.1);
    r.step({ action: true, scoreboard: true }, 0.1);
    for (let i = 0; i < 6; i++) r.step({ action: true }, 0.1);
    expect(r.net.spectator.pov).toBe(false);
    r.step({}, 0.1);
    expect([r.net.spectator.mode, r.net.spectator.pov]).toEqual(['free', false]);
    r.net.close();
  });

  it('a hold the scoreboard interrupts switches nothing -- also when the scoreboard comes up on the very sample past the threshold', async () => {
    // Control: the press's sample, three 0.1 s samples (0.3 s counted), and the fourth sample -- 0.4 s counted -- switches.
    const c = await replayPage({ deps: (_, calls) => povDeps(calls) });
    for (let i = 0; i < 4; i++) c.step({ action: true }, 0.1);
    expect(c.net.spectator.pov).toBe(false);
    c.step({ action: true }, 0.1);
    expect(c.net.spectator.pov).toBe(true);
    c.net.close();
    for (const at of [2, 3]) {
      const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
      r.step({ action: true }, 0.1);                              // the press's sample
      for (let i = 0; i < at; i++) r.step({ action: true }, 0.1);   // 0.2 s counted; or 0.3 s, so the next sample is the switching one
      r.step({ action: true, scoreboard: true }, 0.1);
      for (let i = 0; i < 3; i++) r.step({ action: true }, 0.1);
      expect(r.net.spectator.pov, `scoreboard at ${at}`).toBe(false);
      r.step({}, 0.1);
      expect([r.net.spectator.mode, r.net.spectator.pov]).toEqual(['free', false]);
      r.net.close();
    }
  });

  it('a short press under the scoreboard does what it does today (to free, and back)', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    r.hold(0.1, 0.1, { scoreboard: true });
    expect(r.net.spectator.mode).toBe('free');
    r.hold(0.1, 0.1, { scoreboard: true });
    expect(r.net.spectator.mode).toBe('follow');
    r.net.close();
  });

  it('a hold that already switched keeps its swallowed release under the scoreboard', async () => {
    const r = await replayPage({ deps: (_, calls) => povDeps(calls) });
    r.step({ action: true }, 0.1);
    for (let i = 0; i < 5; i++) r.step({ action: true }, 0.1);
    expect(r.net.spectator.pov).toBe(true);
    r.step({ action: true, scoreboard: true }, 0.1);
    r.step({ scoreboard: true }, 0.1);
    expect([r.net.spectator.mode, r.net.spectator.pov]).toEqual(['follow', true]);
    r.net.close();
  });
});

describe('PV-6b item 5: a replay older than protocol 16 offers no view (`spectatePovCarried`, PV.R6)', () => {
  const carriedDeps = (replay: ReplayClient, calls: Call[]): Partial<NetPageDeps> => ({ ...povDeps(calls), spectatePovCarried: () => replay.viewCarried });

  it('at 15: the hold voided (its release today\'s), setPov(true) refused, the developers\' key nothing, no line, never drawn', async () => {
    const r = await replayPage({ protocol: 15, deps: carriedDeps });
    expect(r.replay.viewCarried).toBe(false);
    expect(r.hudView()?.pov).toBeUndefined();
    r.hold(0.5);
    expect([r.net.spectator.mode, r.net.spectator.pov]).toEqual(['free', undefined]);
    r.hold(0.1);
    expect(r.net.spectator.mode).toBe('follow');
    r.net.spectator.setPov(true);
    const k = keyUp('KeyU');
    expect(r.net.spectator.key(k)).toBe(false);
    expect(k.prevented).toBe(false);
    r.step({}, 0.05);
    expect([r.net.spectator.pov, r.net.spectator.povShown, r.hudView()?.pov]).toEqual([undefined, false, undefined]);
    expect(r.calls.filter((c) => c[0] === 'pov' || c[0] === 'warm')).toEqual([]);
    r.net.close();
  });

  it('at 16: offered, and a hold draws it', async () => {
    const r = await replayPage({ protocol: 16, deps: carriedDeps });
    expect(r.replay.viewCarried).toBe(true);
    expect(r.hudView()?.pov).toBe('offered');
    r.hold(0.5);
    r.step({}, 0.05);
    expect([r.net.spectator.mode, r.net.spectator.pov, r.hudView()?.pov]).toEqual(['follow', true, 'shown']);
    r.net.close();
  });
});

/** `matchNetPov.test.ts`'s page parts, cut to what `matchNetDeps` needs, with `povNet` given. */
function sharedDeps(povNet?: () => PovNet | null): NetPageDeps {
  const p = {
    caps: TESTROOM_CAPABILITIES,
    walk: { gridOfGround: () => null, mode: () => 'fly' } as unknown as NetPageDeps['walk'],
    remote: {} as NetPageDeps['remote'],
    hud: {} as NetPageDeps['hud'],
    fly: { setPose: () => {} },
    loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => {}, roomAnswer: () => {} },
    firearm: {
      records: () => [], roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {},
      fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
    },
    clips: () => null, map: () => null, side: () => 'seal', followTeam: () => {}, menuOpen: () => false,
    ...(povNet ? { povNet } : {}),
  } as unknown as MatchNetParts;
  const rest = {
    remoteGrenade: () => {}, ownProjectiles: () => true, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {},
    whiteOut: () => {}, sceneRound: () => {}, reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {},
    roundAudio: {} as never, objective: () => null, escorteeVoice: () => {}, taunt: () => {}, communication: () => {},
    voiceFloor: () => {}, voiceFrame: () => {}, drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {},
    hostageState: () => {}, armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {}, client: null,
  } as Partial<NetPageDeps>;
  return matchNetDeps(p, { answered: () => {} }, rest as never);
}

describe('PV-6b item 5: `matchNetDeps`\' `spectatePovCarried` reads the page\'s client (`povNet`)', () => {
  it('a replay at 15: false (and while it connects); at 16: true; a live client (no `viewCarried`), none yet, or no part: true', async () => {
    for (const [protocol, carried] of [[15, false], [16, true]] as const) {
      const c = new ReplayClient(Promise.resolve(segment(protocol)), { name: 'Watcher', map: 'MP2' });
      const d = sharedDeps(() => asNetClient(c));
      expect(d.spectatePovCarried?.(), 'connecting').toBe(false);
      await c.ready;
      expect(d.spectatePovCarried?.(), `protocol ${protocol}`).toBe(carried);
      c.close();
    }
    const live: PovNet = { setCommandClockBody: () => {}, commandClock: () => null, bodyAtCommand: () => null };
    expect(sharedDeps(() => live).spectatePovCarried?.()).toBe(true);
    expect(sharedDeps(() => null).spectatePovCarried?.()).toBe(true);
    expect(sharedDeps().spectatePovCarried?.()).toBe(true);
  });
});

describe('PV-6b item 6: both pages hand the rig their client (`povNet`) where they build `matchNetDeps`', () => {
  const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
  /** The first argument of the page's `matchNetDeps({` call: up to the first `}, {` (the hooks' argument). */
  const parts = (f: string): string => {
    const s = src(f), at = s.indexOf('const deps = matchNetDeps({');
    expect(at, f).toBeGreaterThan(-1);
    return s.slice(at, s.indexOf('}, {', at));
  };
  for (const f of ['main.ts', 'matchMount.ts']) {
    it(`${f}: \`povNet: () => net?.client ?? null\` in the parts`, () => {
      expect(parts(f)).toContain('povNet: () => net?.client ?? null,');
      expect(src(f).split('matchNetDeps({').length - 1, f).toBe(1);   // one site per page
    });
  }
});

describe('PV-7b review F4: the spectator host\'s povRelease is the page\'s spectatePovReset', () => {
  it('wired in the constructor: povRelease runs the deps\' reset; with none given, nothing', async () => {
    const r = await replayPage({ deps: (_, calls) => ({ ...povDeps(calls), spectatePovReset: () => { calls.push(['reset']); } }) });
    r.calls.length = 0;
    r.host().povRelease?.();
    expect(r.calls).toEqual([['reset']]);
    r.net.close();
    const q = await replayPage({ deps: (_, calls) => povDeps(calls) });
    q.calls.length = 0;
    expect(typeof q.host().povRelease).toBe('function');
    q.host().povRelease!();
    expect(q.calls).toEqual([]);
    q.net.close();
  });
});

describe('PV-10a (finding 6, the exit side): the drawn body let go before the frame\'s bodies, on the frame after the switch', () => {
  /** The pov deps plus `spectatePovIdle`, and the bodies' one read in the frame (`remote.frame`), each recorded in order. */
  const idleDeps = (calls: Call[], idle = true): Partial<NetPageDeps> => ({
    ...povDeps(calls),
    ...(idle ? { spectatePovIdle: () => { calls.push(['idle']); } } : {}),
    remote: { ...remoteOf(), frame: () => { calls.push(['bodies']); } } as unknown as RemotePlayers,
  });

  it('drawn, then the hold\'s switch in the pad: the next frame calls the idle dep once, BEFORE its bodies are read', async () => {
    const r = await replayPage({ deps: (_, calls) => idleDeps(calls) });
    r.hold(0.5);
    expect(r.net.spectator.pov).toBe(true);
    for (let i = 0; i < 3; i++) {                                   // the mode on and drawn: no idle call
      r.calls.length = 0;
      r.step({}, 0.05);
      expect(r.calls).toEqual([['bodies'], ['pov', 3, 0.05, false]]);
    }
    let guard = 0;
    while (r.net.spectator.pov === true && guard++ < 20) { r.calls.length = 0; r.step({ action: true }, 0.1); }
    expect(r.net.spectator.pov).toBe(false);
    expect(r.calls).toEqual([['bodies'], ['pov', 3, 0.1, false]]);   // that frame drew; its pad switched the view off
    r.calls.length = 0;
    r.frame(0.1);
    expect(r.calls[0]).toEqual(['idle']);
    expect(r.calls[1]).toEqual(['bodies']);
    expect(r.calls.filter((c) => c[0] === 'idle')).toHaveLength(1);
    expect(r.calls.filter((c) => c[0] === 'pov')).toEqual([]);      // the follow's frame, as today
    r.calls.length = 0;
    r.pad();
    r.step({}, 0.1);                                                 // the frames after: no idle call
    expect(r.calls.filter((c) => c[0] === 'idle')).toEqual([]);
    r.net.close();
  });

  it('never drawn (the view never chosen: a following watcher, and a living page alike): no idle call on any frame', async () => {
    const r = await replayPage({ deps: (_, calls) => idleDeps(calls) });
    for (let i = 0; i < 5; i++) r.step({}, 0.05);
    r.hold(0.1);                                                     // a short press: to free and back, as today
    r.hold(0.1);
    expect(r.calls.filter((c) => c[0] === 'idle')).toEqual([]);
    r.net.close();
  });

  it('a page with no idle dep (no rig): the frame as today', async () => {
    const r = await replayPage({ deps: (_, calls) => idleDeps(calls, false) });
    r.hold(0.5);
    let guard = 0;
    while (r.net.spectator.pov === true && guard++ < 20) r.step({ action: true }, 0.1);
    r.calls.length = 0;
    r.frame(0.1);
    expect(r.calls[0]).toEqual(['bodies']);
    r.net.close();
  });
});
