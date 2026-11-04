import type { BodyState, Command, CommandBatch, DoorWire, EnvWire } from './protocol';

/**
 * Protocol 10's snapshot decoder, frozen (NET-WIRE, protocol 11; research 224; the merge controller's requirement 3,
 * sprint 33's PT-01b): a `.s2r` recorded under protocol 10 holds protocol 10's snapshot frames, and the replay's reader
 * (`match/src/replay/format.ts` `decodeRecords`) picks this decoder by the recording's header `protocol`. Live play
 * never reads it: a room refuses a hello of another version (`Room.hello`).
 *
 * FROZEN: a copy of `decodeSnapshot` and its body reader as protocol 10 had them (2026-10-07, `codec.ts` before the
 * bump), with its own reader and dequantisers, so a later change to the live codec cannot reach it. Its test decodes
 * committed bytes that protocol 10's own encoder wrote (`test/netCodecV10.test.ts`, `test/fixtures/snapshot-v10.hex`).
 * Do not edit it to follow the live codec. `decodeCommandsV10` beside it: a protocol 10 recording's `cmd` records hold
 * protocol 10's command frames, whose kind byte (1) is protocol 11's voice type; the layout after it is unchanged.
 *
 * The layout: u8 kind (2), u32 tick, u8 has-own, [u32 ack, f32 x y z, f32 vx vy vz], u8 count, then 56 bytes a body
 * (u8 id, f32 feet x3, u16 yaw, i16 pitch, i16 speed x3, u16 flags, u8 packed, u8 item, u8 jumps, i8 stick x2, i8 class,
 * u8 action, u8 serial, u16 clock, u16 length, u8 overlay, u16 clock, u16 length, i16 turn, u8 trav, f32 frame, f32 root,
 * u8 blend, u8 weight, i8 peek), u8 door count and two bytes a door, then the environment: u32 revision, u16 epoch,
 * u16 count, u16 id + u8 state an instance. No trailing byte.
 */

/** Protocol 10's own state: no facing (protocol 11 added it). */
export interface OwnStateV10 { ack: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
/** Protocol 10's snapshot as its decoder gave it: the environment always present. */
export interface SnapshotV10 { tick: number; own: OwnStateV10 | null; bodies: BodyState[]; doors?: DoorWire[]; env: EnvWire }

/** Protocol 10's `Frame.Snapshot` and `Frame.Commands`. */
const V10_SNAPSHOT_KIND = 2;
const V10_COMMANDS_KIND = 1;

class ReaderV10 {
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

const dqStick = (q: number): number => q / 127;
const dqYaw = (q: number): number => (q * 360) / 65536;
const dqPitch = (q: number): number => q / 100;
const dqTurn = (q: number): number => q / 1000;
const dqSpeed = (q: number): number => q / 64;
const dqSeconds = (q: number): number => (q === 0xffff ? -1 : q / 1000);

function readBodyV10(r: ReaderV10): BodyState {
  const id = r.u8();
  const feet: [number, number, number] = [r.f32(), r.f32(), r.f32()];
  const yaw = dqYaw(r.u16()), pitch = dqPitch(r.i16());
  const vx = dqSpeed(r.i16()), vy = dqSpeed(r.i16()), vz = dqSpeed(r.i16());
  const flags = r.u16();
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

/** A protocol 10 snapshot frame (FROZEN: see the file's header). Throws on a frame of another layout. */
export function decodeSnapshotV10(bytes: Uint8Array): SnapshotV10 {
  const r = new ReaderV10(bytes);
  if (r.u8() !== V10_SNAPSHOT_KIND) throw new Error('not a snapshot frame');
  const tick = r.u32();
  let own: OwnStateV10 | null = null;
  if (r.u8()) own = { ack: r.u32(), x: r.f32(), y: r.f32(), z: r.f32(), vx: r.f32(), vy: r.f32(), vz: r.f32() };
  const n = r.u8();
  const bodies: BodyState[] = [];
  for (let i = 0; i < n; i++) bodies.push(readBodyV10(r));
  const doors: DoorWire[] = [];
  const d = r.u8();
  for (let i = 0; i < d; i++) doors.push({ valve: r.u8(), phase: r.u8() });
  const revision = r.u32(), epoch = r.u16(), count = r.u16();
  const states: EnvWire['states'] = [];
  for (let i = 0; i < count; i++) states.push({ id: r.u16(), active: r.u8() !== 0 });
  if (r.left !== 0) throw new Error(`snapshot has ${r.left} trailing bytes`);
  const env: EnvWire = { revision, epoch, states };
  return doors.length ? { tick, own, bodies, doors, env } : { tick, own, bodies, env };
}

/**
 * A protocol 10 command frame (FROZEN): u8 kind (1), f32 view tick, u8 count, then per command u32 seq, i8 x2, u16 yaw,
 * i16 pitch, i16 turn, u16 buttons, u8 stance|weapon<<4.
 */
export function decodeCommandsV10(bytes: Uint8Array): CommandBatch {
  const r = new ReaderV10(bytes);
  if (r.u8() !== V10_COMMANDS_KIND) throw new Error('not a command frame');
  const viewTick = r.f32();
  const n = r.u8();
  const commands: Command[] = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u32(), forward = dqStick(r.i8()), right = dqStick(r.i8()), yaw = dqYaw(r.u16()), pitch = dqPitch(r.i16());
    const turn = dqTurn(r.i16()), buttons = r.u16(), sw = r.u8();
    commands.push({ seq, forward, right, yaw, pitch, turn, buttons, stance: sw & 0x0f, weapon: sw >> 4 });
  }
  return { viewTick, commands };
}
