import {
  decodeCommands, decodeCommandsV10, decodeSnapshot, decodeSnapshotV10, encodeCommands, encodeSnapshot, PROTOCOL_VERSION,
  type BodyState, type Command, type CommandBatch, type CraneWire, type DoorWire, type EnvWire, type HostageWire, type Role, type Rules, type ServerEvent,
  type Team,
} from '../../../viewer/src/sim';

/**
 * The `.s2r` replay format (web sprint 33, PT-01; spec 4.1; research 240 §§1-3).
 *
 * REPLAY_ADAPTATION: a replay file is a browser and engineering adaptation with no original in the game. SOCOM II
 * records no match; nothing here is read from the disc or the decompilation, and nothing here changes a game value or
 * behaviour (PT.R3). The format only carries what the Room already sends: the snapshots through the wire's own binary
 * codec (`encodeSnapshot`, one `BodyState` per body, no recipient's own state), the broadcast `ServerEvent`s, the
 * lobby's player changes and, for a playtest, the commands the room ran (the wire's command codec).
 *
 * The layout: a file is a stream of records, each a u8 tag, a u32 payload length (little endian) and the payload. The
 * tags: header 1, players 2, snap 3, event 4, cmd 5, mark 6, end 7, hostages 8 (format 2, RE-2), refusal 9 (format 3,
 * SIMDROP-INSTR). JSON records (header, players, event, mark, end, hostages, refusal) are UTF-8 JSON of the record without its `kind`. A `snap` payload is the wire's `Frame.Snapshot` exactly
 * (`own: null`; its tick is the record's) of the header's protocol -- since protocol 11 (NET-WIRE) with the environment
 * always named (a seek lands on any snapshot) and the feet's origin the bodies' own bounds' centre. A `cmd` payload is a u32 tick and a u32 player id, then the wire's
 * `Frame.Commands` with one command (`viewTick` the tick): the wire frame carries no player id, and its `viewTick` is
 * a float32, exact only to 2^24 ticks (77 hours at 60 Hz), so the record's own u32 tick is the one read back.
 * A closed segment is the gzip of the concatenated records (`gzipReplay`); a segment still being written is plain.
 *
 * RE-2 (web sprint 38; W38.R2; research 249 §3): a `hostages` payload is EXTRACTION's roster as the room's welcome
 * carries it (`HostageWire`: each hostage's id, name, model and place, with its state), written by the recorder at a
 * segment's open and whenever the roster changes. Format 1's reader threw on a tag it did not know, so it could not skip
 * the new kind: the version moved to 2 (W38.R2's own rule). This build reads both (`REPLAY_FORMATS`); a format-1 file
 * has no roster. From format 2 the reader skips a record whose tag it does not know, by its length -- an older viewer
 * reads a newer file, and a later kind needs no new version -- while in a format-1 file an unknown tag stays corrupt.
 *
 * SIMDROP-INSTR (sim drops #3 and #4; an instrument, no original): a `refusal` record (tag 9) -- a round the room refused
 * `fire: cone: *` (`Room.dropped`'s key), with the claim's eye and aim, the room's eye locus at the command's blend
 * (`ShotCone.eyeLocus`) and the claim's distance from it, and the body's feet, ground and stance at that command. A
 * replay-only kind: never a wire `ServerEvent`, never sent to a page. The version moved to 3 at the seat's brief, so a
 * file that may hold one says so in its header; this build reads 1, 2 and 3 (a format-2 reader would have skipped the
 * kind by its length, but refuses a format-3 header).
 *
 * SEEK_SNAPSHOT_RULE_ADAPTATION (the design's seek rule, spec 4.1): a seek lands on the nearest `snap` at or before
 * the target tick; the events between that snapshot and the target are skipped, never replayed (a tracer or a
 * grenade's arc is transient; the next event draws itself). A `cmd` stream is for investigators, never for playback.
 */
export const REPLAY_ADAPTATION =
  'REPLAY_ADAPTATION: the .s2r replay file is a browser/engineering adaptation with no original in SOCOM II; it records ' +
  'what the Room already sends and changes no game value or behaviour (spec 4.1, PT.R3, research 240 §3)';
export const SEEK_SNAPSHOT_RULE_ADAPTATION =
  'SEEK_SNAPSHOT_RULE_ADAPTATION: a seek lands on the nearest snap at or before the target tick; the events between ' +
  'are skipped, never replayed (spec 4.1, research 240 §3)';

export const REPLAY_FORMAT_VERSION = 3;
/**
 * The formats this build reads, oldest first: 1 (no `hostages` record), 2 (RE-2) and 3 (SIMDROP-INSTR's `refusal`). A
 * writer writes `REPLAY_FORMAT_VERSION`.
 */
export const REPLAY_FORMATS: readonly number[] = [1, 2, 3];
/** The first format whose reader skips a record of a kind it does not know (RE-2, W38.R2). */
const SKIPS_UNKNOWN_FROM = 2;
export const REPLAY_EXTENSION = '.s2r';

export interface ReplayHeader {
  format: number; protocol: number;                       // REPLAY_FORMAT_VERSION, PROTOCOL_VERSION
  build: { commit: string; dirty: boolean; branch: string | null; branchCreated: string | null };
  map: string; rules: Rules; gameType: string | null;     // the stem (`MP2`); the rules the room played (`playedRules`, LATER 153); `SimMap.gameType` as a string
  tickHz: number; snapshotHz: number;
  kind: 'solo' | 'dedicated' | 'game';
  serverName: string | null;
  startedAt: string;                                      // ISO 8601, wall clock
  session: { id: string; segment: number } | null;        // a playtest's; null for a server recording
}
/**
 * SIMDROP-INSTR: a `fire: cone: *` refusal as the room judged it (`Room.fireAt`): the seat, the command the round named
 * (`seq`), the refusal's key (`why`), the claim's eye and aim, the point of the room's eye locus nearest the claimed eye
 * at the command's blend and the distance between them (`ShotCone.eyeLocus`; null when the command is no longer held),
 * whether the look was through the lens (the head's eye), and the body at that command: its feet, its saved floor normal's
 * y (`groundNormalY`, 1 when absent), airborne, and its stance.
 */
export interface ReplayRefusal {
  seat: number; seq: number; why: string;
  eye: number[]; aim: number[];
  locus: number[] | null; distance: number | null; lens: boolean;
  feet: number[]; groundNormalY: number; airborne: boolean; stance: string;
}
export interface ReplayPlayer { id: number; name: string; team: Team | null; role: Role; char: number; /** FBA.R10: optional assigned regional bot appearance. */ character?: string; /** FBA.R12: trusted CPU seat. */ bot?: true }
export type ReplayRecord =
  | { kind: 'header'; header: ReplayHeader }
  | { kind: 'players'; tick: number; players: ReplayPlayer[] }
  | { kind: 'snap'; tick: number; bodies: BodyState[]; doors?: DoorWire[]; cranes?: CraneWire[]; env?: EnvWire }
  | { kind: 'event'; tick: number; event: ServerEvent }
  | { kind: 'cmd'; tick: number; id: number; command: Command }
  | { kind: 'mark'; tick: number; observation: string; at: string }
  | { kind: 'end'; tick: number; reason: string }
  /** RE-2 (W38.R2): EXTRACTION's roster as the welcome carries it (`welcome.hostages`), at a segment's open and on a change. */
  | { kind: 'hostages'; tick: number; hostages: HostageWire[] }
  /** SIMDROP-INSTR (format 3): a `fire: cone: *` refusal with the claim and the room's eye locus; replay-only, never on the wire. */
  | ({ kind: 'refusal'; tick: number } & ReplayRefusal);

/**
 * The wire's decoders by protocol (NET-WIRE, PT-01b): the `snap` and `cmd` payloads are the frames of the header's
 * protocol, and the reader picks their decoder by it -- protocol 10's frozen pair (`decodeSnapshotV10`,
 * `decodeCommandsV10`) and the live codec's. A recording of any other protocol is refused, never misdecoded. Live play
 * keeps one version (`Room.hello` refuses a hello of another).
 */
interface WireDecoders {
  snapshot: (bytes: Uint8Array) => { tick: number; bodies: BodyState[]; doors?: DoorWire[]; cranes?: CraneWire[]; env?: EnvWire };
  commands: (bytes: Uint8Array) => CommandBatch;
}
const DECODERS: ReadonlyMap<number, WireDecoders> = new Map<number, WireDecoders>([
  [10, { snapshot: decodeSnapshotV10, commands: decodeCommandsV10 }],
  // Protocol 11: the live decoders read it exactly -- 12 (SEP-POP) added only the command's bit 3 of the stance byte,
  // which no 11 writer set (its stance codes 0-3), so an 11 command reads with `separate` false and the snapshot is one.
  [11, { snapshot: decodeSnapshot, commands: decodeCommands }],
  // Protocol 12: the live decoders -- 13 (PLANT-AIM) changed the JSON alone (the plant's `bombAction` 'aim').
  [12, { snapshot: decodeSnapshot, commands: decodeCommands }],
  // Protocol 13: the live decoders -- 14 (ENEMY-RAISE ER-2) added only the command's bit 7 (`raised`; a 13 weapon is 0 or
  // 1, so the bit was never set) and the body's `BodyFlag.Raised` (bit 16, never set by a 13 room).
  [13, { snapshot: decodeSnapshot, commands: decodeCommands }],
  [PROTOCOL_VERSION, { snapshot: decodeSnapshot, commands: decodeCommands }],
]);
/** The protocols whose recordings this build plays, oldest first. */
export const REPLAY_PROTOCOLS: readonly number[] = [...DECODERS.keys()].sort((a, b) => a - b);

/** The record tags (the u8 before each record). */
export const REPLAY_TAG = { header: 1, players: 2, snap: 3, event: 4, cmd: 5, mark: 6, end: 7, hostages: 8, refusal: 9 } as const;
type Kind = keyof typeof REPLAY_TAG;
const KIND_OF_TAG = new Map<number, Kind>(Object.entries(REPLAY_TAG).map(([k, t]) => [t, k as Kind]));

/** The record's prefix: a u8 tag and a u32 length. */
const PREFIX = 5;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder('utf-8', { fatal: true });

function payloadOf(r: ReplayRecord): Uint8Array {
  switch (r.kind) {
    case 'snap':
      return encodeSnapshot({ tick: r.tick, own: null, bodies: r.bodies, ...(r.doors ? { doors: r.doors } : {}), ...(r.cranes?.length ? { cranes: r.cranes } : {}), ...(r.env ? { env: r.env } : {}) });
    case 'cmd': {
      const frame = encodeCommands({ viewTick: r.tick, commands: [r.command] });
      const out = new Uint8Array(8 + frame.byteLength);
      const view = new DataView(out.buffer);
      view.setUint32(0, r.tick >>> 0, true);
      view.setUint32(4, r.id >>> 0, true);
      out.set(frame, 8);
      return out;
    }
    default: {
      const { kind: _kind, ...rest } = r;
      return utf8.encode(JSON.stringify(rest));
    }
  }
}

/** One record as bytes: a u8 tag, a u32 length (little endian), the payload. */
export function encodeRecord(r: ReplayRecord): Uint8Array {
  const tag = REPLAY_TAG[r.kind];
  if (tag === undefined) throw new Error(`unknown replay record kind: ${String((r as { kind: unknown }).kind)}`);
  const payload = payloadOf(r);
  const out = new Uint8Array(PREFIX + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, tag);
  view.setUint32(1, payload.byteLength, true);
  out.set(payload, PREFIX);
  return out;
}

function decodePayload(kind: Kind, payload: Uint8Array, wire: WireDecoders = DECODERS.get(PROTOCOL_VERSION)!): ReplayRecord {
  switch (kind) {
    case 'snap': {
      const s = wire.snapshot(payload);
      return { kind, tick: s.tick, bodies: s.bodies, ...(s.doors ? { doors: s.doors } : {}), ...(s.cranes?.length ? { cranes: s.cranes } : {}), ...(s.env ? { env: s.env } : {}) };
    }
    case 'cmd': {
      if (payload.byteLength < 8) throw new Error(`cmd record too short: ${payload.byteLength} bytes`);
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const tick = view.getUint32(0, true), id = view.getUint32(4, true);
      const batch = wire.commands(payload.subarray(8));
      if (batch.commands.length !== 1) throw new Error(`cmd record holds ${batch.commands.length} commands, not 1`);
      return { kind, tick, id, command: batch.commands[0]! };
    }
    default: {
      const body: unknown = JSON.parse(fromUtf8.decode(payload));
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error(`${kind} record is not a JSON object`);
      return { ...(body as object), kind } as ReplayRecord;
    }
  }
}

/**
 * The first record's header, or null: null for a buffer whose first whole record is not a header, or that holds no
 * whole record yet. No version is checked (a player or a lister shows what a file is before `decodeRecords` refuses
 * it); a header whose payload is not a JSON object throws, as a corrupt record does in `decodeRecords`.
 */
export function readReplayHeader(bytes: Uint8Array): ReplayHeader | null {
  if (bytes.byteLength < PREFIX) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = PREFIX + view.getUint32(1, true);
  if (view.getUint8(0) !== REPLAY_TAG.header || end > bytes.byteLength) return null;
  return (decodePayload('header', bytes.subarray(PREFIX, end)) as { header: ReplayHeader }).header;
}

/** The options of `decodeRecords`. */
export interface DecodeRecordsOptions {
  /**
   * The wire protocols the caller accepts (default: every one in `REPLAY_PROTOCOLS`). A protocol this build holds no
   * decoder for is refused whether listed or not (research 240 §2, "Versions"; research 224).
   */
  allowProtocols?: number[];
}

/**
 * The records a buffer holds, in order; a trailing partial record is reported, not thrown (a tab closed mid-segment
 * leaves a readable prefix). A whole record whose payload does not decode is a corrupt file and throws. A whole record
 * with a tag this build does not know is skipped, by its length, in a format-2 file (RE-2, W38.R2: a later kind; counted
 * in `skipped`, present only when one was), and throws in a format-1 file, which never held one.
 *
 * The first whole record must be the header (else `replay has no header`), and its versions must be ones this build
 * reads: a `format` outside `REPLAY_FORMATS`, or a `protocol` outside `REPLAY_PROTOCOLS` (the `snap` and `cmd`
 * payloads are the wire's frames of the header's protocol, decoded by that protocol's decoders: NET-WIRE kept protocol
 * 10's), throws before any payload is decoded -- a file of another version is refused, never misdecoded (research 240
 * §2, "Versions"). An empty buffer, or
 * one whose first record is cut short, holds no whole record and returns none.
 */
export function decodeRecords(bytes: Uint8Array, options: DecodeRecordsOptions = {}): { records: ReplayRecord[]; truncated: boolean; skipped?: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength === 0) return { records: [], truncated: false };
  if (bytes.byteLength < PREFIX || PREFIX + view.getUint32(1, true) > bytes.byteLength) return { records: [], truncated: true };
  const header = readReplayHeader(bytes);
  if (!header) throw new Error('replay has no header');
  if (!REPLAY_FORMATS.includes(header.format)) {
    throw new Error(`unsupported replay format ${String(header.format)} (this build reads ${REPLAY_FORMATS.join(', ')})`);
  }
  const skips = header.format >= SKIPS_UNKNOWN_FROM;
  // `allowProtocols` names what a caller would accept; only a protocol with a decoder passes.
  const decodable: number[] = (options.allowProtocols ?? [...REPLAY_PROTOCOLS]).filter((p) => DECODERS.has(p));
  if (!decodable.includes(header.protocol)) {
    throw new Error(`unsupported replay protocol ${String(header.protocol)} (this build decodes ${REPLAY_PROTOCOLS.join(', ')})`);
  }
  const wire = DECODERS.get(header.protocol)!;
  const records: ReplayRecord[] = [];
  let at = 0, skipped = 0;
  const out = (truncated: boolean) => ({ records, truncated, ...(skipped ? { skipped } : {}) });
  while (at < bytes.byteLength) {
    if (at + PREFIX > bytes.byteLength) return out(true);
    const tag = view.getUint8(at);
    const length = view.getUint32(at + 1, true);
    const end = at + PREFIX + length;
    if (end > bytes.byteLength) return out(true);
    const kind = KIND_OF_TAG.get(tag);
    if (kind) records.push(decodePayload(kind, bytes.subarray(at + PREFIX, end), wire));
    else if (skips) skipped++;                                // RE-2 (W38.R2): a later kind, skipped by its length
    else throw new Error(`unknown replay record tag ${tag} at byte ${at}`);
    at = end;
  }
  return out(false);
}

/** A writer that appends records to chunks (`flush` hands the bytes since the last flush to the sink). */
export class ReplayWriter {
  private pending: Uint8Array[] = [];
  private size = 0;
  constructor(private readonly sink: (bytes: Uint8Array) => void) {}
  write(r: ReplayRecord): void {
    const bytes = encodeRecord(r);
    this.pending.push(bytes);
    this.size += bytes.byteLength;
  }
  /** Hands the bytes written since the last flush to the sink, once; nothing written, nothing handed. */
  flush(): void {
    if (this.size === 0) return;
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const b of this.pending) { out.set(b, at); at += b.byteLength; }
    this.pending = [];
    this.size = 0;
    this.sink(out);
  }
}

type Zlib = typeof import('node:zlib');
/**
 * `node:zlib`, loaded only when called: the module also loads in the page's bundle, which never gzips (the page sends
 * a segment uncompressed and the session service gzips it). Through `process.getBuiltinModule` (Node >= 22.3), as
 * `../../../central/src/serviceStore.ts` loads `node:sqlite`; no top-level import of a Node module.
 */
function zlib(): Zlib {
  let mod: Zlib | undefined;
  try {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
    mod = proc?.getBuiltinModule?.('node:zlib') as Zlib | undefined;
  } catch {
    mod = undefined;
  }
  if (!mod?.gzipSync) throw new Error('gzipReplay/gunzipReplay need Node (node:zlib); the page sends its segments uncompressed');
  return mod;
}
const plain = (b: Uint8Array): Uint8Array => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

/** The whole file: gzip of the concatenated records (`node:zlib` in Node; the page sends uncompressed and the service gzips). */
export function gzipReplay(bytes: Uint8Array): Uint8Array {
  return plain(zlib().gzipSync(bytes));
}
export function gunzipReplay(bytes: Uint8Array): Uint8Array {
  return plain(zlib().gunzipSync(bytes));
}

/**
 * The index of the nearest `snap` at or before `tick`, or -1 (the design's seek rule, SEEK_SNAPSHOT_RULE_ADAPTATION):
 * the `snap` with the greatest tick not after the target, the later record on a tie.
 */
export function seekIndex(records: readonly ReplayRecord[], tick: number): number {
  let best = -1;
  let bestTick = -Infinity;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (r.kind !== 'snap' || r.tick > tick) continue;
    if (r.tick >= bestTick) { best = i; bestTick = r.tick; }
  }
  return best;
}
