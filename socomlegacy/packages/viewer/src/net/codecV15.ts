import type { BodyState, Command, CommandBatch, DoorWire, EnvWire, OwnState, Snapshot } from './protocol';

/**
 * Protocol 15's snapshot and command decoders, frozen (WIRE-16, PV-1 of the player's view's lane; PV.R4 and research 402
 * section 3: protocol 16 grew a command 15 -> 18 bytes and a body 52 -> 55): a `.s2r` recorded under protocol 11 to 15
 * holds those protocols' frames -- the same layout, each bump from 11 to 15 having changed no width (12 the command's bit
 * 3, 13 the JSON, 14 the command's bit 7 and the body's bit 16, 15 the mover's rules) -- and the replay's reader
 * (`match/src/replay/format.ts` `decodeRecords`) picks these decoders by the recording's header `protocol`. Live play
 * never reads them: a room refuses a hello of another version (`Room.hello`).
 *
 * FROZEN: a copy of `decodeSnapshot`, its body reader and `decodeCommands` as protocol 15 had them (`codec.ts` at
 * dbaae726a1, before the bump), with its own reader and dequantisers, so a later change to the live codec cannot reach
 * it -- as `./codecV10` is for protocol 10. Do not edit it to follow the live codec. Its one addition: each body and
 * command it returns carries the protocol-16 fields at 0 (`BodyState.view`, `clock`, `swayX`, `swayY`; `Command.view`,
 * `swayX`, `swayY`), which no protocol-15 frame holds -- a recording below `VIEW_SINCE_PROTOCOL` carries no view (PV.R6),
 * and its reader is told so by the header's protocol, never by these zeros. Decode only: nothing writes protocol 15.
 * Its tests: viewer `test/netCodecView.test.ts` (a 15 snapshot and command read here as the live codec reads the same at
 * 16) and match `test/replayFormat.test.ts` (the table's rows 11 to 15).
 *
 * The layout: a snapshot is u8 kind (0), u32 tick, u8 sections (bit 0 the own state, bit 1 the environment, bit 2 Chain
 * Reaction's hooks; any other bit refused), i16 x3 the feet's origin, [u32 ack, f32 x y z, f32 vx vy vz, f32 yaw pitch],
 * u8 count, 52 bytes a body (u8 id, i16 feet x3 at 1/8 from the origin, u16 yaw, i16 pitch, i16 speed x3, u32 flags, u8
 * packed, u8 item, u8 jumps, i8 stick x2, i8 class, u8 action, u8 serial, u16 clock, u16 length, u8 overlay, u16 clock,
 * u16 length, i16 turn, u8 trav, f32 frame, f32 root, u8 blend, u8 weight, i8 peek), u8 door count and two bytes a door,
 * [u8 hook count, seven bytes a hook], [u32 revision, u16 epoch, u16 count, u16 id + u8 state an instance]; no trailing
 * byte. A command frame is u8 kind (2), f32 view tick, u8 count, then 15 bytes a command: u32 seq, i8 x2, u16 yaw, i16
 * pitch, i16 turn, u16 buttons, u8 stance|separate<<3|weapon<<4|raised<<7.
 */

/** Protocol 15's `Frame.Snapshot` and `Frame.Commands` (protocol 11's frame types, unchanged to 15). */
const V15_SNAPSHOT_KIND = 0;
const V15_COMMANDS_KIND = 2;

class ReaderV15 {
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

const FEET_STEP_V15 = 1 / 8;
const dqFeet = (q: number, o: number): number => o + q * FEET_STEP_V15;
const dqStick = (q: number): number => q / 127;
const dqYaw = (q: number): number => (q * 360) / 65536;
const dqPitch = (q: number): number => q / 100;
const dqTurn = (q: number): number => q / 1000;
const dqSpeed = (q: number): number => q / 64;
const dqSeconds = (q: number): number => (q === 0xffff ? -1 : q / 1000);

/** The sections byte: bit 0 the own state, bit 1 the environment, bit 2 the hooks. */
const SectionV15 = { Own: 1, Env: 2, Cranes: 4 } as const;
const KNOWN_SECTIONS_V15 = SectionV15.Own | SectionV15.Env | SectionV15.Cranes;

/** A protocol 15 command frame (FROZEN: see the file's header); `view`, `swayX`, `swayY` 0. */
export function decodeCommandsV15(bytes: Uint8Array): CommandBatch {
  const r = new ReaderV15(bytes);
  if (r.u8() !== V15_COMMANDS_KIND) throw new Error('not a command frame');
  const viewTick = r.f32();
  const n = r.u8();
  const commands: Command[] = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u32(), forward = dqStick(r.i8()), right = dqStick(r.i8()), yaw = dqYaw(r.u16()), pitch = dqPitch(r.i16());
    const turn = dqTurn(r.i16()), buttons = r.u16(), sw = r.u8();
    commands.push({
      seq, forward, right, yaw, pitch, turn, buttons, stance: sw & 0x07, weapon: (sw >> 4) & 0x07, separate: (sw & 0x08) !== 0,
      ...((sw & 0x80) !== 0 ? { raised: true } : {}),          // ER-2 (protocol 14): only when set, as a command without it
      view: 0, swayX: 0, swayY: 0,                             // protocol 16's fields: none in a 15 frame
    });
  }
  return { viewTick, commands };
}

function readBodyV15(r: ReaderV15, o: readonly [number, number, number]): BodyState {
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
    view: 0, clock: 0, swayX: 0, swayY: 0,                     // protocol 16's tail: none in a 15 body
  };
}

/** A protocol 15 snapshot frame (FROZEN: see the file's header). Throws on a frame of another layout. */
export function decodeSnapshotV15(bytes: Uint8Array): Snapshot {
  const r = new ReaderV15(bytes);
  if (r.u8() !== V15_SNAPSHOT_KIND) throw new Error('not a snapshot frame');
  const tick = r.u32();
  const sections = r.u8();
  if (sections & ~KNOWN_SECTIONS_V15) throw new Error(`snapshot has unknown sections 0x${sections.toString(16)}`);
  const o: [number, number, number] = [r.i16(), r.i16(), r.i16()];
  let own: OwnState | null = null;
  if (sections & SectionV15.Own) {
    // In the wire's order (an object literal's properties are evaluated left to right).
    own = { ack: r.u32(), x: r.f32(), y: r.f32(), z: r.f32(), vx: r.f32(), vy: r.f32(), vz: r.f32(), facing: { yaw: r.f32(), pitch: r.f32() } };
  }
  const n = r.u8();
  const bodies: BodyState[] = [];
  for (let i = 0; i < n; i++) bodies.push(readBodyV15(r, o));
  const doors: DoorWire[] = [];
  const d = r.u8();
  for (let i = 0; i < d; i++) doors.push({ valve: r.u8(), phase: r.u8() });
  const cranes: { valve: number; leg: number; ms: number; swingMs: number; mesh: number }[] = [];
  if (sections & SectionV15.Cranes) {
    const nCranes = r.u8();
    for (let i = 0; i < nCranes; i++) cranes.push({ valve: r.u8(), leg: r.u8(), ms: r.u16(), swingMs: r.u16(), mesh: r.u8() });
  }
  let env: EnvWire | null = null;
  if (sections & SectionV15.Env) {
    const revision = r.u32(), epoch = r.u16(), count = r.u16();
    const states: EnvWire['states'] = [];
    for (let i = 0; i < count; i++) states.push({ id: r.u16(), active: r.u8() !== 0 });
    env = { revision, epoch, states };
  }
  if (r.left !== 0) throw new Error(`snapshot has ${r.left} trailing bytes`);
  return { tick, own, bodies, ...(doors.length ? { doors } : {}), ...(cranes.length ? { cranes } : {}), ...(env ? { env } : {}) };
}
