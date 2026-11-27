import type { BodyState, DoorWire, EnvWire, OwnState, Snapshot } from './protocol';

/**
 * Protocol 16's snapshot decoder, frozen (WM-DATA-17; WM.R11, the controller seat redotcom-8f: protocol 17 grew a body
 * 55 -> 56 by the hand byte, `BodyState.hand`): a `.s2r` recorded under protocol 16 holds 16's snapshot frames, and the
 * replay's reader (`match/src/replay/format.ts` `decodeRecords`) picks this decoder by the recording's header `protocol`.
 * Live play never reads it: a room refuses a hello of another version (`Room.hello`). The command is unchanged at 17, so
 * a 16 recording's commands decode with the live `decodeCommands` (`./codec`), and no frozen command decoder is kept here.
 *
 * FROZEN: a copy of `decodeSnapshot` and its body reader as protocol 16 had them (`codec.ts` at ad04e4f20c, before the
 * bump), with its own reader and dequantisers, so a later change to the live codec cannot reach it -- as `./codecV15` is
 * for protocol 11 to 15. Do not edit it to follow the live codec. Its one addition: each body it returns carries the
 * protocol-17 field at 0 (`BodyState.hand`), which no protocol-16 frame holds -- a recording below `HAND_SINCE_PROTOCOL`
 * carries no hand, and its reader is told so by the header's protocol, never by the zero. Decode only: nothing writes
 * protocol 16. Its tests: viewer `test/netCodecHand.test.ts` (a 16 snapshot read here as the live codec reads the same
 * at 17) and match `test/replayFormat.test.ts` (the table's row 16).
 *
 * The layout: a snapshot is u8 kind (0), u32 tick, u8 sections (bit 0 the own state, bit 1 the environment, bit 2 Chain
 * Reaction's hooks; any other bit refused), i16 x3 the feet's origin, [u32 ack, f32 x y z, f32 vx vy vz, f32 yaw pitch],
 * u8 count, 55 bytes a body (u8 id, i16 feet x3 at 1/8 from the origin, u16 yaw, i16 pitch, i16 speed x3, u32 flags, u8
 * packed, u8 item, u8 jumps, i8 stick x2, i8 class, u8 action, u8 serial, u16 clock, u16 length, u8 overlay, u16 clock,
 * u16 length, i16 turn, u8 trav, f32 frame, f32 root, u8 blend, u8 weight, i8 peek, u8 view | clock << 4, i8 swayX, i8
 * swayY), u8 door count and two bytes a door, [u8 hook count, seven bytes a hook], [u32 revision, u16 epoch, u16 count,
 * u16 id + u8 state an instance]; no trailing byte.
 */

/** Protocol 16's `Frame.Snapshot` (protocol 11's frame type, unchanged to 16). */
const V16_SNAPSHOT_KIND = 0;

class ReaderV16 {
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

const FEET_STEP_V16 = 1 / 8;
/** Protocol 16's sway step (`VIEW_SWAY_STEP_ADAPTATION` as it stood: 0.5 PS2 pixels a unit). */
const SWAY_STEP_V16 = 0.5;
const dqFeet = (q: number, o: number): number => o + q * FEET_STEP_V16;
const dqStick = (q: number): number => q / 127;
const dqYaw = (q: number): number => (q * 360) / 65536;
const dqPitch = (q: number): number => q / 100;
const dqTurn = (q: number): number => q / 1000;
const dqSpeed = (q: number): number => q / 64;
const dqSeconds = (q: number): number => (q === 0xffff ? -1 : q / 1000);
const dqSway = (q: number): number => q * SWAY_STEP_V16;
/** Protocol 16's view state: an integer 0-12 is itself, anything else 0 (`viewState` as it stood). */
const viewStateV16 = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 12 ? v : 0);

/** The sections byte: bit 0 the own state, bit 1 the environment, bit 2 the hooks. */
const SectionV16 = { Own: 1, Env: 2, Cranes: 4 } as const;
const KNOWN_SECTIONS_V16 = SectionV16.Own | SectionV16.Env | SectionV16.Cranes;

function readBodyV16(r: ReaderV16, o: readonly [number, number, number]): BodyState {
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
  const viewClock = r.u8(), swayX = dqSway(r.i8()), swayY = dqSway(r.i8());   // protocol 16: a nibble past 12 is no view
  return {
    id, feet, yaw, pitch, vx, vy, vz, flags,
    stance: packed & 3, landing: (packed >> 2) & 3, ground: (packed >> 4) & 3, weapon, slot: (packed >> 6) & 1, stickSnaps: (packed >> 7) & 1,
    jumps, groundForward, groundRight, groundCls, action, actionSerial, actionT, actionSeconds, overlay, overlayT, overlaySeconds,
    turnRate, trav, travFrame, travRootY, travBlend, travBlendWeight, peek,
    view: viewStateV16(viewClock & 15), clock: viewClock >> 4, swayX, swayY,
    hand: 0,                                                    // protocol 17's byte: none in a 16 body
  };
}

/** A protocol 16 snapshot frame (FROZEN: see the file's header). Throws on a frame of another layout. */
export function decodeSnapshotV16(bytes: Uint8Array): Snapshot {
  const r = new ReaderV16(bytes);
  if (r.u8() !== V16_SNAPSHOT_KIND) throw new Error('not a snapshot frame');
  const tick = r.u32();
  const sections = r.u8();
  if (sections & ~KNOWN_SECTIONS_V16) throw new Error(`snapshot has unknown sections 0x${sections.toString(16)}`);
  const o: [number, number, number] = [r.i16(), r.i16(), r.i16()];
  let own: OwnState | null = null;
  if (sections & SectionV16.Own) {
    // In the wire's order (an object literal's properties are evaluated left to right).
    own = { ack: r.u32(), x: r.f32(), y: r.f32(), z: r.f32(), vx: r.f32(), vy: r.f32(), vz: r.f32(), facing: { yaw: r.f32(), pitch: r.f32() } };
  }
  const n = r.u8();
  const bodies: BodyState[] = [];
  for (let i = 0; i < n; i++) bodies.push(readBodyV16(r, o));
  const doors: DoorWire[] = [];
  const d = r.u8();
  for (let i = 0; i < d; i++) doors.push({ valve: r.u8(), phase: r.u8() });
  const cranes: { valve: number; leg: number; ms: number; swingMs: number; mesh: number }[] = [];
  if (sections & SectionV16.Cranes) {
    const nCranes = r.u8();
    for (let i = 0; i < nCranes; i++) cranes.push({ valve: r.u8(), leg: r.u8(), ms: r.u16(), swingMs: r.u16(), mesh: r.u8() });
  }
  let env: EnvWire | null = null;
  if (sections & SectionV16.Env) {
    const revision = r.u32(), epoch = r.u16(), count = r.u16();
    const states: EnvWire['states'] = [];
    for (let i = 0; i < count; i++) states.push({ id: r.u16(), active: r.u8() !== 0 });
    env = { revision, epoch, states };
  }
  if (r.left !== 0) throw new Error(`snapshot has ${r.left} trailing bytes`);
  return { tick, own, bodies, ...(doors.length ? { doors } : {}), ...(cranes.length ? { cranes } : {}), ...(env ? { env } : {}) };
}
