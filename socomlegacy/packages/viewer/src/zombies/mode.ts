/**
 * The playable zombies mode for the test room (`TEST_ROOM_ZOMBIES_ADAPTATION`, product track, OT.R53).
 * Phoenix chase, melee and waves. The model and the sounds come from the visitor's mod pack.
 * Perks, the shop, barricades, power-ups, weapon upgrade and the developer panel are not part of this mode.
 */
import { segmentHit, type Grid } from '@s2u/scene';
import type { Scene } from 'three';
import type { FireEvent } from '../fire';
import type { PlayClips } from '../play';
import { Walker } from '../mover';
import { modOverrideBytes } from '../mods/override';
import { ZOMBIE_TYPES, ZombiePursuit, zombieKind, type ZombieKind } from './evolution';
import { waveLiveLimit, waveSize } from './crowd';
import { meleeClear, meleeFacing, meleeReach } from './melee';
import { ZombieCombatFeedback, zombieShotHit } from './combat';
import { ZombieHud } from './hud';
import { ZombieSpawnMap } from './spawns';
import { TrafficIndex, ZombieTraffic, crowdStepClear } from './traffic';
import { EnemyNavigator, collisionStep } from './navigation';
import { botTraversal, planObstacle, type ObstacleMove } from './obstacle';
import { loadZombieAssets, type ZombieAssets, type ZombieView } from './assets';
import { ZOMBIE_PACK_PATH, ZombiePackRefusal, readZombiePack } from './pack';

export { ZOMBIE_PACK_PATH } from './pack';

export { meleeClear, meleeFacing, meleeReach } from './melee';
export { waveSize } from './crowd';

type Point = [number, number, number];

export const RESTOCK_SECONDS = 10;
export const ZOMBIE_BULLET_TARGETS = 4;
export const ZOMBIE_BULLET_RETENTION = .75;
export const ATTACK_SECONDS = .85;
export const ATTACK_WINDUP = .35;
export const DAMAGE_GRACE = .45;
/** F9 is the development overlay. F6 starts this mode. F7 resets it. F8 is the playtest mark. */
export const ZOMBIE_START_KEY = 'F6';
export const ZOMBIE_RESET_KEY = 'F7';
export const ZOMBIE_NEEDS_PACK = 'Zombies needs its mod pack. Open Mods, add the zombies pack, enable it, press Reload map, then press F6.';
export const ZOMBIE_CROSSROADS = 'Zombies runs on Crossroads (MP72) for now.';
export const ZOMBIE_IN_MATCH = 'Zombies runs outside a match. Leave the match, then press F6.';
export const ZOMBIE_NEEDS_WALK = 'Zombies starts in walk mode. Press Play, then press F6.';
/** One step. A longer step lets a walker cross a wall between probes. */
const SIM_STEP_SECONDS = .05;
/** Steps one displayed frame will run (a quarter second). The rest of a hitch is dropped, so catching up cannot make the next frame later. */
const SIM_STEPS = 5;

export const wavePace = (wave: number): { speed: number; spawnInterval: number; liveLimit: number; animation: 'walk' | 'run'; animationRate: number } => ({
  speed: Math.min(.85, .22 + Math.max(0, wave - 1) * .06),
  spawnInterval: Math.max(.04, 1.2 - Math.max(0, wave - 1) * .07),
  liveLimit: waveLiveLimit(wave),
  animation: wave < 4 ? 'walk' : 'run',
  animationRate: Math.min(1.3, .7 + Math.max(0, wave - 1) * .05),
});

export const waveHealth = (wave: number): number => Math.min(400, 100 + Math.max(0, wave - 1) * 20);

export interface ZombieDeathReport { wave: number; kills: number; survived: number; seconds: number }

export interface ZombieDeps {
  scene: Scene;
  fire: {
    subscribe(listener: (event: FireEvent) => void): () => void;
    release(): void;
    weaponRecord?: () => { name: string };
  };
  archive(): string | null;
  ready(): boolean;
  grid(): Grid | null;
  feet(): readonly number[] | null;
  camera?: () => readonly number[];
  yaw?: () => number;
  clips(): PlayClips | null;
  health(value: number): void;
  time?: (seconds: number) => void;
  lock(on: boolean): void;
  start?: () => void;
  death?: (result: ZombieDeathReport) => void;
  resetDeath?: () => void;
  present?: (dt: number) => void;
  devtools?: boolean;
  /** Bytes of `MODS/ZOMBIES/PACK.ZIP`, or null when that file is not in the mod table. */
  packBytes?: () => Uint8Array | null;
  /**
   * True while the page is in a NETWORKED match (OT.R70; the review's ask 2): no start then, and a run stands down when one
   * begins. The test room's own offline loopback match is not one (`offline`, #395 review F1).
   */
  inMatch?: () => boolean;
  /**
   * The test room's offline loopback match (#395 review F1, the merge controller's (b)): a start stands it down first, so
   * the run and that match never share the page (no match HUD or death lock for the run to touch), and a reset (F7, a
   * failed load) makes it again; a map load's reset (`reset({ restore: false })`) leaves the load to make its own room.
   */
  offline?: { active(): boolean; stop(): void; restore(): void };
}

interface Zombie {
  id: number;
  kind: ZombieKind;
  pursuit: ZombiePursuit;
  sense: number;
  visible: boolean;
  traffic: ZombieTraffic;
  spawn: Point;
  walker: Walker;
  nav: EnemyNavigator;
  moves: ReturnType<typeof botTraversal>;
  obstacle: ObstacleMove | null;
  retry: number;
  view: ZombieView;
  hp: number;
  dead: number;
  cooldown: number;
  attack: number;
  struck: boolean;
  groan: number;
  stagger: number;
  staggerLock: number;
}

type Phase = 'idle' | 'loading' | 'countdown' | 'playing' | 'restock' | 'dead';

let keys: { start: () => void; reset: () => void } | null = null;
let keysBound = false;

function onKey(e: KeyboardEvent): void {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target;
  if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
  if (e.code !== ZOMBIE_START_KEY && e.code !== ZOMBIE_RESET_KEY) return;
  e.preventDefault();
  if (e.code === ZOMBIE_START_KEY) void keys?.start();
  else keys?.reset();
}

export function installZombies(deps: ZombieDeps) {
  const host = document.querySelector('#panel-body') ?? document.body;
  const panel = document.createElement('div');
  panel.innerHTML = `<button type="button" id="zombies-start">Start Zombies (${ZOMBIE_START_KEY})</button><output id="zombies-status" aria-live="polite">Zombies · ${ZOMBIE_START_KEY} to start waves</output>`;
  host.append(panel);
  const output = panel.querySelector('output')!;
  let assets: ZombieAssets | null = null;
  let epoch = 0;
  let active = false;
  let wave = 0;
  let pending = 0;
  let kills = 0;
  let health = 100;
  let intermission = 0;
  let spawnTimer = 0;
  let last = 0;
  let pumping = false;
  let stopSteps = false;
  let spawnFailures = 0;
  let phase: Phase = 'idle';
  let countdown = 0;
  let seconds = 0;
  let survived = 0;
  let spawnMap: ZombieSpawnMap | null = null;
  let packState = 'missing';
  // True once a start has taken the page's walker lock, health, timer and death overlay; only then does a reset hand
  // them back (the review's ask 1: F7 and every map load reset, and with no run they must leave the page alone).
  let holdsPage = false;
  // #395 review F1: whether this run stood the offline loopback match down, and so owes it back at the reset.
  let stoodDownOffline = false;
  const zombies: Zombie[] = [];
  let nextZombieId = 0;
  let navCursor = 0;
  let noise: { point: Point; age: number } | null = null;
  const hud = new ZombieHud();
  let damageGrace = 0;
  const feedback = new ZombieCombatFeedback(deps.scene);
  let waveTotal = 0;
  let waveSpawned = 0;
  const perf = { simulationMs: 0, peakSimulationMs: 0, navUpdates: 0, alive: 0 };
  const population = (): { total: number; live: number } => {
    const total = waveSize(wave);
    return { total, live: Math.min(total, waveLiveLimit(wave)) };
  };
  const say = (s: string): void => { if (output.textContent !== s) output.textContent = s; };
  const packBytes = (): Uint8Array | null => (deps.packBytes ?? (() => modOverrideBytes(ZOMBIE_PACK_PATH)))();

  const reset = (o: { restore?: boolean } = {}): void => {
    if (stoodDownOffline) {
      stoodDownOffline = false;
      if (o.restore !== false) deps.offline?.restore();
    }
    noise = null;
    navCursor = 0;
    waveTotal = 0;
    waveSpawned = 0;
    perf.simulationMs = perf.peakSimulationMs = perf.navUpdates = perf.alive = 0;
    feedback.reset();
    epoch++;
    phase = 'idle';
    countdown = seconds = survived = 0;
    document.body.classList.remove('zombie-match');
    hud.reset();
    spawnMap = null;
    active = false;
    wave = pending = kills = 0;
    health = 100;
    intermission = spawnTimer = spawnFailures = 0;
    damageGrace = 0;
    for (const z of zombies) z.view.dispose();
    zombies.length = 0;
    assets?.stop();
    assets = null;
    if (holdsPage) {
      holdsPage = false;
      deps.resetDeath?.();
      // #395 review F2: in a match (a stand-down) the match owns the walker's lock, the health and the timer -- its
      // NetClient has just locked the walker until the server stands it somewhere -- so only a run outside one hands them back
      if (!deps.inMatch?.()) {
        deps.time?.(0);
        deps.health(1);
        deps.lock(false);
      }
    }
    say(`Zombies · ${ZOMBIE_START_KEY} to start waves`);
  };

  const beginWave = (): void => {
    phase = 'playing';
    wave++;
    hud.roundCue(wave);
    if (wave % 5 === 0) hud.notice('BRUTE ROUND', 'An armored kind joins the horde · aim for its head');
    else if (wave === 3) hud.notice('RUNNERS INCOMING', 'Fast zombies are joining the horde');
    waveTotal = population().total;
    waveSpawned = 0;
    pending = waveTotal;
    spawnTimer = 0;
  };

  const spawn = (): boolean => {
    const grid = deps.grid(), feet = deps.feet();
    if (!grid || !feet || !assets) return false;
    const player: Point = [feet[0]!, feet[1]!, feet[2]!];
    const camera = deps.camera?.();
    const chosen = spawnMap?.choose(player, zombies.filter((z) => z.hp > 0).map((z) => [z.walker.state.x, z.walker.state.y, z.walker.state.z] as Point), Math.random, camera ? [camera[0]!, camera[1]!, camera[2]!] : undefined, population().live > 10 ? 14 : 100);
    if (!chosen) return false;
    const w = new Walker(grid);
    if (!w.place(chosen.point[0], chosen.point[1] + 5, chosen.point[2])) return false;
    const kind = zombieKind(wave, waveSpawned);
    const moves = botTraversal(grid, deps.clips());
    w.driver = moves;
    const view = assets.create(kind);
    view.root.position.set(w.state.x, w.state.y, w.state.z);
    deps.scene.add(view.root);
    const nav = new EnemyNavigator(grid);
    nav.seed(chosen.path, spawnMap!.origin);
    zombies.push({
      id: nextZombieId++, kind, pursuit: new ZombiePursuit(), sense: 0, visible: false, traffic: new ZombieTraffic(collisionStep(grid)),
      spawn: [...chosen.point], walker: w, nav, moves, obstacle: null, retry: Math.random() * 1.5, view,
      hp: Math.round(waveHealth(wave) * ZOMBIE_TYPES[kind].health), dead: 0, cooldown: .5, attack: 0, struck: false,
      groan: 2 + Math.random() * 5, stagger: 0, staggerLock: 0,
    });
    return true;
  };

  const start = async (): Promise<boolean> => {
    if (phase === 'loading' || phase === 'countdown' || phase === 'playing' || phase === 'restock') return false;
    if (deps.inMatch?.()) { say(ZOMBIE_IN_MATCH); return false; }
    if (deps.archive() !== 'MP72') { say(ZOMBIE_CROSSROADS); return false; }
    if (!deps.ready()) { say(ZOMBIE_NEEDS_WALK); return false; }
    const bytes = packBytes();
    if (bytes === null) { packState = 'missing'; say(ZOMBIE_NEEDS_PACK); return false; }
    const generation = epoch;
    const from = phase;
    phase = 'loading';
    pump();
    let parsed;
    try { parsed = await readZombiePack(bytes); }
    catch (error) {
      if (epoch !== generation) return false;
      phase = from;
      const reason = error instanceof ZombiePackRefusal ? error.message : 'invalid pack.json';
      packState = `refused:${reason}`;
      say(`Zombies pack refused: ${reason}`);
      return false;
    }
    if (epoch !== generation) return false;
    packState = 'loaded';
    const wasDown = stoodDownOffline;                               // a run after a run (Play again): the loopback still down
    stoodDownOffline = false;
    reset({ restore: false });
    stoodDownOffline = wasDown;
    if (deps.offline?.active()) { deps.offline.stop(); stoodDownOffline = true; }   // F1: the loopback stands down first
    const ticket = epoch;
    phase = 'loading';
    holdsPage = true;
    deps.lock(true);
    deps.fire.release();
    deps.start?.();
    document.body.classList.add('zombie-match');
    hud.countdown(-1);
    say('Loading the zombies pack…');
    let loaded: ZombieAssets;
    try { loaded = await loadZombieAssets(parsed); }
    catch (error) {
      if (ticket !== epoch) return false;
      const reason = error instanceof Error ? error.message : 'invalid model';
      packState = `refused:${reason}`;
      reset();
      say(`Zombies pack refused: ${reason}`);
      return false;
    }
    if (ticket !== epoch) { loaded.stop(); return false; }
    if (!deps.ready()) { loaded.stop(); reset(); return false; }
    assets = loaded;
    hud.setCues((name) => assets?.cue(name));
    phase = 'countdown';
    countdown = 3;
    hud.countdown(countdown);
    return true;
  };

  deps.fire.subscribe((event) => {
    if (event.type !== 'round' || !active) return;
    const shooter = deps.feet();
    if (shooter) noise = { point: [shooter[0]!, shooter[1]!, shooter[2]!], age: 0 };
    const from = event.from, to = event.to;
    const ray: Point = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length2 = ray[0] * ray[0] + ray[1] * ray[1] + ray[2] * ray[2];
    const candidates = zombies.filter((z) => {
      if (z.hp <= 0) return false;
      const s = z.walker.state;
      const t = Math.max(0, Math.min(1, ((s.x - from[0]) * ray[0] + (s.y + 10 - from[1]) * ray[1] + (s.z - from[2]) * ray[2]) / (length2 || 1)));
      return (s.x - from[0] - ray[0] * t) ** 2 + (s.y + 10 - from[1] - ray[1] * t) ** 2 + (s.z - from[2] - ray[2] * t) ** 2 < 400;
    }).map((z) => {
      const s = z.walker.state;
      return { z, hit: zombieShotHit(from, to, [s.x, s.y, s.z], z.view.head?.() ?? [s.x, s.y + 18, s.z]) };
    }).filter((c) => c.hit !== null).sort((a, b) => a.hit!.t - b.hit!.t);
    const weaponName = event.weapon?.name ?? '';
    const baseDamage = weaponName === 'AK-47' ? 60 : 34;
    const hurt = (target: Zombie, damage: number, headshot: boolean, point?: Point): void => {
      const body = headshot ? 1 : ZOMBIE_TYPES[target.kind].body;
      target.hp = Math.max(0, target.hp - damage * body);
      target.view.react?.(headshot);
      const s = target.walker.state;
      feedback.impact(point ?? [s.x, s.y + 11, s.z], ray, headshot, target.hp === 0);
      if (target.hp > 0 && target.staggerLock <= 0) {
        target.stagger = headshot ? .36 : .2;
        target.staggerLock = .65;
        target.attack = 0;
        target.cooldown = Math.max(target.cooldown, .55);
      }
      if (target.hp === 0) {
        kills++;
        target.attack = 0;
        assets?.sound('Deaths', 50);
      }
    };
    for (const [depth, candidate] of candidates.slice(0, ZOMBIE_BULLET_TARGETS).entries()) {
      const hit = candidate.hit!;
      hurt(candidate.z, baseDamage * ZOMBIE_BULLET_RETENTION ** depth * (hit.headshot ? 2 : 1), hit.headshot, hit.point);
    }
  });

  const frame = (now: number): void => {
    pumping = false;
    if (phase === 'idle') return;
    const raw = last ? Math.max(0, (now - last) / 1000) : 0;
    last = now;
    // A match began under a run: it stands down, and lets go of any fire it held, so the match starts clean.
    if (deps.inMatch?.()) { deps.fire.release(); reset({ restore: false }); return; }   // a networked match owns the page
    if (phase === 'loading' || !deps.ready() || document.hidden || !assets) { pump(); return; }
    stopSteps = false;
    let budget = Math.min(raw, SIM_STEP_SECONDS * SIM_STEPS);
    for (let i = 0; budget > 1e-4 && i < SIM_STEPS && !stopSteps; i++) {
      const dt = Math.min(SIM_STEP_SECONDS, budget);
      budget -= dt;
      simulate(dt);
    }
    pump();
  };
  const simulate = (dt: number): void => {
    if (!assets) return;
    deps.present?.(dt);
    const frameStarted = performance.now();
    const feedbackFeet = deps.feet();
    if (feedbackFeet) feedback.frame(dt, [feedbackFeet[0]!, feedbackFeet[1]!, feedbackFeet[2]!], deps.yaw?.() ?? 0);
    hud.frame(health, kills, dt);
    if (phase === 'countdown') {
      countdown = Math.max(0, countdown - dt);
      hud.countdown(countdown);
      deps.fire.release();
      if (countdown > 0) return;
      hud.countdown(null);
      phase = 'playing';
      deps.lock(false);
      active = true;
      beginWave();
      assets.sound('Groans');
    }
    if (active) {
      if (noise) noise.age += dt;
      seconds += dt;
      damageGrace = Math.max(0, damageGrace - dt);
      deps.time?.(seconds);
    }
    const feet = deps.feet(), grid = deps.grid();
    if (!feet || !grid) return;
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i]!;
      if (z.hp <= 0) {
        z.dead += dt;
        z.view.animate('death', dt);
        if (z.dead > 4) { z.view.dispose(); zombies.splice(i, 1); }
      }
    }
    if (!active && health > 0) return;
    if (active) {
      if (!spawnMap || Math.hypot(feet[0]! - spawnMap.origin[0], feet[2]! - spawnMap.origin[2]) > 300) spawnMap = new ZombieSpawnMap(grid, [feet[0]!, feet[1]!, feet[2]!]);
      spawnMap.advance();
      let alive = zombies.filter((z) => z.hp > 0);
      spawnTimer -= dt;
      if (pending > 0 && alive.length < population().live && spawnTimer <= 0) {
        spawnTimer = wavePace(wave).spawnInterval;
        if (spawn()) { pending--; waveSpawned++; spawnFailures = 0; }
        else { spawnFailures++; spawnTimer = Math.max(.2, spawnTimer); }
      }
      alive = zombies.filter((z) => z.hp > 0);
      if (!pending && !alive.length) {
        if (intermission === 0) { survived = wave; phase = 'restock'; hud.roundCue(wave, true); }
        intermission += dt;
        if (intermission >= RESTOCK_SECONDS) { intermission = 0; beginWave(); }
        else {
          hud.restock(wave, RESTOCK_SECONDS - intermission);
          say(`Round ${wave} cleared · next round in ${Math.ceil(RESTOCK_SECONDS - intermission)}`);
          return;
        }
      }
    }
    const player: Point = [feet[0]!, feet[1]!, feet[2]!];
    const target = player;
    const survivors = zombies.filter((z) => z.hp > 0);
    const bodies = survivors.map((z) => ({ id: z.id, position: [z.walker.state.x, z.walker.state.y, z.walker.state.z] as Point }));
    const trafficIndex = new TrafficIndex(bodies);
    const navUntil = performance.now() + 2;
    let workCount = 0, obstacleTrials = 0;
    const pace = wavePace(wave);
    const attackDuration = assets.clips.find((c) => c.name === 'attack')?.duration ?? ATTACK_SECONDS;
    perf.navUpdates = 0;
    for (let index = 0; index < survivors.length; index++) {
      const z = survivors[(index + navCursor) % survivors.length]!;
      const w = z.walker, s = w.state, at: Point = [s.x, s.y, s.z], goal: Point = [target[0], target[1], target[2]];
      const grounded = !w.airborne;
      const clear = (): boolean => meleeClear(grid, [s.x, s.y, s.z], goal);
      z.stagger = Math.max(0, z.stagger - dt);
      z.staggerLock -= dt;
      z.cooldown -= dt;
      z.groan -= dt;
      z.retry -= dt;
      if (z.groan <= 0) { assets.sound('Groans', Math.hypot(s.x - goal[0], s.z - goal[2])); z.groan = 5 + Math.random() * 5; }
      const type = ZOMBIE_TYPES[z.kind];
      let animation: string = z.kind === 'runner' ? 'run' : 'walk';
      z.sense -= dt;
      if (z.sense <= 0) {
        z.sense = .4 + (z.id % 4) * .05;
        z.visible = Math.hypot(s.x - goal[0], s.z - goal[2]) < 400 && !segmentHit(grid, [s.x, s.y + 15, s.z], [goal[0], goal[1] + 15, goal[2]]);
      }
      const pursue = z.pursuit.goal(at, goal, z.visible, noise, dt, z.id, collisionStep(grid));
      if (z.stagger > 0 && !w.airborne && !z.moves.busy() && !z.obstacle) { w.advance(dt, { forward: 0, right: 0, boost: false }); animation = 'idle'; }
      else if (z.attack > 0) {
        z.attack -= dt;
        animation = 'attack';
        if (z.attack <= ATTACK_SECONDS - ATTACK_WINDUP && !z.struck) {
          z.struck = true;
          if (active && damageGrace <= 0 && meleeReach([s.x, s.y, s.z], goal) && meleeFacing([s.x, s.y, s.z], goal, s.yaw) && clear()) {
            health = Math.max(0, health - type.damage);
            damageGrace = DAMAGE_GRACE;
            deps.health(health / 100);
            feedback.hurt([s.x, s.y, s.z]);
          }
        }
        w.advance(dt, { forward: 0, right: 0, boost: false });
      } else if (meleeReach(at, goal) && clear() && !w.airborne && !z.moves.busy()) {
        s.yaw = Math.atan2(-(goal[0] - s.x), -(goal[2] - s.z)) * 180 / Math.PI;
        animation = 'idle';
        if (z.cooldown <= 0) {
          z.attack = ATTACK_SECONDS;
          z.cooldown = 1.6 + (z.id % 5) * .07;
          z.struck = false;
          animation = 'attack';
          assets.sound('Attacks', 12);
        }
        w.advance(dt, { forward: 0, right: 0, boost: false });
      } else {
        if (!z.obstacle && z.retry <= 0 && z.traffic.stats().waiting === 0 && z.nav.obstacleNeeded() && obstacleTrials < 1) {
          obstacleTrials++;
          z.retry = 2 + Math.random();
          z.obstacle = planObstacle(w, pursue, deps.clips());
        }
        if (z.obstacle) {
          const control = z.obstacle;
          w.advance(dt, { forward: 1, right: 0, boost: false }, undefined, () => control.input(w, z.moves));
          if (control.ticks >= control.duration) { z.obstacle = null; z.nav = new EnemyNavigator(grid); }
        } else {
          const budget = (workCount < 8 && performance.now() < navUntil) ? .25 : 0;
          if (budget) workCount++;
          perf.navUpdates++;
          const route = z.visible && Math.hypot(pursue[0] - goal[0], pursue[2] - goal[2]) > .1 ? pursue : z.nav.steer(at, pursue, dt, false, budget);
          const point = route ? z.traffic.steer({ id: z.id, position: at }, route, trafficIndex.near(at), dt) : null;
          if (route && !point) z.nav.wait(at);
          if (point) s.yaw = Math.atan2(-(point[0] - s.x), -(point[2] - s.z)) * 180 / Math.PI;
          const moving = !!point;
          w.advance(dt, { forward: moving ? Math.min(.95, pace.speed * type.speed) : 0, right: 0, boost: false });
          if (!moving) animation = 'idle';
        }
      }
      if (grounded && !w.airborne && !z.obstacle && !z.moves.busy() && !crowdStepClear({ id: z.id, position: at }, [s.x, s.y, s.z], trafficIndex.near(at, 24 + Math.hypot(s.x - at[0], s.z - at[2])))) {
        s.x = at[0]; s.y = at[1]; s.z = at[2]; s.vx = s.vz = 0; s.stickForward = s.stickRight = 0;
        z.nav.wait(at);
        if (animation !== 'attack') animation = 'idle';
      }
      trafficIndex.update(z.id, [s.x, s.y, s.z]);
      z.view.root.position.set(s.x, s.y, s.z);
      z.view.root.rotation.y = s.yaw * Math.PI / 180;
      z.view.animate(animation, dt, animation === 'attack' ? attackDuration / ATTACK_SECONDS : animation === 'walk' || animation === 'run' ? Math.min(1.6, pace.animationRate * type.speed) : 1);
      if (active && health <= 0) {
        active = false;
        phase = 'dead';
        document.exitPointerLock?.();
        deps.fire.release();
        deps.lock(true);
        deps.death?.({ wave, kills, survived, seconds });
        say(`Overrun on wave ${wave} · ${kills} kills · ${ZOMBIE_RESET_KEY} to reset`);
        stopSteps = true;
        return;
      }
    }
    navCursor = (navCursor + Math.max(1, workCount)) % Math.max(1, survivors.length);
    perf.alive = survivors.length;
    perf.simulationMs = performance.now() - frameStarted;
    perf.peakSimulationMs = Math.max(perf.peakSimulationMs, perf.simulationMs);
    if (active) say(`Wave ${wave} · ${survivors.length + pending} remaining · ${kills} kills · Health ${health}%${spawnFailures > 3 ? ' · Move into an open lane for more spawns' : ''}`);
  };
  const pump = (): void => {
    if (pumping || phase === 'idle') return;
    pumping = true;
    globalThis.requestAnimationFrame(frame);
  };
  panel.querySelector('button')!.addEventListener('click', () => void start());
  keys = { start: () => void start(), reset: () => reset() };
  if (!keysBound) { window.addEventListener('keydown', onKey); keysBound = true; }

  const skipToWave = (target: number): boolean => {
    if (!active || !Number.isSafeInteger(target) || target < 1) return false;
    for (const z of zombies) z.view.dispose();
    zombies.length = 0;
    intermission = spawnFailures = 0;
    wave = target - 1;
    beginWave();
    return true;
  };
  const clearWave = (): boolean => {
    if (!active) return false;
    for (const z of zombies) z.view.dispose();
    zombies.length = 0;
    pending = 0;
    return true;
  };
  const api = {
    start,
    reset,
    skipToWave,
    clearWave,
    summary: () => ({
      wave, pending, waveTotal, waveSpawned, alive: zombies.filter((z) => z.hp > 0).length, population: population(),
      performance: { ...perf },
    }),
    stats: () => ({
      phase, countdown, seconds, survived, active, wave, pending, kills, health, pack: packState, intermission,
      nextRoundIn: phase === 'restock' ? Math.max(0, RESTOCK_SECONDS - intermission) : 0,
      pace: wavePace(Math.max(1, wave)),
      hud: hud.stats(),
      combat: feedback.stats(),
      waveTotal, waveSpawned,
      alive: zombies.filter((z) => z.hp > 0).length,
      population: population(),
      performance: { ...perf },
      zombies: zombies.map((z) => ({
        kind: z.kind, hp: z.hp, attack: z.attack, stagger: z.stagger, spawn: z.spawn,
        position: [z.walker.state.x, z.walker.state.y, z.walker.state.z] as Point,
        pursuit: z.pursuit.stats(), traffic: z.traffic.stats(), navigation: z.nav.stats(), obstacle: !!z.obstacle,
        head: z.view.head?.(),
      })),
    }),
  };
  const hook = window as Window & { __zombies?: typeof api };
  if (deps.devtools) hook.__zombies = api;
  else delete hook.__zombies;
  return api;
}
