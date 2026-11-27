import { Group } from 'three';
import { SEAL_TUNING, tracerRound, type Loadout, type TracerKind } from '@s2u/scene';
import { Accuracy, defaultFireMode, itemReticleOf, fireInterval, kickStarts, kickTicks, lookRates, nextFireMode, perturb, roundsPerPull } from '../accuracy';
import type { FlyCamera } from '../camera';
import { FireCore, cameraAimCap, reloadEndOfBody, type FireEvent } from '../fireCore';
import { Kit, pressShoulder, SWAP_HELD_EDGE_READING, type Firearm } from '../kit';
import { firearmSlotPresent, heldWeaponModels, initialFirearmSlot, kitRecords, slotModel } from '../loadout';
import { pitchStickInView } from '../look';
import type { NetClient } from '../net/client';
import { FirearmWire } from '../net/firearmWire';
import { reloadInFlinch, type FlinchWindow } from '../net/flinchReload';
import { lookContextOf } from '../net/lookGate';
import type { ServerEvent } from '../net/protocol';
import type { Play } from '../play';
import { reloadHoldPeriod } from '../reloadClip';
import { reloadPopped, StillReloadLife } from '../stillReloadLife';
import type { WalkMode } from '../walk';
import { RAISE_TIMES } from '../weaponRaise';
import { shortTurn } from '../yaw';
import { eyeBob, fireRefused, reloadRefused, Zoom } from '../zoom';
import type { WalkingMap } from './runtimeAssets';

const slotOf = (item: Firearm): 0 | 1 => item === 'pistol' ? 1 : 0;
const itemOf = (slot: 0 | 1): Firearm => slot === 1 ? 'pistol' : 'rifle';

/** Experiment mounting adapter for the existing firearm simulation. This shares
 * FireCore, Kit, Play's raise/reload poses and the production transport; it adds no
 * weapon cadence, instant swap or replacement reload timer. The two firearms use
 * the shared view rules; equipment, mounted weapons and effects remain unmounted.
 */
export function prototypeCombat(d: {
  map: WalkingMap; walk: WalkMode; fly: FlyCamera; play: Play;
  loadout(): Loadout; client(): NetClient | null; online: boolean; enabled(): boolean;
  event(event: FireEvent): void;
  targetDistance?(eye: [number, number, number], direction: [number, number, number], reach: number): number | null;
  bodyDistances?(eye: [number, number, number], direction: [number, number, number], reach: number): number[];
  enemies?(): number;
  spawned?(): void;
  /** Whether the map's effects draw that travelling tracer (`./walkingEffects`); absent, none: no round is marked as one. */
  drawsTracer?(kind: TracerKind): boolean;
  /** SWAP-FIRE: the item up in the hand's `ID` -- a throwable, a charge, the Detonator -- or null (`../matchFirearm` `FirearmHands.handItem`); absent, none. */
  handItem?(): number | null;
}) {
  const { walk, fly, play } = d;
  let records = kitRecords(d.map.arsenal?.table ?? null, d.loadout());
  const modes: Record<Firearm, number> = { rifle: defaultFireMode(records[0]), pistol: defaultFireMode(records[1]) };
  let hand: Firearm = itemOf(initialFirearmSlot(d.map.arsenal?.table ?? null, d.loadout()));
  let mode = modes[hand], lastLook: { yaw: number; pitch: number } | null = null;
  const record = () => records[slotOf(hand)];
  const selectedRecord = () => records[slotOf(kit.state().swap?.to ?? hand)];
  const stillReload = new StillReloadLife();
  const counts = { rounds: 0, reloads: 0, staleFire: 0, staleReload: 0, serverAccepted: 0, serverRejected: 0, hits: 0 };
  let lastRejection: string | null = null;
  const accuracy = new Accuracy(record()), zoom = new Zoom(record());
  const baseFov = d.map.camera ? 2 * d.map.camera.vfov * 180 / Math.PI : 49;
  if (d.map.camera) accuracy.setFov({ hfov: d.map.camera.hfov, vfov: d.map.camera.vfov });
  zoom.setNight(!!d.map.night?.mission);
  let zoomTicks = -1, lastFov = baseFov;
  fly.setFov(baseFov);
  const setZoom = (state: number) => {
    const before = zoom.state(); zoom.set(state);
    if (before >= 4 && zoom.state() < 4) accuracy.leaveScope();
    accuracy.enterView(before, zoom.state());
  };
  const stepZoom = (how: 'in' | 'out' | 'cycle') => {
    if (!d.enabled() || walk.mode() !== 'walk' || walk.isDead()) return zoom.state();
    zoom.setHold('firearm');
    const before = zoom.state();
    if (how === 'in') zoom.zoomIn(); else if (how === 'out') zoom.zoomOut(); else zoom.cycle();
    if (before >= 4 && zoom.state() < 4) accuracy.leaveScope();
    accuracy.enterView(before, zoom.state()); return zoom.state();
  };
  const wire = new FirearmWire({
    client: () => { const client = d.client(); if (!client) throw new Error('Combat transport has no client'); return client; },
    sidearmId: () => records[1].id,
    pressWindow: until => fire.setPressWindow(until), staleRound: shot => { fire.refundRound(shot); },
    staleReload: reload => { fire.restoreReload(reload); },
  });
  const fire: FireCore = new FireCore({
    grid: () => walk.grid(), aim: () => walk.fireAim(), tickAim: at => walk.tickAim(at),
    roundSeq: own => d.client() ? wire.roundSeq(own) : null,
    startBody: () => walk.startBody(), muzzle: () => play.muzzle(),
    targetDistance: d.targetDistance, bodyDistances: d.bodyDistances,
    reloadSeconds: (family, seconds) => play.reloadSeconds(family ?? null, seconds ?? 0),
    aimCap: () => cameraAimCap(d.map.camera?.mid, zoom.renderView().farExtra), launchPoint: () => play.launchPoint(),
    look: () => walk.mode() === 'walk' ? { pitch: fly.pose().pitch * Math.PI / 180, stance: walk.posture(), pitchPush: fly.pitchPush() } : null,
    kickPitch: radians => fly.addPitch(radians),
    ready: (): boolean => d.enabled() && !kit.swapping() && !walk.isDead() && firearmSlotPresent(d.loadout(), slotOf(hand)),
    airborne: () => walk.mover()?.airborne ?? false,
    fireRefused: () => fireRefused(zoom.state()) || !walk.fireAllowed(), reloadRefused: () => reloadRefused(zoom.state()),
    raiseRefused: () => play.weaponStats().raise.weight < 1,
    inHand: () => true, itemUp: () => false, launcherUp: () => false,
    flinching: () => walk.flinching() || walk.knockCovered(), climbHolds: () => walk.climbHolds(),
    reloadCut: () => play.takeReloadCut(),
  }, record());
  // EFFECTS (`../matchFirearm`): every fourth round of a tracer weapon, drawn by the effects when the map holds its animation.
  if (d.drawsTracer) { fire.setTracerRule(tracerRound); fire.setTracerModel(kind => d.drawsTracer!(kind)); }
  fire.setGun({
    trigger: () => accuracy.trigger(), roundsPerPull: () => roundsPerPull(mode), interval: wait => fireInterval(wait, mode),
    round: direction => {
      const perturbed = perturb(direction, accuracy.cone(zoom.state(), zoom.magnification()));
      if (accuracy.round(zoom.state(), walk.posture()).dropZoom) {
        // MatchFirearm.dropScope: the second scoped round keeps the knock. Only
        // an explicit view step out uses leaveScope (research 233).
        const before = zoom.state(); zoom.set(1); accuracy.enterView(before, zoom.state());
      }
      return perturbed;
    },
    kickStarts: () => kickStarts(zoom.state(), accuracy.rounds()), kickTicks: () => kickTicks(zoom.state()),
  });
  const kitFree = (): boolean => d.enabled() && walk.mode() === 'walk' && !fire.state().magazine.reloading
    && play.triggerEdge() !== SWAP_HELD_EDGE_READING;
  const kit: Kit = new Kit({
    swapClip: to => walk.swapWeapon(to), swapProgress: () => walk.swapProgress(), canSwap: kitFree,
    item: item => {
      modes[hand] = mode; hand = item; mode = modes[item];
      fire.setWeapon(record()); accuracy.setWeapon(record()); zoom.setWeapon(record()); play.setItem(item);
    },
    started: to => {
      const replay = zoom.switchWeapon(records[slotOf(to)], 'firearm');
      if (replay.replayed) accuracy.undoViewTick();
      accuracy.applyViewPath(replay.path);
      accuracy.setWeapon(records[slotOf(to)]); stillReload.end();
    },
  });
  const weapons = { rifle: new Group(), pistol: new Group() };
  let names: { rifle: string | null; pistol: string | null } = { rifle: null, pistol: null };
  const hang = () => {
    const table = d.map.arsenal?.table ?? null, loadout = d.loadout();
    names = { rifle: slotModel(table, loadout, 0), pistol: slotModel(table, loadout, 1) };
    play.setWeapon(names.rifle ? weapons.rifle : null, names.rifle ? d.map.weaponPoints?.[names.rifle] ?? [] : []);
    play.setSidearm(names.pistol ? weapons.pistol : null, names.pistol ? d.map.weaponPoints?.[names.pistol] ?? [] : []);
  };
  play.setWeaponInput(() => ({ trigger: fire.triggerHeld(), aiming: walk.view() === 'scope', enemies: d.enemies?.() ?? 0, gated: !d.enabled() }));
  walk.setRaiseSource(() => play.raisedUp()); walk.setReloadLock(command => fire.reloadLocked(command));
  walk.setStillClip(stillReload); walk.setLookContext(weapon => lookContextOf(records[weapon]));
  const offs = [
    fire.subscribe(event => {
      if (event.type === 'round') counts.rounds++;
      if (event.type === 'reloadStart') counts.reloads++;
      if (event.type === 'reloadEnd') { if (event.kept) stillReload.keep(); else if (!event.completed) stillReload.end(); }
      else if (event.type === 'reloadResume') stillReload.resume();
      else if (event.type === 'reloadStart' || event.type === 'afterShot') {
        const source = play.motionSource(), snapshot = walk.snapshot();
        stillReload.start(source?.clips ?? null, source?.table ?? null, walk.posture(), snapshot ? [snapshot.vx, snapshot.vy, snapshot.vz] : [0, 0, 0],
          event.family ?? play.weaponStats().item, event.seconds, walk.ticks());
      }
      play.weaponEvent(event); d.event(event);
      if (d.client()) wire.fireEvent(event);
      if (event.type === 'reloadStart' || event.type === 'afterShot') walk.holdReload(reloadHoldPeriod(event.family, event.seconds));
    }),
    walk.onActionEnd(event => { const reason = reloadEndOfBody(event); if (reason) fire.cancelReload(reason); }),
    walk.onStackPop((pop, count) => reloadPopped(pop, fire, stillReload, count)),
  ];
  const spawn = () => {
    modes[hand] = mode;
    const previous = records; records = kitRecords(d.map.arsenal?.table ?? null, d.loadout());
    if (records[0].id !== previous[0].id) modes.rifle = defaultFireMode(records[0]);
    if (records[1].id !== previous[1].id) modes.pistol = defaultFireMode(records[1]);
    walk.setHeldModels(heldWeaponModels(d.map.arsenal?.table ?? null, d.loadout()));
    kit.reset(); hand = itemOf(initialFirearmSlot(d.map.arsenal?.table ?? null, d.loadout())); kit.place(hand);
    mode = modes[hand]; walk.placeFirearm(slotOf(hand)); fire.setWeapon(record()); fire.refill(); fire.release(); wire.clearPending();
    accuracy.setWeapon(record()); accuracy.reset(); zoom.respawn(record()); lastLook = null; stillReload.end();
    play.respawn(); play.setItem(hand); play.setMounts(kit.state().mounts); hang();
    d.spawned?.();
  };
  spawn();
  return {
    fire, accuracy, kit, zoom, hang, spawn, setZoom, stepZoom,
    switchFireMode() {
      if (d.enabled() && !walk.isDead()) {
        mode = nextFireMode(record(), mode, zoom.target() > 1.01, []); modes[hand] = mode;
      }
      return mode;
    },
    trigger(on: boolean) { if (on && d.enabled()) fire.pull(); else fire.release(); },
    reload() { if (d.enabled()) fire.reload(); },
    select(to: Firearm) {
      return pressShoulder({ gate: () => kitFree() && !kit.swapping() && walk.swapGate() && firearmSlotPresent(d.loadout(), slotOf(to)),
        putAway() {}, take: () => kit.select(to) });
    },
    beforeMove() {
      if (!d.enabled()) { fire.release(); wire.clearPending(); }
      const walking = walk.mode() === 'walk';
      walk.setScoped(walking && zoom.lens()); walk.setScopedMove(walking && zoom.moveScale() < 1);
      walk.setBinoculars(walking && zoom.binoculars());
      fly.setBody(walking && eyeBob(zoom.state()), walk.posture() === 'prone');
      const held = fire.triggerHeld(); walk.setTrigger(held); wire.setTrigger(held); d.client()?.beginFrame?.();
    },
    poseFrame(dt: number) {
      if (walk.ticks() !== zoomTicks) { zoomTicks = walk.ticks(); zoom.markTick(); accuracy.markViewTick(); }
      const snapshot = walk.mode() === 'walk' && !walk.isDead() ? walk.snapshot() : null;
      accuracy.setWeapon(selectedRecord());
      // SWAP-FIRE (BLOOM-SWAP, research 321 section 3.4, as `../matchFirearm` `gunFrame`): the kit's tick runs the selected
      // slot's item (`FUN_005c2670` D:L477280) -- a grenade, a charge or the Detonator up closes the size at its own
      // TargetConstrict to 0 (D:L477282-477288). Named before this frame's `accuracy.update`.
      accuracy.setItem(itemReticleOf(d.map.arsenal?.table ?? null, d.handItem?.() ?? null));
      if (snapshot) {
        const look = fly.pose(), rates = lastLook ? lookRates(shortTurn(lastLook.yaw, look.yaw), look.pitch - lastLook.pitch, dt) : { yawRate: 0, pitchRate: 0 };
        lastLook = { yaw: look.yaw, pitch: look.pitch };
        const wish = fly.groundWish(), slow = zoom.moveScale();
        accuracy.update(dt, { stance: snapshot.stance, rawStance: walk.stance(), velocity: [snapshot.vx, snapshot.vy, snapshot.vz],
          airborne: snapshot.airborne, ...rates, zoomState: zoom.state(),
          sticks: { forward: wish.forward * slow, right: wish.right * slow, turn: rates.yawRate / SEAL_TUNING.turnMaxRate, pitch: pitchStickInView(rates.pitchRate, zoom) } });
      } else {
        if (zoom.state() !== 0) { zoom.reset(); accuracy.leaveScope(); }
        lastLook = null;
      }
      zoom.update(dt);
      const fov = zoom.fov(baseFov);
      if (Math.abs(fov - lastFov) > 1e-6) { fly.setFov(fov); lastFov = fov; }
      fly.setZoom(1 / zoom.lookScale() / (zoom.state() === 4 ? 5 : 1), zoom.state() === 4);
      fly.setKitOffset(...accuracy.viewOffset(zoom.state()));
      if (walk.mode() === 'walk') kit.frame(dt); else kit.settle();
      play.setMounts(kit.state().mounts); play.setRaiseTimes(RAISE_TIMES);
    },
    fireFrame(dt: number) {
      if (!d.enabled() || walk.isDead()) fire.release();
      const held = fire.triggerHeld(); walk.setTrigger(held); wire.setTrigger(held);
      if (d.client()) wire.flushPressRounds();
      fire.update(dt);
    },
    event(event: ServerEvent) {
      if (event.type === 'welcome') fire.setNetRefill({ respawn: event.rules === 'respawn' });
      if (event.type === 'kill' && event.victim === d.client()?.id) { zoom.reset(); accuracy.leaveScope(); }
      if (event.type === 'stale' && (event.request === 'fire' || event.request === 'reload')) {
        if (event.request === 'fire') counts.staleFire++; else counts.staleReload++;
        wire.stale(event.request, event.seq);
      }
      if (event.type === 'impact' && event.id === d.client()?.id) counts.hits++;
      if (event.type === 'combat' && event.request === 'fire' && (event.attacker?.id === d.client()?.id || event.status === 'rejected' && event.attacker === null)) {
        if (event.status === 'rejected') { counts.serverRejected++; lastRejection = event.reason; }
        else counts.serverAccepted++;
      }
      if (event.type === 'blast' && event.knock?.fall === 'proneCover' && wire.reloadSeq !== null && wire.reloadSeq > event.after) fire.undoReload();
      if (event.type === 'kit') {
        const previous = records; records = kitRecords(d.map.arsenal?.table ?? null, d.loadout());
        for (const slot of [0, 1] as const) {
          const changed = records[slot].id !== previous[slot].id;
          if (changed) modes[itemOf(slot)] = defaultFireMode(records[slot]);
          fire.setRing(records[slot], event.rounds[slot], changed ? previous[slot].name : undefined, event.filled?.[slot]);
        }
        fire.setWeapon(record()); mode = modes[hand]; hang();
      }
    },
    flinch(window: FlinchWindow) { if (reloadInFlinch(wire.reloadSeq, window)) fire.undoReload(); },
    state() { return { weapon: slotOf(hand), record: record(), state: fire.state(), mode }; },
    report() { return { weapon: slotOf(hand), weaponId: record().id, weaponName: record().name, mode,
      magazine: fire.state().magazine, held: fire.triggerHeld(), raise: play.weaponStats().raise, swap: kit.state().swap,
      zoom: { state: zoom.state(), target: zoom.target(), magnification: zoom.magnification() },
      counts: { ...counts }, lastRejection }; },
    /** The drawn weapon's node (in its body's frame, as `held`) and its `firepoint` in it, for the round's muzzle animation; null when none is in hand. */
    weaponFrame() {
      const name = names[hand], object = weapons[hand];
      if (!name || !object.visible || !play.weaponStats().held) return null;
      const point = (d.map.weaponPoints?.[name] ?? []).find(p => p.name === 'firepoint' || p.name === 'firepont');
      return { object, muzzle: point ? [point.at[0], point.at[1], point.at[2]] as [number, number, number] : null };
    },
    /** The first command a `hand` event may be named at (`FirearmWire.handSeq`: never before this client's held press rounds). */
    handSeq(seq: number) { const client = d.client(); return client ? wire.handSeq(client, seq) : seq; },
    /** `FUN_005a8cb0` whole (`../matchThrow` `kitChangeGate`): the page's half, no swap playing, the mover's half. */
    kitChangeGate() { return kitFree() && !kit.swapping() && walk.swapGate(); },
    records() { return records; },
    selected() { return { record: selectedRecord(), mode: modes[kit.state().swap?.to ?? hand] }; },
    held() {
      return (['rifle', 'pistol'] as const).flatMap(item => {
        const name = names[item], object = weapons[item];
        return name && object.visible ? [{ name, matrix: Float32Array.from(object.matrix.elements) }] : [];
      });
    },
    dispose() {
      for (const off of offs) off(); fire.dispose(); wire.clearPending();
      walk.setStillClip(null); walk.setRaiseSource(null); walk.setLookContext(null); walk.setReloadLock(null);
      play.setWeapon(null, []); play.setSidearm(null, []);
    },
  };
}
