import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { CLAYMORE_RULES, launchReportItem, tumbleQuaternion, weaponCategory, type Grid, type KitTable, type Loadout } from '@s2u/scene';
import type { FlyCamera } from '../camera';
import { CAMERA_BLAST_EXEMPT_ITEMS, muzzleAnimation } from '../effectRules';
import { EQUIPMENT_SLOTS, equipmentKind, launcherLowerSeconds, throwableOf } from '../equipment';
import { KitRounds } from '../firearms';
import { launcherMovingLowerSeconds } from '../mover';
import { RocketLauncher } from '../rocket';
import type { NetClient } from '../net/client';
import { ThrowWire } from '../net/throwWire';
import type { Play } from '../play';
import type { ThrowPose } from '../throwPose';
import { handGrenade } from '../weaponRaise';
import { GrenadeCore, type GrenadeItem, type GrenadeSource, type Live } from '../grenadeCore';
import { explosionShake } from '../look';
import type { ServerEvent } from '../net/protocol';
import type { PlaySnapshot, WalkMode, WalkView } from '../walk';
import type { SceneObject } from './sceneFrame';
import { EffectMeshStyle, type EffectMeshFrame } from './particleStyle';
import type { PerspectiveCamera } from 'three';
import type { WalkingEffects } from './walkingEffects';

type V3 = [number, number, number];

/** The shared throwable rules (`../grenadeCore`) drawn as numeric placements: a live grenade, charge or launched round
 * is its record's model at a matrix (`SceneObject`), as `../grenade` `GrenadeThrower` poses its scene copy. */
class PlacedGrenades extends GrenadeCore {
  private readonly drawn = new Map<Live, { object: SceneObject; shown: boolean; yaw: number }>();
  private nextId = 1 << 20;
  private readonly position = new Vector3(); private readonly turn = new Quaternion(); private readonly from = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1); private readonly matrix = new Matrix4(); private readonly euler = new Euler();
  missingModels = 0;
  /** The held throw's arc as the core hands it each update (`arcDrawing`): its points, a segment's alpha each, its colour; null, none. */
  arcNow: { points: readonly V3[]; alphas: readonly number[]; color: V3 } | null = null;
  protected override arcDrawing(arc: { points: readonly V3[]; alphas: readonly number[]; color: V3 } | null): void { this.arcNow = arc && arc.alphas.length ? arc : null; }
  /** The item in the hand (`../grenade` `placeHand`'s rule): shown while it is up with one left and ready or wound up, through a throw not yet let go, and through a placing. */
  private handShown = false;
  private readonly handObject: SceneObject = { id: (1 << 20) - 1, model: '', matrix: new Float32Array(16) };
  /** The right hand's world matrix now (the `grenade` node's: its local is the identity), or null when the body is not drawn. */
  hand: (() => Matrix4 | null) | null = null;
  constructor(source: GrenadeSource, private readonly modelOf: (name: string) => string | null) { super(source); }
  protected override placeHand(snap: PlaySnapshot | null): void {
    this.handShown = !!snap && (this.equipped_ && (this.detonatorUp || this.selectedLeft() > 0) && (this.phase_ === 'ready' || this.phase_ === 'holding')
      || this.pending !== null || this.placing !== null);
  }
  objects(out: SceneObject[]): void {
    for (const entry of this.drawn.values()) if (entry.shown) out.push(entry.object);
    if (!this.handShown) return;
    const model = this.modelOf(this.detonatorUp ? CLAYMORE_RULES.detonator.model : this.record.model), at = model ? this.hand?.() ?? null : null;
    if (!model || !at) return;
    this.handObject.model = model; at.toArray(this.handObject.matrix); out.push(this.handObject);
  }
  shown(): number { let n = 0; for (const entry of this.drawn.values()) if (entry.shown) n++; return n; }
  private write(entry: { object: SceneObject; yaw: number }, at: readonly number[], turn: Quaternion): void {
    this.matrix.compose(this.position.set(at[0]!, at[1]!, at[2]!), turn, this.scale).toArray(entry.object.matrix);
  }
  protected override createLive(l: Live): void {
    const model = this.modelOf(l.g.record.model);
    if (!model) { this.missingModels++; return; }
    const yaw = l.facing !== undefined ? (l.facing * Math.PI) / 180 : 0;
    const entry = { object: { id: this.nextId++, model, matrix: new Float32Array(16) }, shown: true, yaw };
    this.write(entry, l.g.pos, this.turn.setFromEuler(this.euler.set(0, yaw, 0)));
    this.drawn.set(l, entry);
  }
  protected override placeLive(l: Live): void {
    const entry = this.drawn.get(l); if (!entry) return;
    entry.object.matrix[12] = l.g.pos[0]; entry.object.matrix[13] = l.g.pos[1]; entry.object.matrix[14] = l.g.pos[2];
  }
  protected override liveVisible(l: Live, visible: boolean): void { const entry = this.drawn.get(l); if (entry) entry.shown = visible; }
  /** `GrenadeThrower.drawLive`: between the last game frame's place and this one's; a hand grenade keeps its tumble, a launched round at rest lies on its side. */
  protected override drawLive(l: Live): void {
    const entry = this.drawn.get(l);
    if (!entry || l.g.state === 'detonated' || l.facing !== undefined) return;
    const t = this.flight.alpha(), from = l.from, p = l.g.pos;
    const at: V3 = from ? [from.pos[0] + (p[0] - from.pos[0]) * t, from.pos[1] + (p[1] - from.pos[1]) * t, from.pos[2] + (p[2] - from.pos[2]) * t] : [p[0], p[1], p[2]];
    if (weaponCategory(l.g.record.id) === 0x79) {
      const [x, y, z, w] = tumbleQuaternion(l.g.tumble);
      this.turn.set(x, y, z, w);
      if (from) { const [fx, fy, fz, fw] = tumbleQuaternion(from.tumble); this.turn.slerpQuaternions(this.from.set(fx, fy, fz, fw), this.turn.clone(), t); }
    } else this.turn.setFromEuler(this.euler.set(l.g.state !== 'flight' ? Math.PI / 2 : 0, entry.yaw, 0));
    this.write(entry, at, this.turn);
  }
  protected override dropLive(l: Live): void { this.drawn.delete(l); }
}

/**
 * The lightweight match's throwables (a browser adaptation for the Xbox class; no original). OTHER players' grenades,
 * charges and launched rounds as the room tells them -- flown by the shared rules, drawn as their models, bouncing and
 * going off through the map's own effect animations (`./walkingEffects`) with their sounds and the camera's shake by
 * the distance. And the page's OWN: the kit's three equipment slots (`../matchThrow` `spawnEquipment`), the trigger's
 * wind-up and release with an item up, the throw's clip on the body (`../throwPose`), the room told the item in the
 * hand, the release request and the throw (`../net/throwWire`), a stale throw given back.
 *
 * R2 steps through the kit's items one press a step -- `GrenadeCore.cycleInventory`, the viewer's own stand-in before
 * the R2 inventory menu was built (`../inventoryMenu`'s header); the menu itself is not drawn here.
 *
 * The held throw's arc is written into the effects' triangle stream (`writeArc`).
 *
 * The item up is drawn in the right hand (`placeHand`); the R2 inventory is `./walkingMenus`'.
 *
 * The rocket launchers are raised from their slot and fired with the trigger (`../rocket`), their rockets flown here.
 *
 * NOT HERE YET (reported in `report().unsupported`): the launcher drawn in the hand and on the back, scorches, a joiner's catch-up
 * of projectiles already in the air.
 */
export function walkingGrenades(d: {
  table: KitTable | null; models: readonly string[];
  grid(): Grid | null; hull(): Grid | null; snapshot(): PlaySnapshot | null; view(): WalkView; feet(): V3 | null; dead(): boolean;
  fly: Pick<FlyCamera, 'shakeScreen'>; effects: WalkingEffects | null;
  sound(name: string, at: readonly [number, number, number]): void;
  ownId(): number;
  /** The page's own throws; absent (a test of the others' alone), none can be asked. */
  own?: {
    play: Pick<Play, 'partPoint'> & Partial<Pick<Play, 'setItemRaise' | 'setRifleStowed' | 'weaponStats'>>;
    walk: Pick<WalkMode, 'hold' | 'fireAim' | 'fireAllowed' | 'mode'> & Partial<Pick<WalkMode, 'launcherRaised' | 'launcherLowered' | 'launcherCleared' | 'onLauncherStickLower'>>; pose: ThrowPose;
    /** The firearm in the hand's name (the room hears it at the launcher's lower), the view back to first person, a launch's report. */
    firearmName?(): string; zoomOne?(): void; report?(name: string, at: [number, number, number]): void;
    client(): NetClient | null; loadout(): Loadout; pistol(): boolean; viewState(): number;
    /** The first command a `hand` event may be named at (`../net/firearmWire` `handSeq`: never before the held press rounds). */
    handSeq(seq: number): number;
    /** The firearm's trigger let go at a slot change. */
    suspendFirearm(): void;
    /** The drawn body's right hand in the world, or null when the body is not drawn (first person, a scope). */
    hand(): Matrix4 | null;
  };
}) {
  const byLower = new Map(d.models.map(name => [name.toLowerCase(), name]));
  const own = d.own ?? null;
  const core = new PlacedGrenades({ grid: d.grid, hullGrid: d.hull, snapshot: d.snapshot, view: d.view, listenerFeet: d.feet, dead: d.dead, online: () => true,
    ...(own ? { handPoint: (part: 'rhand' | 'lhand', p: V3) => own.play.partPoint(part, p), pistol: own.pistol, viewState: own.viewState,
      aim: () => own.walk.fireAim(), fireAllowed: () => own.walk.fireAllowed() } : {}) },
    name => byLower.get(name.toLowerCase()) ?? null);
  if (own) core.hand = own.hand;
  core.setRecords([...(d.table?.throwables?.values() ?? [])]);
  core.setRounds([...(d.table?.rounds.values() ?? [])]);
  // The game's own explosion animations where the map holds them; the core's placeholder sprites are not drawn here.
  core.setPlaceholderBurst(() => false);
  const place = (pos: readonly number[]) => ({ node: new Matrix4().makeTranslation(pos[0]!, pos[1]!, pos[2]!), position: [pos[0]!, pos[1]!, pos[2]!] as V3 });
  if (d.effects) core.setEffectPlayer((anim, at) => d.effects!.run(anim, { ...place(at.position), normal: at.normal ?? [0, 1, 0], velocity: at.velocity ?? [0, 0, 0] }));
  const counts = { launched: 0, bounces: 0, explosions: 0, shakes: 0, withoutAnimation: 0, thrown: 0, stale: 0, rockets: 0 };
  const offs = [
    core.on('bounce', info => {
      counts.bounces++;
      if (!info.sound) return;
      if (!d.effects?.play(info.anim, { ...place(info.pos), normal: [0, 1, 0], velocity: [0, 0, 0] })) d.sound(info.anim, info.pos);
    }),
    core.on('explode', info => {
      counts.explosions++;
      if (!info.byEffects) { counts.withoutAnimation++; d.sound(info.anim, info.pos); }
      const id = core.recordOf(info.item)?.id;
      if (info.distanceToPlayer !== null && !(id !== undefined && CAMERA_BLAST_EXEMPT_ITEMS.includes(id))) {
        const shake = explosionShake(info.distanceToPlayer); if (shake) { counts.shakes++; d.fly.shakeScreen(shake); }
      }
    }),
    core.on('remoteRelease', info => d.sound(info.fireAnim, info.from)),
    core.on('remoteLaunch', info => d.sound(info.fireAnim, info.from)),
  ];
  // ---- the page's own throws (`../matchThrow`'s wiring of the same events) ----
  const wire = new ThrowWire({ client: () => { const client = own?.client(); if (!client) throw new Error('Throw transport has no client'); return client; },
    staleThrow: (kind, slot, shot) => { counts.stale++; if (shot !== undefined) { rocket?.refund(shot); return; } if (slot === undefined) core.giveBack(kind); else core.giveBack(kind, slot); } });
  // M7 (`../rocket`, research 94 section C4): the LAW and the RPG-7 -- raised from their slot, fired with the trigger. The
  // launcher's model is not drawn in the hand or on the back here (the rocket in the air is); its muzzle is the eye.
  const rocket = own ? new RocketLauncher({ snapshot: d.snapshot, grid: d.grid, aim: () => own.walk.fireAim() as { eye: V3; far: V3 } | null }) : null;
  let firearmReadyAt = 0, launcherDown = false, launcherWaits = false;
  const raiseRefused = (): boolean => (own?.play.weaponStats?.().raise.weight ?? 1) < 1;
  const itemName = (id: number): string | null => d.table?.arsenal.items.get(id)?.name ?? throwableOf(d.table, id)?.name ?? null;
  const launcherSlot = (): number | null => { const up = rocket?.held() ?? null; if (up === null || !own) return null; const loadout = own.loadout(); return EQUIPMENT_SLOTS.find(slot => loadout[slot] === up) ?? null; };
  let startSeq: number | null = null, handTold: number | null = null, raisePhase = core.phase();
  const handItemId = (item: string | null): number | null => item === null ? null
    : core.recordOf(item)?.id ?? d.table?.arsenal.byName.get(item)?.id ?? (item === 'Detonator' ? 193 : null);
  /** ROOM-HAND (`../netPage` `handEvent`): the room told the item in the hand, its changes only. */
  const tellHand = (item: number | null): void => {
    const client = own?.client();
    if (!own || !client || client.state !== 'open' || client.role !== 'player' || item === handTold) return;
    client.send({ type: 'hand', seq: own.handSeq(client.lastSeq()), item }); handTold = item;
  };
  const releaseAnim = (fireAnim: string): string => muzzleAnimation(fireAnim, (own?.viewState() ?? 0) > 0) ?? fireAnim;   // PAR-77
  const kitNames = (): (string | null)[] => { const loadout = own!.loadout();
    return EQUIPMENT_SLOTS.map(slot => d.table?.arsenal.items.get(loadout[slot])?.name ?? throwableOf(null, loadout[slot])?.name ?? null); };
  if (own) {
    offs.push(
      core.on('equip', (on, item) => { own.suspendFirearm(); if (on) rocket?.lower(); if (!on) own.pose.letGo(); tellHand(on ? handItemId(item) : null); }),
      core.on('throwStart', ({ anim, hold, slot }) => {
        const held = own.walk.hold(hold); own.pose.start(anim, held);
        const up = core.held();
        startSeq = up !== null && handGrenade(core.recordOf(up)?.id) && own.client() ? wire.throwStartEvent(up, slot) : null;
      }),
      core.on('cut', () => { own.pose.cut(); startSeq = null; }),
      core.on('throw', info => {
        counts.thrown++; own.pose.released(); d.sound(releaseAnim(info.fireAnim), info.from);
        if (own.client()) wire.throwEvent(info.item, info.from, info.velocity, undefined, startSeq ?? undefined, info.slot);
        startSeq = null;
      }),
      core.on('place', info => { d.sound(releaseAnim(info.fireAnim), info.pos); if (own.client()) wire.throwEvent(info.item, info.pos, info.facing, info); }),
      core.on('detonate', info => { if (own.client()) wire.throwEvent('Detonator', info.from, [0, 0, 0]); }),
    );
    if (rocket) offs.push(
      rocket.on('equip', (on, id, by) => {
        own.suspendFirearm(); own.play.setRifleStowed?.(rocket.up()); launcherDown = launcherWaits = false;
        const from = own.pistol() ? 1 : 0;
        // PAR-83: the stick's lower rides the walk's own command, no event; else the room hears the item now in the hand.
        if (by === 'stick') firearmReadyAt = performance.now() + launcherMovingLowerSeconds(from) * 1000;
        else {
          const eye = own.walk.fireAim()?.eye ?? [0, 0, 0];
          if (own.client()) wire.throwEvent(on && id !== null ? itemName(id) ?? '' : own.firearmName?.() ?? '', eye, [0, 0, 0]);
          if (!on) firearmReadyAt = performance.now() + launcherLowerSeconds(from) * 1000;   // PF-21: the firearm fires again once the launcher is down
          if (on) own.walk.launcherRaised?.(from); else own.walk.launcherLowered?.(from);
        }
        if (on && own.viewState() > 1) own.zoomOne?.();
      }),
      rocket.on('launch', e => {
        counts.rockets++; core.launchRound(e.record, e.from, e.velocity);
        const shown = launchReportItem(e.record.id, own.loadout()), name = shown === null ? undefined : d.table?.arsenal.items.get(shown)?.name;
        if (name) own.report?.(name, e.from);
        d.sound(e.record.fireAnim, e.from);
        if (own.client()) wire.throwEvent(e.round.name, e.from, e.velocity, undefined, undefined, undefined, e.shot);
      }),
      own.walk.onLauncherStickLower?.(() => { rocket.lower('stick'); }) ?? (() => {}),
    );
    // NU-8a B1 (`../matchThrow`): the hand's item to the rifle's raise -- a hand grenade up with one left, its wind-up, the throw's pop.
    own.play.setItemRaise?.(() => {
      const held = core.held(), phase = core.phase();
      const pop = raisePhase === 'throwing' && phase !== 'throwing' && !d.dead();
      raisePhase = phase;
      return { grenade: held !== null && handGrenade(core.recordOf(held)?.id) && core.stats().left > 0, windUp: phase === 'holding', trigger: false, pop };
    });
  }
  const objects: SceneObject[] = [];
  const arcStyle = new EffectMeshStyle(null, false, false, true);
  let disposed = false;
  return {
    /** The live throwables' placements for this frame (`frame`), borrowed by the renderer. */
    objects,
    event(event: ServerEvent): void {
      if (disposed) return;
      if (event.type === 'grenade' && event.id !== d.ownId()) {
        const age = typeof event.age === 'number' && Number.isFinite(event.age) && event.age > 0 ? event.age : undefined;
        counts.launched++;
        core.launchRemote(event.kind as GrenadeItem, event.from, event.velocity, event.id, event.pid === undefined ? undefined : { pid: event.pid }, age);
      } else if (event.type === 'detonate') core.detonateRemote(event.pid);
      else if (event.type === 'chargeGone') core.removeRemote(event.pid);   // R4P-224: removed, no blast
      else if (event.type === 'sceneRound') core.fireScene(event.kind, event.at);
      else if (event.type === 'roundStart' || event.type === 'welcome') { core.clearAir(); core.clearRoundEffects(); if (event.type === 'welcome') handTold = null; }
      else if (event.type === 'placed') core.tagOwn(event.kind, event.from, event.pid);
      else if (event.type === 'stale' && event.request === 'throw') wire.stale(event.seq);
    },
    frame(dt: number, real: number): void {
      if (disposed) return;
      core.update(dt, real);
      if (rocket) {
        rocket.update(dt);
        // LATER 192: a launcher's held trigger the raise or the clip's NoFire refused is asked again each frame; let go once it is not up or the body is dead.
        if (!rocket.up() || d.dead()) launcherDown = launcherWaits = false;
        else if (launcherDown && launcherWaits && !raiseRefused() && own!.walk.fireAllowed()) { launcherWaits = false; rocket.pull(); }
      }
      objects.length = 0; core.objects(objects);
    },
    /** The page's own spawn: the loadout's three equipment slots on the kit, full (`../matchThrow` `spawnEquipment`); nothing in the hand, nothing pending. */
    spawn(): void {
      if (disposed || !own) return;
      core.setRecords([...(d.table?.throwables?.values() ?? [])]);
      core.setKit(kitNames()); core.refill(); wire.clearPending(); startSeq = null; handTold = null; raisePhase = core.phase();
      rocket?.setKit(d.table, own.loadout(), new KitRounds(d.table, own.loadout())); own.walk.launcherCleared?.(); own.play.setRifleStowed?.(false);
      firearmReadyAt = 0; launcherDown = launcherWaits = false;
    },
    /** The kit's slots changed without a spawn (`takeEquipmentKit`): what is left in the rings is kept. */
    kitChanged(): void { if (!disposed && own) { core.setRecords([...(d.table?.throwables?.values() ?? [])]); core.takeKit(kitNames()); rocket?.setKit(d.table, own.loadout(), new KitRounds(d.table, own.loadout())); } },
    /** An item or a launcher is up: the trigger is its, not the firearm's. */
    equipped: () => core.equipped() || !!rocket?.up(),
    /** SWAP-FIRE: the item up in the hand's `ID` (a throwable, a charge, the Detonator; `../matchThrow` `handItem`), null with none or a launcher up. */
    handItem: (): number | null => !disposed && core.equipped() && !rocket?.up() ? handItemId(core.held()) : null,
    /** The firearm still coming back up after a launcher's lower (`launcherLowerSeconds`, PF-21): its trigger waits. */
    firearmWaits: () => performance.now() < firearmReadyAt,
    /** The trigger with an item up: the wind-up while held, the throw at the let-go. */
    trigger(on: boolean): void {
      if (disposed || !own) return;
      if (rocket?.up()) {                                 // M7: the launcher's trigger, a rocket a pull
        launcherDown = on; launcherWaits = on && (raiseRefused() || !own.walk.fireAllowed());
        if (on && !launcherWaits) rocket.pull();
        return;
      }
      if (on) core.pull(); else core.release();
    },
    /** The input closed under a held wind-up (focus lost, a round screen): no throw is made of it (`GrenadeCore.cancelMenuHold`). */
    cancelHold(): void { if (!disposed) core.cancelMenuHold(); },
    /** R2: the next item of the kit that can be taken up, or back to the firearm (`GrenadeCore.cycleInventory`). */
    cycle(): string { return disposed || !own || own.walk.mode() !== 'walk' ? 'rifle' : core.cycleInventory(); },
    /** A shoulder's firearm asked: the item goes away first. */
    putAway(): void { if (disposed || !own) return; rocket?.lower(); if (core.equipped() && core.phase() !== 'throwing') core.select('rifle'); },
    /** The body's throw clip came off (`WalkMode.onActionEnd`, `throwPoseEnds`). */
    noteHoldEnd(reason: Parameters<GrenadeCore['noteHoldEnd']>[0]): void { if (!disposed) core.noteHoldEnd(reason); },
    /** The kit as the R2 inventory asks it (`./walkingMenus`; `../matchThrow`'s host rules on the same core). */
    kit: {
      takeable: (slot: 1 | 2 | 3 | 'detonator') => core.takeable(slot), hasDetonator: () => core.hasDetonator(), heldSlot: () => core.heldSlot(),
      held: (): string | null => core.held(), phase: (): string => core.phase(), magazineOf: (slot: number) => core.magazineOf(slot),
      left: (item: string): number => (core.stats().leftByItem as Record<string, number | undefined>)[item] ?? 0,
      // `../matchThrow` `selectEquipment`: a rocket launcher's slot first (the launcher raised from the firearm in hand), else the throwable or charge.
      selectEquipment: (slot: 1 | 2 | 3): boolean => {
        if (disposed || !own || own.walk.mode() !== 'walk' || core.phase() === 'throwing') return false;
        if (rocket?.selectSlot(slot, own.pistol() ? 1 : 0)) { if (core.equipped()) core.select('rifle'); return true; }
        return core.selectEquipment(slot);
      },
      selectDetonator: (): boolean => { if (disposed || !own || core.phase() === 'throwing') return false; rocket?.lower(); return core.select('Detonator'); },
      putAway: (): void => { if (disposed || !own) return; rocket?.lower(); if (core.equipped() && core.phase() !== 'throwing') core.select('rifle'); },
      launcherRounds: (id: number): number => rocket?.roundsFor(id) ?? 0, wadingDepth: (): number => rocket?.wadingDepth() ?? 0, launcherSlot,
    },
    /** The HUD's weapon box while an item is up: its icon and how many are left; null with the firearm in the hand. */
    box(): { icon: string; rounds: number; capacity: number } | null {
      const up = rocket?.held() ?? null;
      if (up !== null && rocket) { const rounds = rocket.roundsFor(up); return { icon: rocket.icon() ?? '', rounds, capacity: rounds }; }
      if (!core.equipped()) return null;
      const s = core.stats(), mag = s.slot === null ? null : core.magazineOf(s.slot);
      return { icon: core.icon() ?? '', rounds: mag?.rounds ?? s.left, capacity: mag?.capacity ?? (s.held === 'Detonator' ? s.left : s.record.capacity) };
    },
    /**
     * The held throw's arc into the frame's triangle stream (`./walkingEffects` `update`'s writer): the game's line strip
     * (`FUN_005970b0`; `../grenade` draws it one pixel wide) as a ribbon turned to the camera, about a pixel and a half
     * across at the PS2 frame's height -- a browser adaptation: this pass draws triangles only.
     */
    writeArc(frame: EffectMeshFrame, camera: PerspectiveCamera): void {
      const arc = core.arcNow; if (disposed || !arc) return;
      const n = Math.min(arc.alphas.length, arc.points.length - 1), at = frame.take(arcStyle, n * 4, n * 6); if (!at) return;
      const eye = camera.position, pixel = Math.tan((camera.fov * Math.PI) / 360) * 2 / 448 * 0.75, [r, g, b] = arc.color, out = frame.vertices;
      for (let i = 0; i < n; i++) {
        const p = arc.points[i]!, q = arc.points[i + 1]!, a = arc.alphas[i]!;
        const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], ex = eye.x - p[0], ey = eye.y - p[1], ez = eye.z - p[2];
        let sx = dy * ez - dz * ey, sy = dz * ex - dx * ez, sz = dx * ey - dy * ex;
        const length = Math.hypot(sx, sy, sz) || 1, half = Math.hypot(ex, ey, ez) * pixel;
        sx *= half / length; sy *= half / length; sz *= half / length;
        const corners = [[p[0] - sx, p[1] - sy, p[2] - sz], [p[0] + sx, p[1] + sy, p[2] + sz], [q[0] + sx, q[1] + sy, q[2] + sz], [q[0] - sx, q[1] - sy, q[2] - sz]];
        for (let k = 0; k < 4; k++) { const o = (at.vertex + i * 4 + k) * 9, c = corners[k]!;
          out[o] = c[0]!; out[o + 1] = c[1]!; out[o + 2] = c[2]!; out[o + 3] = 0; out[o + 4] = 0; out[o + 5] = r; out[o + 6] = g; out[o + 7] = b; out[o + 8] = a; }
        const v = at.vertex + i * 4, x = at.index + i * 6;
        frame.indices[x] = v; frame.indices[x + 1] = v + 1; frame.indices[x + 2] = v + 2; frame.indices[x + 3] = v; frame.indices[x + 4] = v + 2; frame.indices[x + 5] = v + 3;
      }
    },
    report() { const s = core.stats(); return { ...counts, shown: core.shown(), missingModels: core.missingModels, held: core.held(), phase: core.phase(), left: s.left, arcSegments: core.arcNow?.alphas.length ?? 0,
      launcher: rocket?.held() ?? null,
      unsupported: ['the launcher drawn in the hand and on the back (its muzzle is the eye)', 'scorches', 'projectiles already in the air at a join'] }; },
    dispose(): void { if (disposed) return; disposed = true; for (const off of offs) off(); core.reset(); objects.length = 0; },
  };
}
