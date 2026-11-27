import { Group, type PerspectiveCamera } from 'three';
import { GAME_FRAME_DT, probeGround, selectFloor, type Grid, type Loadout } from '@s2u/scene';
import { BinocularPose } from '../binocularPose';
import { ThrowPose } from '../throwPose';
import { bodySkeleton, Play, type PlayClips } from '../play';
import { probeLiftOf } from '../mover';
import { snapshotOf } from '../net/body';
import { JOIN_STATE_VERSION, TICK_HZ, type Rules, type ServerEvent, type Team } from '../net/protocol';
import { corpseShownS } from '../net/deaths';
import type { SpawnedBodyState } from '../remotePlayers';
import { bodyVolumes, stanceVolumes, type StanceVolumes } from '../net/hitVolumes';
import { HIT_POSE_MOUNT_READING } from '../net/hitPose';
import { slotModel } from '../loadout';
import { deathPose } from '../motionPose';
import { LANDING_CLIP_ACTIONS, REMOTE_RESPAWN_REBUILD_READING, remoteBodyAction, remoteLauncherInHand, remoteTiltStep, stepFlinch, pushOver } from '../remotePoseRules';
import { remoteFootfall, remoteKitOf, footfallsHeard, type RemoteStep } from '../remotePresentation';
import { rootTiltStart, type RootTiltState } from '../rootTilt';
import { IDLE_CLIPS } from '../simMap';
import { leanClip } from '../traversal';
import type { ReloadItem } from '../reloadClip';
import type { BodyRig, WalkingMap } from './runtimeAssets';
import { prototypePlayBody } from './playBody';
import { prototypeTargets } from './targets';
import type { SceneFrame } from './sceneFrame';

type Snapshot = ReturnType<typeof snapshotOf>;
type Remote = {
  model: number; view: ReturnType<typeof prototypePlayBody>; play: Play; snap: Snapshot | null;
  weapons: { rifle: Group; pistol: Group }; names: { rifle: string | null; pistol: string | null };
  binocs: BinocularPose; hands: ThrowPose; spawns?: number; deadFor: number; fadeAge: number; deathClip: string | null;
  flinch: { clip: string; t: number; pushed?: true } | null; under?: { clip: string; t: number } | null; coverLand?: number | null;
  tilt?: { acc: number; state: RootTiltState; normal: [number, number, number] };
  launcher: number | null;
};
const reloadFamilies = new Set<ReloadItem>(['rifle', 'pistol', 'shotgun', 'pump', 'm203']);
const NO_ITEM = 255;

/** The production remote body's Play/WeaponPose/raise/hand layers on a raw CPU
 * view. Body appearance remains the experiment's two base team rigs. Hostages
 * require their own rigs and are explicitly excluded, never replaced by a SEAL.
 * Mounted aim uses production stance volumes (HIT_POSE_MOUNT_READING); turret
 * presentation remains an outstanding match feature.
 */
export function prototypeRemotes(d: {
  map: WalkingMap; models: readonly BodyRig[]; clips: PlayClips;
  ownId(): number; team(id: number): Team | null; kit(id: number, team: Team | null): Loadout;
  setKit(id: number, kit: Loadout): void;
  grid(): Grid | null;
  step(id: number, event: RemoteStep, feet: [number, number, number], yaw: number): void;
}) {
  const remotes = new Map<number, Remote>(), targets = prototypeTargets();
  const dead = new Map<number, { clip: string | null; age: number }>(), ghosts = new Set<number>(), hostages = new Set<number>();
  const turrets = new Map<number, number | null>(), victories = new Map<number, { serial: number; clip: string; elapsed: number }>();
  const idle = new Map<number, StanceVolumes>(), seen = new Set<number>();
  const gear = new Map<number, Map<string, boolean>>();
  let heard: Set<number> | null = null;
  let rules: Rules = 'classic';
  const mounted = (id: number) => [...turrets.values()].includes(id);
  /** Protocol 9: the character type each body was rebuilt as (`welcome.players[].char`, `spawn.char`); absent, the side's first. */
  const chars = new Map<number, number>();
  const modelFor = (id: number) => {
    const team = d.team(id), base = team === 'terrorist' && d.models.length > 1 ? 1 : 0;
    const typed = team ? d.map.typeModels?.[team][chars.get(id) ?? 0] : undefined;
    return typed !== undefined && typed < d.models.length ? typed : base;
  };
  const hang = (id: number, remote: Remote) => {
    const kit = d.kit(id, d.team(id)), table = d.map.arsenal?.table ?? null;
    const names = { rifle: slotModel(table, kit, 0), pistol: slotModel(table, kit, 1) };
    for (const item of ['rifle', 'pistol'] as const) if (names[item] !== remote.names[item]) {
      const name = names[item], points = name ? d.map.weaponPoints?.[name] ?? [] : [];
      if (item === 'rifle') remote.play.setWeapon(name ? remote.weapons[item] : null, points);
      else remote.play.setSidearm(name ? remote.weapons[item] : null, points);
    }
    remote.names = names;
  };
  const make = (id: number): Remote => {
    const model = modelFor(id), body = d.models[model]!, view = prototypePlayBody(body), play = new Play();
    play.setBody(view, body); play.setClips(d.clips); play.setFlyToggle(true);
    for (const [name, on] of gear.get(id) ?? []) play.setGearVisible(name, on);
    const remote: Remote = { model, view, play, snap: null, weapons: { rifle: new Group(), pistol: new Group() },
      names: { rifle: null, pistol: null }, binocs: new BinocularPose(() => play.motionSource()), hands: new ThrowPose(() => play.motionSource()),
      deadFor: dead.get(id)?.age ?? 0, fadeAge: dead.get(id)?.age ?? 0, deathClip: dead.get(id)?.clip ?? null, flinch: null, launcher: null };
    play.addPoseLayer(remote.binocs.layer); play.addPoseLayer(remote.hands.layer);
    play.setWeaponInput(() => ({ trigger: remote.snap?.trigger ?? false, aiming: remote.snap?.aiming ?? false, raised: remote.snap?.raised ?? false }));
    play.onEvent(event => {
      if (!remote.snap?.alive || (heard && !heard.has(id))) return;
      const step = remoteFootfall(event, remote.snap); if (step) d.step(id, step, remote.snap.feet, remote.snap.yaw);
    });
    hang(id, remote); remotes.set(id, remote); return remote;
  };
  const volumes = (model: number) => {
    let value = idle.get(model);
    if (!value) {
      const clip = (name: string) => d.clips.clips.find(item => item.name === name) ?? null;
      const leans = (stance: 'stand' | 'crouch' | 'prone') => ({ l: clip(leanClip(stance, -1)), r: clip(leanClip(stance, 1)) });
      value = stanceVolumes({ skeleton: bodySkeleton(d.models[model]!),
        idles: { stand: clip(IDLE_CLIPS.stand), crouch: clip(IDLE_CLIPS.crouch), prone: clip(IDLE_CLIPS.prone) },
        leans: { stand: leans('stand'), crouch: leans('crouch'), prone: leans('prone') } }); idle.set(model, value);
    }
    return value;
  };
  const remove = (id: number) => { const remote = remotes.get(id); remote?.play.setBody(null, null); remote?.play.setClips(null); remotes.delete(id); targets.delete(id); };
  const clear = () => {
    for (const id of remotes.keys()) remove(id);
    dead.clear(); ghosts.clear(); hostages.clear(); turrets.clear(); victories.clear(); targets.clear(); idle.clear(); seen.clear(); gear.clear();
  };
  return {
    targets,
    /** Carrier state can precede a peer's first pose or replacement team rig. */
    setGearVisible(id: number, name: string, on: boolean) {
      let values = gear.get(id); if (!values) { values = new Map(); gear.set(id, values); }
      values.set(name, on); remotes.get(id)?.play.setGearVisible(name, on);
    },
    root(id: number) { return remotes.get(id)?.play.rootY() ?? null; },
    muzzle(id: number) { return remotes.get(id)?.play.muzzle() ?? null; },
    /** A body's drawn weapon node (in the body's frame) and its `firepoint` in it (`../remotePlayers` `weaponFrame`), or null. */
    weaponFrame(id: number) {
      const remote = remotes.get(id); if (!remote || !remote.view.group.visible) return null;
      const item = remote.play.weaponStats().item === 'pistol' ? 'pistol' : 'rifle', name = remote.names[item];
      if (!name) return null;
      const point = (d.map.weaponPoints?.[name] ?? []).find(p => p.name === 'firepoint' || p.name === 'firepont');
      return { object: remote.weapons[item], muzzle: point ? [point.at[0], point.at[1], point.at[2]] as [number, number, number] : null };
    },
    /** The uploaded model a seat's body draws with (its side's character type). */
    modelOf: (id: number) => modelFor(id),
    /**
     * XBOX-TAGS-FEED (OT.R148): `../remotePlayers` `headAt`'s point for the standard tag input (`../hudTags`
     * `TeamTagRemotes`) -- the drawn body's `head` node in world space, null for no body or one not drawn.
     */
    headAt(id: number): [number, number, number] | null {
      const remote = remotes.get(id);
      return remote && remote.view.group.visible ? remote.play.nodeWorld('head') : null;
    },
    /** XBOX-TAGS-FEED: `../remotePlayers` `deathAge` -- the real seconds since the body was drawn dead, null alive or with none. */
    deathAge(id: number): number | null {
      const remote = remotes.get(id);
      return remote?.snap && !remote.snap.alive ? remote.fadeAge : null;
    },
    report() { return { players: remotes.size, models: [...new Set([...remotes.values()].map(remote => remote.model))].sort((a, b) => a - b), unsupportedHostages: [...hostages], mountedIdleTargets: [...turrets.values()].filter(id => id !== null) }; },
    event(event: ServerEvent) {
      if (event.type === 'spawn' && event.char !== undefined) chars.set(event.id, event.char);
      if (event.type === 'welcome') {
        clear(); chars.clear(); for (const player of event.players ?? []) if (player.char !== undefined) chars.set(player.id, player.char);
        if (event.char !== undefined) chars.set(event.id, event.char);   // N-07: the own seat's type, outside `players`
        rules = event.rules; for (const hostage of event.hostages ?? []) hostages.add(hostage.id);
        for (const turret of event.turrets ?? []) turrets.set(turret.id, turret.occupant);
        if (event.join?.v === JOIN_STATE_VERSION) {
          for (const corpse of event.join.corpses) dead.set(corpse.id, { clip: corpse.clip, age: Math.max(0, corpse.age) / TICK_HZ });
          for (const id of event.join.ghosts) ghosts.add(id);
        }
      } else if (event.type === 'left') { chars.delete(event.id); remove(event.id); dead.delete(event.id); ghosts.delete(event.id); victories.delete(event.id); gear.delete(event.id); }
      else if (event.type === 'kill') {
        dead.set(event.victim, { clip: event.clip, age: 0 }); ghosts.delete(event.victim);
        const remote = remotes.get(event.victim);
        if (remote) { remote.deathClip = event.clip; remote.deadFor = 0; remote.fadeAge = 0; remote.flinch = null; remote.under = null; remote.play.stopRemoteReload('death'); }
      } else if (event.type === 'reloadSound') {
        const remote = remotes.get(event.id);
        if (remote && remote.snap?.alive !== false && event.seconds !== undefined && event.seconds > 0) {
          const posture = event.posture === 'stand' || event.posture === 'crouch' || event.posture === 'prone' ? event.posture : null;
          remote.play.remoteReload(posture, event.seconds, event.family && reloadFamilies.has(event.family) ? event.family : null, event.moving === true);
        }
      } else if (event.type === 'flinch') {
        const remote = remotes.get(event.id);
        if (remote && remote.snap?.alive !== false) { remote.flinch = { clip: event.clip, t: 0 }; remote.under = null; remote.play.stopRemoteReload('flinch'); }
      } else if (event.type === 'motion') {
        const remote = remotes.get(event.id), action = remote?.snap?.action;
        if (remote && remote.snap?.alive !== false) pushOver(remote, event.clip,
          action && LANDING_CLIP_ACTIONS.has(action.name) ? action.serial : null);
      } else if (event.type === 'victory') {
        const remote = remotes.get(event.id);
        if (!event.clip) { victories.delete(event.id); remote?.play.stopVictory(); }
        else if (remote) remote.play.startVictory(event.serial, event.clip, event.elapsed);
        else victories.set(event.id, { serial: event.serial, clip: event.clip, elapsed: event.elapsed });
      } else if (event.type === 'turret') turrets.set(event.id, event.occupant);
    },
    frame(dt: number, bodies: readonly SpawnedBodyState[], camera: PerspectiveCamera, listener: readonly [number, number, number] | null, real = dt) {
      seen.clear(); const actors: SceneFrame['body'][] = [];
      heard = footfallsHeard(bodies.filter(body => !hostages.has(body.id) && body.id !== d.ownId()), listener);
      for (const victory of victories.values()) victory.elapsed += dt;
      for (const body of bodies) {
        if (body.id === d.ownId() || hostages.has(body.id)) continue;
        seen.add(body.id);
        let remote = remotes.get(body.id);
        if (remote && remote.model !== modelFor(body.id)) { remove(body.id); remote = undefined; }
        remote ??= make(body.id);
        const wasDead = remote.snap?.alive === false, first = remote.snap === null;
        const snapshot = snapshotOf(body); snapshot.action = remoteBodyAction(snapshot.action); remote.snap = snapshot;
        if (snapshot.alive) ghosts.delete(body.id); else if (first && !dead.has(body.id)) ghosts.add(body.id);
        const spawned = (body.spawns !== undefined && remote.spawns !== undefined && body.spawns !== remote.spawns)
          || (wasDead && snapshot.alive && REMOTE_RESPAWN_REBUILD_READING === 'rebuilt');
        remote.spawns = body.spawns;
        if (spawned) { remote.play.respawn(); remote.binocs.stop(); remote.hands.stop(); remote.flinch = null; remote.under = null; dead.delete(body.id); }
        if (snapshot.alive) { remote.deadFor = 0; remote.fadeAge = 0; if (wasDead) remote.deathClip = null; }
        else { remote.deadFor += dt; remote.fadeAge += real; }
        const mount = mounted(body.id);
        if (mount) { remote.flinch = null; remote.under = null; remote.coverLand = null; }
        stepFlinch(remote, snapshot, dt, d.clips);
        if (snapshot.alive && !mount) {
          const tilt = remote.tilt ??= { acc: 0, state: rootTiltStart(), normal: [0, 1, 0] };
          tilt.acc += Math.max(0, dt);
          // RemotePlayers.remoteTilt: same game-frame clock and bounded hitch handling.
          for (let n = 0; tilt.acc >= GAME_FRAME_DT - 1e-9 && n < 8; n++) {
            tilt.acc -= GAME_FRAME_DT;
            tilt.state = remoteTiltStep(tilt.state, snapshot, () => {
              const grid = d.grid(), [x, y, z] = snapshot.feet;
              const floor = grid ? selectFloor(probeGround(grid, x, z), y + probeLiftOf(snapshot.stance), y) : null;
              if (floor) tilt.normal = [floor.normal[0], floor.normal[1], floor.normal[2]];
              return tilt.normal;
            });
          }
          if (tilt.acc >= GAME_FRAME_DT) tilt.acc = 0;
          snapshot.rootTilt = tilt.state.q;
        }
        const victory = victories.get(body.id);
        if (victory) { remote.play.startVictory(victory.serial, victory.clip, victory.elapsed); victories.delete(body.id); }
        if (!snapshot.alive) { remote.play.stopVictory(); if (remote.deathClip) snapshot.traversal = deathPose(remote.deathClip, remote.deadFor, d.clips); }
        // RemotePlayers.frame, Protocol 7: the snapshot's held firearm can precede
        // the reliable pickup kit. A raised launcher never replaces a firearm.
        const known = d.kit(body.id, d.team(body.id));
        const launcherHand = remoteLauncherInHand(snapshot.item, snapshot.action, remote.launcher);
        if (snapshot.item !== NO_ITEM && launcherHand !== snapshot.item && known[snapshot.weapon] !== snapshot.item) {
          const next: [number, number, number, number, number] = [...known]; next[snapshot.weapon] = snapshot.item; d.setKit(body.id, next);
        }
        hang(body.id, remote);
        const kit = remoteKitOf(snapshot); remote.play.setItem(kit.item); remote.play.setMounts(kit.mounts);
        remote.launcher = launcherHand; remote.play.setRifleStowed(remote.launcher !== null);
        remote.binocs.update(dt, snapshot.alive && snapshot.binoculars, snapshot.stance, kit.item);
        if (snapshot.alive) remote.hands.follow(snapshot.hold ?? null, kit.item === 'pistol', snapshot.holdSerial);
        else { remote.hands.follow(null, false); remote.hands.stop(); }
        remote.hands.step(dt);
        remote.play.frame(dt, { snapshot: () => snapshot, view: () => 'third' }, camera, real);
        const visible = !ghosts.has(body.id) && (snapshot.alive || remote.fadeAge < corpseShownS(rules, 'other'));
        remote.view.group.visible = visible;
        const held = snapshot.alive ? (['rifle', 'pistol'] as const).flatMap(item => {
          const name = remote!.names[item], object = remote!.weapons[item]; return name && object.visible ? [{ name, matrix: Float32Array.from(object.matrix.elements) }] : [];
        }) : [];
        actors.push({ id: body.id, modelIndex: remote.model, visible, position: snapshot.feet, yawRadians: snapshot.yaw * Math.PI / 180,
          palette: remote.view.palette, local: remote.view.skeleton.local, world: remote.view.skeleton.world, held, gear: remote.view.gearVisibility() });
        const hit = mount && HIT_POSE_MOUNT_READING === 'idle'
          ? bodyVolumes(snapshot.feet, snapshot.yaw, snapshot.stance, volumes(remote.model), snapshot.rootTilt, snapshot.peek ?? 0) : remote.play.drawnBody();
        if (hit) { const play = remote.play; targets.set(body.id, { body: hit, alive: snapshot.alive && visible, node: name => play.nodeWorld(name) }); }
        else targets.delete(body.id);
      }
      for (const id of remotes.keys()) if (!seen.has(id)) remove(id);
      targets.keep(seen); return actors;
    },
    dispose: clear,
  };
}
