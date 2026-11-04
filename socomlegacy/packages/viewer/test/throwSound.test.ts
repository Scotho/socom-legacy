import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { readKitTable, type ThrowableRecord } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GameplayAudioSource } from '../../../tools/gameplayAudioSource';
import { GameAudio, type AudioOut, type LoopHandle } from '../src/audio';
import type { GrenadeItem } from '../src/grenade';
import { PlayerLoadout } from '../src/loadout';
import { mountSound } from '../src/matchSound';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { soundFromDisc } from '../src/soundData';
import { THROW_CLIPS } from '../src/throwPose';

/**
 * PAR-77 (research 251 s12.7; the owner's playtest: "the sound for throwing a grenade worked sometimes but not other
 * times"): one throw sound per throw, for every throw kind, on the thrower's page and on another's.
 *
 * The original's throw has two sounds, each from its own trigger:
 * - **the release** -- `FUN_005c1970` lets the grenade go on the kit's timer (`+0x87c`, D:L476883-476902) and calls
 *   `FUN_005c5340` (D:L477133), which plays the record's zAnim picked by `FUN_003d22b0(record, 0 < body+0x200)`
 *   (D:L479429-479447): the `FireAnimName` (`frag_start` -> `.THROW_OBJECT`) in third person, its `<name>_zoom` (built by
 *   `FUN_003c4700` with `%s_zoom`, D:L316326-316332) past it -- which no throwable has on the disc, so the handle is 0
 *   (`FUN_003d21c0` D:L324701-324705) and nothing plays (D:L479452). A placing's release (`FUN_005bc730`,
 *   D:L474051-474060) picks the same way.
 * - **the grunt** -- the throw clip's `zanim_callback` (`motion.rdr`: `throw_whoosh` -> `.MALE_GRUNT`), fired as the
 *   clip's phase crosses it; only the standing throw and its pistol version carry one.
 *
 * The thrower's page runs the real `GrenadeThrower` and `ThrowPose` under `mountThrowables` with the disc's clips; the
 * page's audio is a stub that records each zAnim asked for, or (the disc's block) the real `GameAudio` on a recording
 * sink.
 */

const READERC = fixture('RUN/READERC.ZAR');
const MOTION = fixture('RUN/MOTION_P.ZAR');
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const haveClips = READERC !== null && MOTION !== null;
const disc = process.env.SOCOM_DISC;
const haveDisc = disc !== undefined && disc !== '' && existsSync(join(disc, 'RUN/SOUNDS/BNKSTORE.ZAR')) && existsSync(join(disc, 'RUN/MP7.ZDB'));

type V3 = [number, number, number];
interface Snap {
  feet: V3; yaw: number; pitch: number; vx: number; vz: number; vy: number; airborne: boolean; crouched: boolean;
  stance: 'stand' | 'crouch' | 'prone'; landing: null; jumps: number; peek?: -1 | 0 | 1; leanClip?: true;
}

/** A throw kind: the body as the release request reads it, how long the button was held, the clip it plays. */
interface Kind { name: string; snap: Partial<Snap>; hold: number; pistol?: boolean; clip: string; cutAt?: number }

/** `GetThrowAnim`'s rows (research 85 s3) and the pistol's version, each through the page's own path. */
const KINDS: Kind[] = [
  { name: 'a standing throw', snap: {}, hold: 1, clip: 'seal_throwgrenade' },
  { name: 'a standing toss', snap: {}, hold: 0.1, clip: 'seal_tossgrenade' },
  { name: 'a throw on the run', snap: { vz: -300 }, hold: 1, clip: 'seal_throwgrenade' },
  { name: 'a still crouched throw', snap: { stance: 'crouch', crouched: true }, hold: 1, clip: 'seal_crouch_throwgrenade' },
  { name: 'a moving crouched throw', snap: { stance: 'crouch', crouched: true, vx: 20 }, hold: 1, clip: 'seal_throwgrenade' },
  { name: 'a prone throw', snap: { stance: 'prone' }, hold: 1, clip: 'seal_prone_throwgrenade' },
  { name: 'a prone toss', snap: { stance: 'prone' }, hold: 0.1, clip: 'seal_prone_tossgrenade' },
  { name: 'a toss from the right peek', snap: { peek: 1, leanClip: true }, hold: 1, clip: 'seal_toss_rlean' },
  { name: 'a toss from the left peek', snap: { peek: -1, leanClip: true }, hold: 1, clip: 'seal_toss_llean' },
  { name: 'a standing throw, the pistol in the hand', snap: {}, hold: 1, pistol: true, clip: 'seal_p_throwgrenade' },
  { name: 'a standing toss, the pistol in the hand', snap: {}, hold: 0.1, pistol: true, clip: 'seal_p_tossgrenade' },
  // PAR-70/76: the stick cuts a throw at its 48th command (0.80 s), past the release (0.71 s) and the grunt (0.69 s).
  { name: 'a standing throw cut by the stick', snap: {}, hold: 1, clip: 'seal_throwgrenade', cutAt: 0.8 },
  // A knock pops the clip before its callback (`FUN_0028da00` D:L135092-135104): no grunt; the kit's timer still lets go.
  { name: 'a standing throw knocked off before its release', snap: {}, hold: 1, clip: 'seal_throwgrenade', cutAt: 0.3 },
];

/** The items the page throws, with the zAnim the release names. */
const THROWS: readonly GrenadeItem[] = ['M67', 'HE', 'AN-M8', 'Mark141'];

/** The disc's throw clips and their callbacks (`motion.rdr` in `READERC.ZAR`, the clips in `MOTION_P.ZAR`). */
function motionSource() {
  const table = motionTableFromArchive(READERC!)!;
  const clips = new Map(clipsFromPack(MOTION!, THROW_CLIPS).map((c) => [c.name, c]));
  return { clips, table };
}

/** An output that records what it was handed (the sink `GameAudio` plays to). */
class Recorder implements AudioOut {
  unlocked = true;
  played = 0;
  get state(): string { return 'running'; }
  unlock(): void {}
  setGain(): void {}
  play(): void { this.played++; }
  setReverb(): void {}
  rampReverb(): void {}
  loop(): LoopHandle | null { return null; }
}

interface Page { audio: Pick<GameAudio, 'onAnimCallback' | 'play' | 'onFire'>; asked: string[] }

/** A stub of the page's audio: each zAnim asked for, in order. */
function stubAudio(): Page {
  const asked: string[] = [];
  return { asked, audio: { onAnimCallback: (name: string) => { asked.push(name); return null; }, play: () => false, onFire: () => null } as never };
}

/**
 * The part on fakes (`./matchThrow.test.ts`'s rig) with the real thrower, the disc's throw clips under its pose, the
 * body `snap` and the view state `view` (`body+0x200`: 0 third person, 1 first person, 3 night vision).
 */
function page(audio: Pick<GameAudio, 'onAnimCallback' | 'play' | 'onFire'>, o: { snap?: Partial<Snap>; view?: number; pistol?: boolean; records?: ThrowableRecord[]; warning?: MatchThrowDeps['warning'] } = {}) {
  const snap: Snap = {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null,
    jumps: 0, ...o.snap,
  };
  const thrown: string[] = [];
  const net = { throwEvent: (kind: string) => { thrown.push(kind); }, client: { bodies: () => [] } };
  const firearm = {
    shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
    fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => o.view ?? 0 },
    kit: { swapping: () => false, item: () => (o.pistol ? 'pistol' : 'rifle'), state: () => ({ swap: null }) },
    effects: { play: () => false, run: () => null },
    setZoom: () => {}, showFireMode: () => {},
    item: () => (o.pistol ? 'pistol' : 'rifle'), record: () => ({ name: 'M4A1' }), records: () => [{}, {}], icon: () => 'm4.tif',
    selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
  };
  const src = haveClips ? motionSource() : null;
  const deps: MatchThrowDeps = {
    scene: new Scene(),
    walk: {
      grid: () => null, gridOfGround: () => null, snapshot: () => snap, view: () => 'third', fireAim: () => null, feet: () => snap.feet,
      drawnFeet: () => snap.feet, hold: () => {}, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true,
      onActionEnd: () => () => {}, onLauncherStickLower: () => () => {},   // PAR-83: the walk's stick lower, heard at the mount
    } as never,
    fly: { shakeScreen: () => {} },
    play: {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => src,
      setRifleStowed: () => {}, addPoseLayer: () => {},
    } as never,
    loadouts: new PlayerLoadout(),
    view: () => null, map: () => null,
    net: () => net as never,
    firearm: () => firearm as never,
    audio,
    ...(o.warning ? { warning: o.warning } : {}),
  };
  const t = mountThrowables(deps);
  if (o.records) t.grenade.setRecords(o.records);
  return { t, thrown, snap };
}

/** One throw of `item` as `kind`, from the release request to the clip's end, the page's frame at 60 Hz. */
function throwOnce(t: ReturnType<typeof page>['t'], item: GrenadeItem, kind: Pick<Kind, 'hold' | 'cutAt'>): void {
  expect(t.grenade.equip(true, item)).toBe(true);
  t.grenade.throwNow(kind.hold, false);                       // the hook's throw: the release request, the clip on its clock
  expect(t.grenade.phase()).toBe('throwing');
  for (let f = 1; f <= 150; f++) {
    t.poseFrame(1 / 60);                                       // the clip's callbacks (the page's `poseFrame`, after the gun's)
    t.frame(1 / 60);                                           // the release on its timer (the page's `frame`)
    if (kind.cutAt !== undefined && Math.abs(f / 60 - kind.cutAt) < 1e-9) t.throwPose.cut();
  }
}

/** The release's zAnims and the grunts among what the page asked for. */
const releases = (asked: string[], fireAnim: string) => asked.filter((n) => n === fireAnim || n === `${fireAnim}_zoom`);
const grunts = (asked: string[]) => asked.filter((n) => n === 'throw_whoosh');

describe.skipIf(!haveClips)(`PAR-77: the thrower's page asks one release and the clip's own grunt per throw, every kind${haveClips ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the disc: only the standing throw and its pistol version carry the grunt (throw_whoosh at 0.45); every clip lets go before the stick may cut it', () => {
    const { table } = motionSource();
    const withGrunt = KINDS.map((k) => k.clip).filter((c, i, a) => a.indexOf(c) === i)
      .filter((c) => table.get(c)!.callbacks.some((cb) => cb.name === 'throw_whoosh'));
    expect(withGrunt).toEqual(['seal_throwgrenade', 'seal_p_throwgrenade']);
    expect(table.get('seal_throwgrenade')!.callbacks).toEqual([{ name: 'throw_whoosh', time: 0.45 }]);
  });

  for (const kind of KINDS) {
    it(`${kind.name}: in third person one release (the FireAnimName) for each throwable, the grunt as its clip carries it`, () => {
      const { table } = motionSource();
      const grunt = table.get(kind.clip)!.callbacks.some((c) => c.name === 'throw_whoosh') && !(kind.cutAt !== undefined && kind.cutAt < 0.69);
      for (const item of THROWS) {
        const s = stubAudio();
        const { t, thrown } = page(s.audio, { snap: kind.snap, pistol: kind.pistol });
        throwOnce(t, item, kind);
        expect(t.throwPose.stats().clip === null || t.throwPose.stats().clip === kind.clip).toBe(true);
        expect(t.grenade.stats().lastThrow?.clip, `${kind.name} ${item}`).toBe(kind.clip);
        const fireAnim = t.grenade.recordOf(item)!.fireAnim;
        expect(releases(s.asked, fireAnim), `${kind.name} ${item}`).toEqual([fireAnim]);
        expect(grunts(s.asked), `${kind.name} ${item}`).toHaveLength(grunt ? 1 : 0);
        expect(thrown).toEqual([item]);                        // one throw to the room
        t.dispose();
      }
    });
  }

  for (const view of [1, 3]) {
    it(`past third person (view state ${view}) the release asks the record's _zoom zAnim, which no throwable has: none plays; the grunt is the clip's still`, () => {
      for (const kind of [KINDS[0]!, KINDS[1]!]) {
        const s = stubAudio();
        const { t } = page(s.audio, { snap: kind.snap, view });
        throwOnce(t, 'M67', kind);
        expect(releases(s.asked, 'frag_start'), kind.name).toEqual(['frag_start_zoom']);
        expect(grunts(s.asked), kind.name).toHaveLength(kind.clip === 'seal_throwgrenade' ? 1 : 0);
        t.dispose();
      }
    });
  }

  it.skipIf(ZWEAPON === null)("the disc's own throwable records (ZWEAPON's kit table): each item's FireAnimName, once a throw", () => {
    const records = [...readKitTable(ZWEAPON!).throwables!.values()].map((r) => r.record);
    const named: Record<string, string> = { M67: 'frag_start', HE: 'HE_start', 'AN-M8': 'smoke_grenade_start', Mark141: 'flashbang_start' };
    for (const item of THROWS) {
      const s = stubAudio();
      const { t } = page(s.audio, { records });
      const fireAnim = t.grenade.recordOf(item)!.fireAnim;
      expect(fireAnim).toBe(named[item]);
      throwOnce(t, item, KINDS[0]!);
      expect(releases(s.asked, fireAnim), item).toEqual([fireAnim]);
      t.dispose();
    }
  });

  it("the trigger's throw (held, let go) asks the one release, as the hook's", () => {
    const s = stubAudio();
    const { t } = page(s.audio);
    t.grenade.setKit(['M67', null, null]);
    const hands = t.hands();
    expect(t.takeSlot(2)).toBe(true);
    hands.trigger(true);
    for (let f = 0; f < 60; f++) t.frame(1 / 60);
    hands.trigger(false);
    for (let f = 0; f < 150; f++) { t.poseFrame(1 / 60); t.frame(1 / 60); }
    expect(releases(s.asked, 'frag_start')).toEqual(['frag_start']);
    expect(grunts(s.asked)).toHaveLength(1);
    t.dispose();
  });
});

/**
 * NU-7 T1 (research 325 §1.2, §4 T1; pins, no behaviour change): no pin and no hold sound. `.GREN_PIN_PULL1` has no code
 * path (no ELF string, no clip callback, no zAnim bytes: `GRENADE_PIN_PULL_READING`, note only), and the wind-up
 * (`FUN_00594cf0` D:L453480-453525, `FUN_005dfe30` D:L494235-494275) plays nothing: the page asks nothing from the
 * equip through the held trigger to the throw's start (`throwStart`), and from there to the release only the clip's own
 * grunt (`throw_whoosh`, the standing throw's) -- then the release's FireAnimName.
 */
describe.skipIf(!haveClips)(`NU-7 T1: no pin and no hold sound -- nothing before the throw's start, nothing after it but the clip's grunt, then the release${haveClips ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** What the page asked, with the throw's start and its release marked in order. */
  function marked(t: ReturnType<typeof page>['t'], asked: string[]): void {
    t.grenade.on('throwStart', () => { asked.push('<throwStart>'); });
    t.grenade.on('throw', () => { asked.push('<release>'); });
  }

  for (const kind of KINDS) {
    it(`${kind.name}: the hook's throw`, () => {
      const { table } = motionSource();
      const grunt = table.get(kind.clip)!.callbacks.some((c) => c.name === 'throw_whoosh') && !(kind.cutAt !== undefined && kind.cutAt < 0.69);
      const s = stubAudio();
      const { t } = page(s.audio, { snap: kind.snap, pistol: kind.pistol });
      marked(t, s.asked);
      throwOnce(t, 'M67', kind);
      // the `throw` listeners run in order: the part's release ask first, then this marker
      expect(s.asked, kind.name).toEqual(['<throwStart>', ...(grunt ? ['throw_whoosh'] : []), 'frag_start', '<release>']);
      t.dispose();
    });
  }

  it("the trigger's throw: nothing while the trigger is held (the wind-up), then the grunt and the release", () => {
    const s = stubAudio();
    const { t } = page(s.audio);
    marked(t, s.asked);
    t.grenade.setKit(['M67', null, null]);
    const hands = t.hands();
    expect(t.takeSlot(2)).toBe(true);
    hands.trigger(true);
    for (let f = 0; f < 60; f++) { t.poseFrame(1 / 60); t.frame(1 / 60); }
    expect(s.asked).toEqual([]);
    hands.trigger(false);
    for (let f = 0; f < 150; f++) { t.poseFrame(1 / 60); t.frame(1 / 60); }
    expect(s.asked).toEqual(['<throwStart>', 'throw_whoosh', 'frag_start', '<release>']);
    t.dispose();
  });
});

describe("PAR-77: another page hears the room's accepted throw once, at its origin", () => {
  it("each throwable's `grenade` event: one FireAnimName, the third person's whatever this page's own view (the thrower's +0x200 is not on the wire)", () => {
    for (const view of [0, 1]) {
      for (const item of THROWS) {
        const s = stubAudio();
        const { t } = page(s.audio, { view });
        t.netDeps().remoteGrenade(item, [10, 20, 30], [0, 0, -100], 4, 7, undefined);
        const fireAnim = t.grenade.recordOf(item)!.fireAnim;
        expect(s.asked, `${item} view ${view}`).toEqual([fireAnim]);
        expect(grunts(s.asked)).toEqual([]);                   // the other body's grunt: GRENADE_REMOTE_GRUNT_TIMING (research 304 s11)
        t.dispose();
      }
    }
  });

  it("a joiner's catch-up of a throw already in the air plays none (research 304 s9)", () => {
    const s = stubAudio();
    const { t } = page(s.audio);
    t.netDeps().remoteGrenade('M67', [10, 20, 30], [0, 0, -100], 4, 7, { state: 'flight', age: 0.5, fuse: 2.5, removal: 30, bounces: 0, dud: false });
    expect(s.asked).toEqual([]);
    t.dispose();
  });
});

/**
 * NU-7 W1 (research 325 §2.1, §4 W1; `GRENADE_WARNING_LINE_READING`): the warning's line through the page's own wiring --
 * `mountThrowables`' `warning` handed `MatchSound.grenadeWarning`, as `main.ts` and `matchMount.ts` hand it -- for the
 * room's accepted throw of a teammate's M67; a joiner's catch-up of the same throw in the air (`remoteGrenade` with its
 * phase: no `remoteRelease`, research 304 s9) posts none.
 */
describe("NU-7 W1: a teammate's throw posts the warning's line through the page's wiring; a joiner's catch-up none", () => {
  function wired() {
    const posted: string[] = [];
    const audio = new GameAudio(new Recorder(), () => 0.5, { inline: false });
    const sound = mountSound({
      audio, side: () => 'seal',
      walk: { mode: () => 'walk', drawnFeet: () => [0, 0, 0], posture: () => 'stand', grid: () => null },
      fly: { groundWish: () => ({ forward: 0, right: 0, boost: false }) },
      loadouts: { type: () => 1 },
      seat: () => ({ id: 1, role: 'player', team: 'seal' }),
      others: () => ({ teamOf: () => 'seal', playerType: () => 0, feet: () => [10, 20, 30] }),
      hud: { postMessage: (lines: string | { text: string }[]) => { posted.push(typeof lines === 'string' ? lines : lines.map((l) => l.text).join('/')); } },
      nameOf: (id: number) => (id === 4 ? 'Mate' : `Player${id}`),
    } as never);
    sound.setData({ archive: 'MP2', banks: [], missing: [], taunts: { vocals: { seal: [], terrorist: [] }, grenadeWarnings: { seal: [[{ sound: '^PS_0016', text: '%s : FIRE IN THE HOLE!', character: 'c' }]], terrorist: [] } } } as never);
    const s = stubAudio();
    const { t } = page(s.audio, { warning: (r) => { sound.grenadeWarning(r); } });   // main.ts's and matchMount.ts's line
    return { t, posted };
  }
  it("the room's accepted throw: one line, the row's text with the thrower's name", () => {
    const { t, posted } = wired();
    t.netDeps().remoteGrenade('M67', [10, 20, 30], [0, 0, -100], 4, 7, undefined);
    expect(posted).toEqual(['Mate : FIRE IN THE HOLE!']);
    t.dispose();
  });
  it("a joiner's catch-up of the throw in the air: none", () => {
    const { t, posted } = wired();
    t.netDeps().remoteGrenade('M67', [10, 20, 30], [0, 0, -100], 4, 7, { state: 'flight', age: 0.5, fuse: 2.5, removal: 30, bounces: 0, dud: false });
    expect(posted).toEqual([]);
    t.dispose();
  });
});

describe('PAR-77: a placing on the thrower\'s page picks its release as a throw does (FUN_005bc730 D:L474051-474053)', () => {
  it("c4_start in third person; c4_start_zoom (none on the disc) past it", () => {
    for (const [view, want] of [[0, 'c4_start'], [1, 'c4_start_zoom']] as const) {
      const s = stubAudio();
      const { t } = page(s.audio, { view });
      (t.grenade as unknown as { emit(k: string, i: unknown): void }).emit('place', { item: 'Claymore', pos: [0, 0, 0], yaw: 0, facing: [0, 0, -1], fireAnim: 'c4_start' });
      expect(s.asked).toEqual([want]);
      t.dispose();
    }
  });
});

describe.skipIf(!haveDisc || !haveClips)(`PAR-77, the disc: the release and the grunt through the page's audio on MP7 (the owner's map)${haveDisc ? '' : ' (SOCOM_DISC with RUN/SOUNDS absent)'}`, () => {
  it("every throwable's FireAnimName plays one sound (.THROW_OBJECT, found by its trimmed name), its _zoom none; the grunt .MALE_GRUNT", async () => {
    const d = await soundFromDisc(new GameplayAudioSource(disc!), 'RUN/MP7.ZDB', 'MP7');
    const callbacks = new Map(d.callbacks);
    for (const anim of ['frag_start', 'HE_start', 'smoke_grenade_start', 'flashbang_start']) {
      expect(callbacks.get(anim), anim).toEqual(['.THROW_OBJECT']);
      expect(callbacks.has(`${anim}_zoom`), `${anim}_zoom`).toBe(false);
    }
    expect(callbacks.get('throw_whoosh')).toEqual(['.MALE_GRUNT']);
    expect(callbacks.get('c4_start')).toEqual(['.PLACE_CHARGE']);
    expect(callbacks.has('c4_start_zoom')).toBe(false);

    const count = (byName: Record<string, number>, name: string) => Object.entries(byName).filter(([n]) => n.trim() === name).reduce((a, [, c]) => a + c, 0);
    for (const [view, release] of [[0, 1], [1, 0]] as const) {
      for (const kind of [KINDS[0]!, KINDS[1]!]) {
        const out = new Recorder(), audio = new GameAudio(out);
        audio.setData(d);
        audio.setListener([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 20, 40, 1]);   // the camera behind the SEAL
        const { t } = page(audio, { snap: kind.snap, view });
        throwOnce(t, 'M67', kind);
        const s = audio.stats();
        expect(count(s.byName, '.THROW_OBJECT'), `${kind.name} view ${view}`).toBe(release);
        expect(count(s.byName, '.MALE_GRUNT'), `${kind.name} view ${view}`).toBe(kind.clip === 'seal_throwgrenade' ? 1 : 0);
        t.dispose();
      }
    }
    // Another page: the room's event, once.
    const out = new Recorder(), audio = new GameAudio(out);
    audio.setData(d);
    audio.setListener([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 20, 40, 1]);
    const { t } = page(audio, { view: 1 });
    t.netDeps().remoteGrenade('M67', [0, 15, 0], [0, 0, -100], 4, 7, undefined);
    expect(count(audio.stats().byName, '.THROW_OBJECT')).toBe(1);
    t.dispose();
  }, 60000);
});
