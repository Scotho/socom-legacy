import { Frame, type BodyState, type Command, type CommandBatch, type DoorWire, type EnvWire, type OwnState, type Snapshot } from './protocol';
import { wrapYaw } from '../yaw';

/** Protocol 10's snapshot (and command) decoders, frozen beside the live ones (NET-WIRE; `./codecV10`): a protocol 10 `.s2r`'s. */
export { decodeCommandsV10, decodeSnapshotV10, type OwnStateV10, type SnapshotV10 } from './codecV10';

/**
 * The binary frames (web sprint 3, M3): the commands up and the snapshots down, little-endian, quantised where the
 * game's own precision allows (`./protocol` names the steps). The own state stays float32 (what prediction is compared
 * with, to the thousandth); the others' feet are i16 at `FEET_STEP` from the frame's origin (protocol 11).
 *
 * Sizes (protocol 11, NET-WIRE, research 224): a command is 15 bytes, a batch of 3 is 51 (the frame type its first byte,
 * as before); a snapshot's head is 12 (the frame type, the tick, the sections, the feet's origin), the own state 36 (its
 * facing), a body 52 (the feet 6, the flags 4) and a door 2, and the environment 8 and 3 an instance off its opening
 * state -- only in a snapshot that names it. A snapshot of 15 bodies and one's own is 830 bytes on a map without doors and
 * 836 on Frostfire (three doors; protocol 10: 884 and 890) -- 25.1 KB/s at 30 Hz per client, before the WebSocket's
 * framing. A full room (16 seats, EXTRACTION's three hostages): 986 bytes a player, 1002 a spectator (protocol 10: 1052
 * and 1080); 24 seats' bodies: 1402 and 1418 (1500 and 1528).
 */

class Writer {
  private buf = new ArrayBuffer(256);
  private view = new DataView(this.buf);
  private at = 0;

  private need(n: number): void {
    if (this.at + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.at + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.at));
    this.buf = next;
    this.view = new DataView(next);
  }
  u8(v: number): void { this.need(1); this.view.setUint8(this.at, v); this.at += 1; }
  i8(v: number): void { this.need(1); this.view.setInt8(this.at, v); this.at += 1; }
  u16(v: number): void { this.need(2); this.view.setUint16(this.at, v, true); this.at += 2; }
  i16(v: number): void { this.need(2); this.view.setInt16(this.at, v, true); this.at += 2; }
  u32(v: number): void { this.need(4); this.view.setUint32(this.at, v >>> 0, true); this.at += 4; }
  f32(v: number): void { this.need(4); this.view.setFloat32(this.at, v, true); this.at += 4; }
  bytes(): Uint8Array { return new Uint8Array(this.buf, 0, this.at).slice(); }
}

class Reader {
  private readonly view: DataView;
  private at = 0;
  constructor(bytes: Uint8Array) { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  private take(n: number): number {
    const at = this.at;
    if (at + n > this.view.byteLength) throw new RangeError(`frame too short: ${this.view.byteLength} bytes`);
    this.at += n;
    return at;
  }
  u8(): number { return this.view.getUint8(this.take(1)); }
  i8(): number { return this.view.getInt8(this.take(1)); }
  u16(): number { return this.view.getUint16(this.take(2), true); }
  i16(): number { return this.view.getInt16(this.take(2), true); }
  u32(): number { return this.view.getUint32(this.take(4), true); }
  f32(): number { return this.view.getFloat32(this.take(4), true); }
  get left(): number { return this.view.byteLength - this.at; }
}

// ---- the quantisers (each exported, so the client can predict with what the server will read) ------------------

/**
 * Protocol 11 (NET-WIRE; research 224): a body's feet on the wire, i16 steps of this many units from the frame's origin.
 * 1/8 keeps every foot within 1/16 of a unit (the step's half) over +-4095.875 of the origin: the widest hull on the disc
 * is M51's, 6,009 units across x (MP53's 4,400 across z the widest multiplayer map's), so from its bounds' centre every
 * map's hull lies within the range with more than 1,000 units to spare (`test/feetRange.test.ts`, over every map). A
 * wire step, not a reading: the room's own positions are float64 and its authority (hits, rewinds) never reads these.
 */
export const FEET_STEP = 1 / 8;
/** The farthest a foot is carried from the origin (32767 steps); past it a foot is clamped to the edge, never wrapped. */
export const FEET_RANGE = 32767 * FEET_STEP;
const qFeet = (v: number, o: number): number => Math.round(clamp((v - o) / FEET_STEP, -32768, 32767)) || 0;
const dqFeet = (q: number, o: number): number => o + q * FEET_STEP;
const qOrigin = (v: number): number => clamp(Math.round(v), -32768, 32767) || 0;

/** The centre of a set of points' bounds (xyz, packed), whole units: the room's feet origin from its map's hull. */
export function feetOriginOf(points: ArrayLike<number>): [number, number, number] {
  if (points.length < 3) return [0, 0, 0];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < points.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = points[i + k]!;
      if (v < lo[k]!) lo[k] = v;
      if (v > hi[k]!) hi[k] = v;
    }
  }
  return [qOrigin((lo[0]! + hi[0]!) / 2), qOrigin((lo[1]! + hi[1]!) / 2), qOrigin((lo[2]! + hi[2]!) / 2)];
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** The stick: -1..1 to 1/127. */
export const qStick = (v: number): number => Math.round(clamp(v, -1, 1) * 127) || 0;
export const dqStick = (q: number): number => q / 127;
/** A yaw, degrees, to 1/182 (0..65535 for a turn); read back in 0..360. */
export const qYaw = (deg: number): number => Math.round(wrapYaw(deg) * (65536 / 360)) & 0xffff;
export const dqYaw = (q: number): number => (q * 360) / 65536;
/** A pitch, degrees, -90..90 to 1/100. */
export const qPitch = (deg: number): number => Math.round(clamp(deg, -90, 90) * 100) || 0;
export const dqPitch = (q: number): number => q / 100;
/** A turn rate, radians a second, to 1/1000 (+-32). */
export const qTurn = (v: number): number => Math.round(clamp(v, -32, 32) * 1000) || 0;
export const dqTurn = (q: number): number => q / 1000;
/** A speed, units a second, to 1/64 (+-512). */
const qSpeed = (v: number): number => Math.round(clamp(v, -511.98, 511.98) * 64);
const dqSpeed = (q: number): number => q / 64;
/** Seconds to milliseconds, 0..65534; 65535 is none. */
const qSeconds = (s: number | null): number => (s === null || !Number.isFinite(s) || s < 0 ? 0xffff : Math.min(0xfffe, Math.round(s * 1000)));
const dqSeconds = (q: number): number => (q === 0xffff ? -1 : q / 1000);

/** A command as the server will read it: the quantisers applied (the client predicts with this, not the raw input). */
export function quantiseCommand(c: Command): Command {
  return {
    ...c,
    forward: dqStick(qStick(c.forward)), right: dqStick(qStick(c.right)),
    yaw: dqYaw(qYaw(c.yaw)), pitch: dqPitch(qPitch(c.pitch)), turn: dqTurn(qTurn(c.turn)),
    separate: c.separate === true,                               // SEP-POP: the wire's bit, always read back
  };
}

// ---- commands ---------------------------------------------------------------------------------------------------

/**
 * `Frame.Commands`: u8 kind, f32 view tick, u8 count, then per command u32 seq, i8 x2, u16 yaw, i16 pitch, i16 turn, u16
 * buttons, u8 stance|separate<<3|weapon<<4 (protocol 12, SEP-POP: `Command.separate` in the stance nibble's bit 3, its
 * codes 0-3; an 11 command never set the bit).
 */
export function encodeCommands(batch: CommandBatch): Uint8Array {
  const w = new Writer();
  w.u8(Frame.Commands);
  w.f32(batch.viewTick);
  const list = batch.commands.slice(-255);
  w.u8(list.length);
  for (const c of list) {
    w.u32(c.seq);
    w.i8(qStick(c.forward)); w.i8(qStick(c.right));
    w.u16(qYaw(c.yaw)); w.i16(qPitch(c.pitch)); w.i16(qTurn(c.turn));
    w.u16(c.buttons & 0xffff);
    w.u8((c.stance & 0x07) | (c.separate ? 0x08 : 0) | ((c.weapon & 0x0f) << 4));
  }
  return w.bytes();
}

export function decodeCommands(bytes: Uint8Array): CommandBatch {
  const r = new Reader(bytes);
  if (r.u8() !== Frame.Commands) throw new Error('not a command frame');
  const viewTick = r.f32();
  const n = r.u8();
  const commands: Command[] = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u32(), forward = dqStick(r.i8()), right = dqStick(r.i8()), yaw = dqYaw(r.u16()), pitch = dqPitch(r.i16());
    const turn = dqTurn(r.i16()), buttons = r.u16(), sw = r.u8();
    commands.push({ seq, forward, right, yaw, pitch, turn, buttons, stance: sw & 0x07, weapon: sw >> 4, separate: (sw & 0x08) !== 0 });
  }
  return { viewTick, commands };
}

// ---- snapshots --------------------------------------------------------------------------------------------------

function writeBody(w: Writer, b: BodyState, o: readonly [number, number, number]): void {
  w.u8(b.id);                                              // a u8: the room's hostages from 240 (HX-1) ride it as they are
  w.i16(qFeet(b.feet[0], o[0])); w.i16(qFeet(b.feet[1], o[1])); w.i16(qFeet(b.feet[2], o[2]));   // protocol 11
  w.u16(qYaw(b.yaw)); w.i16(qPitch(b.pitch));
  w.i16(qSpeed(b.vx)); w.i16(qSpeed(b.vy)); w.i16(qSpeed(b.vz));
  w.u32(b.flags);                                          // protocol 11: a u32 (the u16 was full)
  w.u8((b.stance & 3) | ((b.landing & 3) << 2) | ((b.ground & 3) << 4) | ((b.slot & 1) << 6) | (((b.stickSnaps ?? 0) & 1) << 7));
  w.u8(b.weapon & 0xff);                                   // protocol 7: the item in hand, by id
  w.u8(b.jumps & 0xff);
  w.i8(qStick(b.groundForward)); w.i8(qStick(b.groundRight)); w.i8(b.groundCls);
  w.u8(b.action); w.u8(b.actionSerial & 0xff); w.u16(qSeconds(b.actionT)); w.u16(qSeconds(b.actionSeconds < 0 ? null : b.actionSeconds));
  w.u8(b.overlay); w.u16(qSeconds(b.overlayT)); w.u16(qSeconds(b.overlaySeconds));
  w.i16(qTurn(b.turnRate));
  w.u8(b.trav); w.f32(b.travFrame); w.f32(b.travRootY); w.u8(b.travBlend); w.u8(Math.round(clamp(b.travBlendWeight, 0, 1) * 255));
  w.i8(b.peek);
}

function readBody(r: Reader, o: readonly [number, number, number]): BodyState {
  const id = r.u8();
  const feet: [number, number, number] = [dqFeet(r.i16(), o[0]), dqFeet(r.i16(), o[1]), dqFeet(r.i16(), o[2])];
  const yaw = dqYaw(r.u16()), pitch = dqPitch(r.i16());
  const vx = dqSpeed(r.i16()), vy = dqSpeed(r.i16()), vz = dqSpeed(r.i16());
  const flags = r.u32();
  const packed = r.u8();
  const weapon = r.u8();
  const jumps = r.u8();
  const groundForward = dqStick(r.i8()), groundRight = dqStick(r.i8()), groundCls = r.i8();
  const action = r.u8(), actionSerial = r.u8(), actionT = dqSeconds(r.u16()), actionSeconds = dqSeconds(r.u16());
  const overlay = r.u8(), overlayT = dqSeconds(r.u16()), overlaySeconds = dqSeconds(r.u16());
  const turnRate = dqTurn(r.i16());
  const trav = r.u8(), travFrame = r.f32(), travRootY = r.f32(), travBlend = r.u8(), travBlendWeight = r.u8() / 255;
  const peek = r.i8();
  return {
    id, feet, yaw, pitch, vx, vy, vz, flags,
    stance: packed & 3, landing: (packed >> 2) & 3, ground: (packed >> 4) & 3, weapon, slot: (packed >> 6) & 1, stickSnaps: (packed >> 7) & 1,
    jumps, groundForward, groundRight, groundCls, action, actionSerial, actionT, actionSeconds, overlay, overlayT, overlaySeconds,
    turnRate, trav, travFrame, travRootY, travBlend, travBlendWeight, peek,
  };
}

/**
 * The snapshot's sections byte (protocol 11): which of the optional parts follow.
 * Bit 2 is Chain Reaction's hooks (research 176 §9). It is set only when the snapshot names them, so a map
 * without hooks keeps the bytes protocol 11 already wrote. A recording of protocol 10 never carries the bit.
 */
const Section = { Own: 1, Env: 2, Cranes: 4 } as const;
const KNOWN_SECTIONS = Section.Own | Section.Env | Section.Cranes;

/** The bodies' own bounds' centre, whole units (`encodeSnapshot`'s origin when none is given). */
function bodiesOrigin(bodies: readonly BodyState[]): [number, number, number] {
  const pts: number[] = [];
  for (const b of bodies) pts.push(b.feet[0], b.feet[1], b.feet[2]);
  return feetOriginOf(pts);
}

/**
 * `Frame.Snapshot` (protocol 11, NET-WIRE; research 224): u8 frame type (0), u32 tick, u8 sections (bit 0 the own state,
 * bit 1 the environment, bit 2 Chain Reaction's hooks; any other bit refused), i16 x3 the feet's origin (whole units),
 * then [u32 ack, f32 x y z, f32 vx vy vz, f32 yaw pitch] when the own state is there, u8 count, the bodies (52 bytes
 * each: u8 id, i16 feet x3 at `FEET_STEP` from the origin, u16 yaw, i16 pitch, i16 speed x3, u32 flags, then protocol
 * 10's tail unchanged), u8 door count and two bytes a door (`DoorWire`), then -- when bit 2 is set -- u8 hook count and
 * seven bytes a hook (`CraneWire`: u8 valve, u8 leg, u16 milliseconds, u16 swing milliseconds, u8 mesh), then the
 * environment when named (`EnvWire`:
 * u32 revision, u16 round epoch, u16 count, u16 instance id and u8 state an instance). No trailing byte. `origin`: the
 * room's map's bounds' centre (`feetOriginOf`); absent, the bodies' own bounds' centre -- the frame carries it, so a
 * reader needs nothing else.
 */
export function encodeSnapshot(s: Snapshot, origin?: readonly [number, number, number]): Uint8Array {
  const w = new Writer();
  const o = (origin ?? bodiesOrigin(s.bodies)).map(qOrigin) as [number, number, number];
  w.u8(Frame.Snapshot);
  w.u32(s.tick);
  const cranes = (s.cranes ?? []).slice(0, 255);
  w.u8((s.own ? Section.Own : 0) | (s.env ? Section.Env : 0) | (cranes.length ? Section.Cranes : 0));
  w.i16(o[0]); w.i16(o[1]); w.i16(o[2]);
  if (s.own) {
    const own = s.own;
    w.u32(own.ack);
    w.f32(own.x); w.f32(own.y); w.f32(own.z);
    w.f32(own.vx); w.f32(own.vy); w.f32(own.vz);
    w.f32(own.facing.yaw); w.f32(own.facing.pitch);       // protocol 11: the facing, reconciled as the position is
  }
  w.u8(s.bodies.length);
  for (const b of s.bodies) writeBody(w, b, o);
  const doors = (s.doors ?? []).slice(0, 255);
  w.u8(doors.length);
  for (const d of doors) { w.u8(clamp(Math.round(d.valve), 0, 255)); w.u8(clamp(Math.round(d.phase), 0, 255)); }
  // Chain Reaction (research 176 §9): the hooks only when the map has them. Absent, the bytes stop where they used to.
  if (cranes.length) {
    w.u8(cranes.length);
    for (const c of cranes) {
      w.u8(clamp(Math.round(c.valve), 0, 255));
      w.u8(clamp(Math.round(c.leg), 0, 255));
      w.u16(clamp(Math.round(c.ms), 0, 0xffff));
      w.u16(clamp(Math.round(c.swingMs), 0, 0xffff));
      w.u8(clamp(Math.round(c.mesh), 0, 255));
    }
  }
  // Protocol 11: the environment only when the snapshot names it (the room: when its revision or epoch changed).
  const env = s.env;
  if (env) {
    const states = env.states.slice(0, 0xffff);
    w.u32(env.revision % 2 ** 32);
    w.u16(env.epoch & 0xffff);
    w.u16(states.length);
    for (const e of states) { w.u16(e.id & 0xffff); w.u8(e.active ? 1 : 0); }
  }
  return w.bytes();
}

export function decodeSnapshot(bytes: Uint8Array): Snapshot {
  const r = new Reader(bytes);
  if (r.u8() !== Frame.Snapshot) throw new Error('not a snapshot frame');
  const tick = r.u32();
  const sections = r.u8();
  if (sections & ~KNOWN_SECTIONS) throw new Error(`snapshot has unknown sections 0x${sections.toString(16)}`);
  const o: [number, number, number] = [r.i16(), r.i16(), r.i16()];
  let own: OwnState | null = null;
  if (sections & Section.Own) {
    // In the wire's order (an object literal's properties are evaluated left to right).
    own = { ack: r.u32(), x: r.f32(), y: r.f32(), z: r.f32(), vx: r.f32(), vy: r.f32(), vz: r.f32(), facing: { yaw: r.f32(), pitch: r.f32() } };
  }
  const n = r.u8();
  const bodies: BodyState[] = [];
  for (let i = 0; i < n; i++) bodies.push(readBody(r, o));
  const doors: DoorWire[] = [];
  const d = r.u8();
  for (let i = 0; i < d; i++) doors.push({ valve: r.u8(), phase: r.u8() });
  const cranes: { valve: number; leg: number; ms: number; swingMs: number; mesh: number }[] = [];
  if (sections & Section.Cranes) {
    const nCranes = r.u8();
    for (let i = 0; i < nCranes; i++) cranes.push({ valve: r.u8(), leg: r.u8(), ms: r.u16(), swingMs: r.u16(), mesh: r.u8() });
  }
  let env: EnvWire | null = null;
  if (sections & Section.Env) {
    const revision = r.u32(), epoch = r.u16(), count = r.u16();
    const states: EnvWire['states'] = [];
    for (let i = 0; i < count; i++) states.push({ id: r.u16(), active: r.u8() !== 0 });
    env = { revision, epoch, states };
  }
  if (r.left !== 0) throw new Error(`snapshot has ${r.left} trailing bytes`);
  return { tick, own, bodies, ...(doors.length ? { doors } : {}), ...(cranes.length ? { cranes } : {}), ...(env ? { env } : {}) };
}

/** The first byte of a binary frame: its `Frame` kind, or null for an empty frame. */
export function frameKind(bytes: Uint8Array): number | null {
  return bytes.byteLength ? bytes[0]! : null;
}
