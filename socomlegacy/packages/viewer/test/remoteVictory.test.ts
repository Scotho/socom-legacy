// test/remoteVictory.test.ts -- LATER 31 (research 249 §1, "The page's limit (owed)"): the others' victory dances on
// their bodies' own `Play` (`./remotePlayers` `victory`), across a replay's re-told welcome. A live page refuses a dance
// whose serial it has seen or while one plays (`Play.startVictory`); a replay's seek re-tells the room's state, so the
// page's record of what it saw is reset there (`RemotePlayers.resetVictories`, called by `./netPage` in the replay mode
// only) and the fold's dance (RE-1: the last start since its stop, at its `elapsed` at the target) is drawn.
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import type { PlayClips } from '../src/play';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {}, setGearVisible: () => {} }) }));
// The real `Play`'s dance bookkeeping (`startVictory`, `stopVictory`, `resetVictory`, `victoryState`); only its body,
// its weapons and its per-frame pose are stand-ins (no body on disc here).
vi.mock('../src/play', async (actual) => {
  const m = await actual<typeof import('../src/play')>();
  class Play extends m.Play {
    override setBody(): void {}
    override setWeapon(): void {}
    override setSidearm(): void {}
    override setItem(): void {}
    override setMounts(): void {}
    override frame(): void {}
  }
  return { ...m, Play };
});

const DANCE = 'victory_funky';
const ENTRY = { playback: 2.5, looped: false, maxVelocity: -.1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [] };
const state = (): BodyState => ({
  id: 2, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

function rig() {
  const remote = new RemotePlayers(new Scene());
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
  remote.setClips({ clips: [{ name: DANCE, frameCount: 85, parts: [] }], table: [[DANCE, ENTRY]] } as unknown as PlayClips);
  const camera = new PerspectiveCamera();
  const frame = (): void => { remote.frame(0, [state()], camera); };
  const playing = () => remote.victoryStates()[0]?.clip ?? null;
  const elapsed = () => (remote as unknown as { remotes: Map<number, { play: { victoryState(): { elapsed: number } | null } }> })
    .remotes.get(2)?.play.victoryState()?.elapsed ?? null;
  frame();
  return { remote, frame, playing, elapsed };
}

describe('LATER 31: the others\' dances across a replay\'s re-told welcome (RemotePlayers.resetVictories)', () => {
  it('live (no reset): a repeated or lower serial is refused, and one told while a dance plays leaves it at its age', () => {
    const r = rig();
    r.remote.victory(2, 3, DANCE, 0.5);
    expect(r.elapsed()).toBe(0.5);
    r.remote.victory(2, 3, DANCE, 1.5);                   // the same serial told again: refused, the clip at its own age
    expect(r.elapsed()).toBe(0.5);
    r.remote.victory(2, 3, null);                         // stopped
    expect(r.playing()).toBeNull();
    r.remote.victory(2, 3, DANCE, 0);                     // the same serial again: refused
    r.remote.victory(2, 2, DANCE, 0);                     // a lower one: refused
    expect(r.playing()).toBeNull();
  });

  it('after the reset, a dance with the same or a lower serial than the one seen is drawn', () => {
    const r = rig();
    r.remote.victory(2, 3, DANCE, 0);
    r.remote.victory(2, 3, null);
    r.remote.resetVictories();
    r.remote.victory(2, 3, DANCE, 0.25);                  // a seek back into the same dance
    expect(r.playing()).toBe(DANCE);
    expect(r.elapsed()).toBe(0.25);
    r.remote.victory(2, 3, null);
    r.remote.resetVictories();
    r.remote.victory(2, 1, DANCE, 0);                     // a seek back into an earlier one
    expect(r.playing()).toBe(DANCE);
  });

  it('the reset stops a dance playing, so the re-told one starts at the target\'s age, not play\'s', () => {
    const r = rig();
    r.remote.victory(2, 3, DANCE, 0.5);
    r.remote.resetVictories();
    expect(r.playing()).toBeNull();
    r.remote.victory(2, 3, DANCE, 1.75);                  // the fold's `elapsed` at the target (RE-1)
    expect(r.elapsed()).toBe(1.75);
  });

  it('the reset drops a dance held for a body not yet drawn: only the re-told one is drawn', () => {
    const r = rig();
    r.remote.victory(7, 4, DANCE, 0);                     // body 7 never drawn: held
    r.remote.resetVictories();
    r.remote.frame(0, [{ ...state(), id: 7 }], new PerspectiveCamera());
    expect(r.remote.victoryStates().find((v) => v.id === 7)?.clip).toBeNull();
  });
});
