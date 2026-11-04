/**
 * Authored multiplayer bot extension (FBA.R5, FBA.R8), ported from the preserved SOCOM practice-bot snapshot
 * source-20261020T223735Z. Decisions and tuning are ours, not recovered retail campaign behaviour. Existing
 * Redotcom movement, collision, weapon cone, damage, reload and animation implementations remain authority.
 */
import { isLiquidSurface, segmentHit, surfaceWord, SURFACE_SKIP, type WeaponRecord } from '@s2u/scene';
import type { MoverSim } from '../../../viewer/src/net/moverSim';
import { TICK_HZ } from '../../../viewer/src/net/protocol';
import type { Room } from '../room';
import type { Point } from './navigation';

/** A finite sound event at the source's feet; its id identifies the combatant, not an audio voice. */
export interface CombatSound { id: number; at: Point; kind: 'shot' | 'footstep'; range: number }

/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored AI hearing, in world units (10/m), independent of the browser's audio settings. */
const HEARING_ADAPTATION = {
  run: 135, walk: 80, crouch: 36, prone: 18, runSpeed: 32, minimumSpeed: 1,
  farShot: 850, mediumShot: 650, closeShot: 450, suppressedShot: 180,
  wallScale: 0.55, rayHeight: 10,
  // Stride distance plus a minimum interval prevents tiny motions and per-tick position updates becoming sounds.
  runStride: 15, walkStride: 10, crouchStride: 7, proneStride: 5,
  runInterval: 0.2, walkInterval: 0.28, crouchInterval: 0.4, proneInterval: 0.6,
  maximumSpeed: 100, displacementSlack: 2, maximumStepHeight: 8, maximumSampleGap: 0.25,
};

interface Footfall {
  body: MoverSim; joinedAt: number; x: number; y: number; z: number; tick: number;
  grounded: boolean; distance: number; nextAt: number;
}

/** Distance-driven authoritative footfalls for every live combatant. Call once per room tick. */
export class BotSounds {
  private readonly feet = new Map<number, Footfall>();
  private readonly present = new Set<number>();
  private room: Room | null = null;
  private tick = -1;

  sample(room: Room): CombatSound[] {
    if (this.room !== room || room.tick < this.tick) this.feet.clear();
    this.room = room;
    this.tick = room.tick;
    this.present.clear();
    const sounds: CombatSound[] = [];
    for (const member of room.lobby.players()) {
      const player = room.player(member.id);
      if (!player?.alive) continue;
      const w = player.sim.walker, s = w.state;
      if (![s.x, s.y, s.z, s.vx, s.vz].every(Number.isFinite)) continue;
      this.present.add(member.id);
      const grounded = !w.airborne && !player.sim.moves?.busy();
      let previous = this.feet.get(member.id);
      if (!previous || previous.body !== player.sim || previous.joinedAt !== member.joinedAt) {
        previous = { body: player.sim, joinedAt: member.joinedAt, x: s.x, y: s.y, z: s.z,
          tick: room.tick, grounded, distance: 0, nextAt: room.tick };
        this.feet.set(member.id, previous);
        continue;
      }
      const ticks = room.tick - previous.tick;
      if (ticks <= 0) continue;
      const elapsed = ticks / TICK_HZ, travelled = Math.hypot(s.x - previous.x, s.z - previous.z);
      const valid = grounded && previous.grounded && elapsed <= HEARING_ADAPTATION.maximumSampleGap
        && travelled <= HEARING_ADAPTATION.maximumSpeed * elapsed + HEARING_ADAPTATION.displacementSlack
        && Math.abs(s.y - previous.y) <= HEARING_ADAPTATION.maximumStepHeight;
      previous.x = s.x; previous.y = s.y; previous.z = s.z;
      previous.tick = room.tick; previous.grounded = grounded;
      if (!valid) { previous.distance = 0; previous.nextAt = room.tick; continue; }
      // Both travel and simulated velocity are required: blocked running and a placement make no footfall.
      const speed = Math.min(travelled / elapsed, Math.hypot(s.vx, s.vz));
      if (speed < HEARING_ADAPTATION.minimumSpeed) { previous.distance = 0; continue; }
      const gait = w.posture === 'prone' ? 'prone' : w.posture === 'crouch' ? 'crouch'
        : speed >= HEARING_ADAPTATION.runSpeed ? 'run' : 'walk';
      const stride = HEARING_ADAPTATION[`${gait}Stride`], interval = HEARING_ADAPTATION[`${gait}Interval`];
      previous.distance += travelled;
      if (previous.distance < stride || room.tick < previous.nextAt) continue;
      previous.distance %= stride;
      previous.nextAt = room.tick + Math.ceil(interval * TICK_HZ);
      sounds.push({ id: member.id, at: [s.x, s.y, s.z], kind: 'footstep', range: HEARING_ADAPTATION[gait] });
    }
    // Seats may disappear or be reused, and dead actors must not carry a partial stride into their next life.
    for (const id of this.feet.keys()) if (!this.present.has(id)) this.feet.delete(id);
    return sounds;
  }
}

/** FireSound metadata controls report reach; retail suppressed ids also cover records without sound names. */
export function shotSound(id: number, at: Point, record: WeaponRecord): CombatSound {
  const names = `${record.name} ${record.sounds.close ?? ''} ${record.sounds.med ?? ''} ${record.sounds.far ?? ''}`;
  const suppressed = /(?:sil|suppress)|(?:^|[\s_.-])sd(?:$|[\s_.-])/i.test(names)
    || record.id === 16 || record.id === 33 || record.id === 62 || record.id === 67 || record.id === 105;
  const range = suppressed ? HEARING_ADAPTATION.suppressedShot : record.sounds.far ? HEARING_ADAPTATION.farShot
    : record.sounds.med ? HEARING_ADAPTATION.mediumShot : HEARING_ADAPTATION.closeShot;
  return { id, at: [...at], kind: 'shot', range };
}

/** A solid obstruction reduces range once; close reports still travel through cover. Inputs stay at feet height. */
export function audibleSound(grid: Room['map']['grid'], sound: CombatSound, listener: Point): boolean {
  if (!Number.isFinite(sound.range) || sound.range <= 0 || !sound.at.every(Number.isFinite) || !listener.every(Number.isFinite)) return false;
  const distance = Math.hypot(sound.at[0] - listener[0], sound.at[1] - listener[1], sound.at[2] - listener[2]);
  if (distance > sound.range) return false;
  if (distance <= sound.range * HEARING_ADAPTATION.wallScale) return true;
  const from: Point = [sound.at[0], sound.at[1] + HEARING_ADAPTATION.rayHeight, sound.at[2]];
  const to: Point = [listener[0], listener[1] + HEARING_ADAPTATION.rayHeight, listener[2]];
  return !segmentHit(grid, from, to, (poly) => !isLiquidSurface(poly) && (surfaceWord(poly) & SURFACE_SKIP) === 0);
}
