import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  decodeCommands, decodeSnapshot, decodeSnapshotV10, encodeCommands, encodeSnapshot, PROTOCOL_VERSION, TICK_HZ, SNAPSHOT_HZ, type BodyState, type Command,
  type EnvWire, type ServerEvent,
} from '../../viewer/src/sim';
import type { HostageWire } from '../../viewer/src/net/protocol';
import {
  decodeRecords, encodeRecord, gzipReplay, gunzipReplay, readReplayHeader, REPLAY_FORMAT_VERSION, REPLAY_FORMATS, REPLAY_PROTOCOLS, REPLAY_TAG,
  ReplayWriter, seekIndex, type ReplayHeader, type ReplayRecord,
} from '../src/replay/format';
import { encodeSnapshot as encodeSnapshotPre337 } from '../../viewer/test/fixtures/codecPre337';

const body = (id: number, x: number): BodyState => ({
  id, feet: [x, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 0, stance: 0, landing: 0, jumps: 0, ground: 1,
  groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: -1, turnRate: 0, trav: 0, travFrame: 0, travRootY: NaN, travBlend: 0, travBlendWeight: 0,
  peek: 0, weapon: 255, slot: 0,
});
const header: ReplayRecord = { kind: 'header', header: {
  format: REPLAY_FORMAT_VERSION, protocol: PROTOCOL_VERSION, build: { commit: 'abc1234', dirty: false, branch: 'agent/playtest', branchCreated: null },
  map: 'MP2', rules: 'classic', gameType: null, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ, kind: 'solo', serverName: null,
  startedAt: '2026-10-06T00:00:00.000Z', session: { id: '20261006-1a2b', segment: 0 } } };

describe('the .s2r format', () => {
  it('round-trips every record kind in order', () => {
    const records: ReplayRecord[] = [
      header,
      { kind: 'players', tick: 0, players: [{ id: 1, name: 'A', team: 'seal', role: 'player', char: 0 }] },
      { kind: 'snap', tick: 2, bodies: [body(1, 10)] },
      { kind: 'event', tick: 3, event: { type: 'left', id: 1 } },
      { kind: 'cmd', tick: 3, id: 1, command: { seq: 1, forward: 1, right: 0, yaw: 90, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 } },
      { kind: 'mark', tick: 4, observation: 'PT-20261006-1a2b-1', at: '2026-10-06T00:00:01.000Z' },
      { kind: 'end', tick: 5, reason: 'closed' },
    ];
    const bytes = Buffer.concat(records.map((r) => Buffer.from(encodeRecord(r))));
    const out = decodeRecords(bytes);
    expect(out.truncated).toBe(false);
    expect(out.records.map((r) => r.kind)).toEqual(records.map((r) => r.kind));
    expect((out.records[2] as { bodies: BodyState[] }).bodies[0]!.feet[0]).toBeCloseTo(10, 1);   // the codec quantises
  });
  it('reports a trailing partial record and keeps the whole ones', () => {
    const whole = encodeRecord(header);
    const cut = Buffer.concat([Buffer.from(whole), Buffer.from(whole).subarray(0, 7)]);
    const out = decodeRecords(cut);
    expect(out.records).toHaveLength(1);
    expect(out.truncated).toBe(true);
  });
  it('flushes only what was written since the last flush', () => {
    const chunks: Uint8Array[] = [];
    const w = new ReplayWriter((b) => chunks.push(b));
    w.write(header); w.flush(); w.write({ kind: 'end', tick: 1, reason: 'x' }); w.flush(); w.flush();
    expect(chunks).toHaveLength(2);
    expect(decodeRecords(Buffer.concat(chunks.map((c) => Buffer.from(c)))).records).toHaveLength(2);
  });
  it('gzips and ungzips the file', () => {
    const bytes = encodeRecord(header);
    const z = gzipReplay(bytes);
    expect(Buffer.from(gunzipSync(z))).toEqual(Buffer.from(bytes));
    expect(Buffer.from(gunzipReplay(z))).toEqual(Buffer.from(bytes));
  });
  it('seeks to the nearest earlier snapshot', () => {
    const records: ReplayRecord[] = [header, { kind: 'snap', tick: 2, bodies: [] }, { kind: 'event', tick: 3, event: { type: 'left', id: 1 } }, { kind: 'snap', tick: 4, bodies: [] }];
    expect(seekIndex(records, 3)).toBe(1);
    expect(seekIndex(records, 4)).toBe(3);
    expect(seekIndex(records, 1)).toBe(-1);
  });
});

/**
 * A protocol 10 recording (NET-WIRE): its `snap` payload the 166 bytes protocol 10's `encodeSnapshot` wrote
 * (`viewer/test/fixtures/snapshot-v10.hex`, committed with the frozen decoder), its `cmd` payload a u32 tick, a u32 id and
 * the 21 bytes protocol 10's `encodeCommands` wrote for one command (its kind byte 1, the voice's type since protocol 11):
 * each written before the bump, neither re-encoded here.
 */
const V10_SNAPSHOT = Uint8Array.from(Buffer.from(readFileSync(new URL('../../viewer/test/fixtures/snapshot-v10.hex', import.meta.url), 'utf8').trim(), 'hex'));
const V10_COMMAND = Uint8Array.from(Buffer.from('010090844501090300007fc100401efbe204030211', 'hex'));
const rawRecord = (tag: number, payload: Uint8Array): Buffer => {
  const out = Buffer.alloc(5 + payload.byteLength);
  out.writeUInt8(tag, 0); out.writeUInt32LE(payload.byteLength, 1); out.set(payload, 5);
  return out;
};
const cmdPayload = (tick: number, id: number, frame: Uint8Array): Uint8Array => {
  const out = Buffer.alloc(8 + frame.byteLength);
  out.writeUInt32LE(tick, 0); out.writeUInt32LE(id, 4); out.set(frame, 8);
  return out;
};
const V10_FILE = Buffer.concat([
  Buffer.from(encodeRecord({ kind: 'header', header: { ...(header as { header: ReplayHeader }).header, protocol: 10 } })),
  rawRecord(3, V10_SNAPSHOT), rawRecord(5, cmdPayload(4242, 3, V10_COMMAND)),
  Buffer.from(encodeRecord({ kind: 'end', tick: 123456, reason: 'closed' })),
]);

describe('the .s2r versions (PT-01b)', () => {
  const base = (header as { header: ReplayHeader }).header;
  const fileOf = (h: Partial<ReplayHeader>): Uint8Array => Buffer.concat([
    Buffer.from(encodeRecord({ kind: 'header', header: { ...base, ...h } })),
    Buffer.from(encodeRecord({ kind: 'snap', tick: 2, bodies: [body(1, 10)] })),
  ]);
  it('refuses a replay recorded under a protocol it holds no decoder for, and readReplayHeader still names it', () => {
    expect(REPLAY_PROTOCOLS).toEqual([10, 11, 12, 13]);
    expect(PROTOCOL_VERSION).toBe(13);                           // PLANT-AIM (F2): the plant's pick; 12 SEP-POP (B1): the command's `separate` bit
    for (const protocol of [PROTOCOL_VERSION + 1, 9]) {
      const bytes = fileOf({ protocol });
      expect(() => decodeRecords(bytes)).toThrow(`unsupported replay protocol ${protocol} (this build decodes 10, 11, 12, 13)`);
      expect(readReplayHeader(bytes)?.protocol).toBe(protocol);
      expect(readReplayHeader(bytes)?.map).toBe('MP2');
    }
  });
  it('allowProtocols narrows what a caller takes, never past the decoders this build holds', () => {
    expect(() => decodeRecords(fileOf({ protocol: 9 }), { allowProtocols: [9] })).toThrow('unsupported replay protocol 9');
    expect(decodeRecords(fileOf({}), { allowProtocols: [PROTOCOL_VERSION] }).records).toHaveLength(2);
    expect(() => decodeRecords(V10_FILE, { allowProtocols: [11] })).toThrow('unsupported replay protocol 10');
  });
  it("chooses the decoder by the header's protocol: a protocol 10 recording plays through the frozen decoders (NET-WIRE, PT-01b)", () => {
    const out = decodeRecords(V10_FILE);
    expect(out.truncated).toBe(false);
    expect(out.records.map((r) => r.kind)).toEqual(['header', 'snap', 'cmd', 'end']);
    const snap = out.records[1] as Extract<ReplayRecord, { kind: 'snap' }>;
    const frozen = decodeSnapshotV10(V10_SNAPSHOT);
    expect(snap.tick).toBe(123456);
    expect(snap.bodies).toEqual(frozen.bodies);
    expect(snap.bodies.map((b) => [b.id, b.feet])).toEqual([[2, [1234.5, 67.25, -890.125]], [240, [0, 0, 600]]]);
    expect(snap.doors).toEqual(frozen.doors);
    expect(snap.env).toEqual({ revision: 70000, epoch: 3, states: [{ id: 2, active: true }, { id: 513, active: false }] });
    const cmd = out.records[2] as Extract<ReplayRecord, { kind: 'cmd' }>;
    expect([cmd.tick, cmd.id]).toEqual([4242, 3]);
    expect(cmd.command).toEqual({ seq: 777, forward: 1, right: -63 / 127, yaw: 90, pitch: -12.5, turn: 1.25, buttons: 0x203, stance: 1, weapon: 1 });
  });
  it('a protocol 11 recording (before SEP-POP\'s bit) still plays: its cmd reads as written, separate false (B1)', () => {
    // The 21 bytes protocol 11's `encodeCommands` wrote for one command (kind 2; the stance byte 0x12: stance 2, weapon 1,
    // bit 3 never set before protocol 12), taken from 60b9d7b49's codec before the bump, not re-encoded here.
    const V11_COMMAND = Uint8Array.from(Buffer.from('020090844501090300007fc100401efbe204230212', 'hex'));
    const file = Buffer.concat([
      Buffer.from(encodeRecord({ kind: 'header', header: { ...(header as { header: ReplayHeader }).header, protocol: 11 } })),
      rawRecord(5, cmdPayload(4242, 3, V11_COMMAND)),
    ]);
    const out = decodeRecords(file);
    const cmd = out.records[1] as Extract<ReplayRecord, { kind: 'cmd' }>;
    expect([cmd.tick, cmd.id]).toEqual([4242, 3]);
    expect(cmd.command).toMatchObject({ seq: 777, buttons: 0x223, stance: 2, weapon: 1, separate: false });
  });
  it('refuses a replay of another format', () => {
    const bytes = fileOf({ format: 4 });
    expect(() => decodeRecords(bytes)).toThrow('unsupported replay format 4 (this build reads 1, 2, 3)');
    expect(readReplayHeader(bytes)?.format).toBe(4);
  });
  it('refuses a buffer whose first record is not a header', () => {
    const bytes = encodeRecord({ kind: 'snap', tick: 2, bodies: [] });
    expect(() => decodeRecords(bytes)).toThrow('replay has no header');
    expect(readReplayHeader(bytes)).toBeNull();
  });
  it('reads nothing from an empty or cut-short first record (no header yet, not a refusal)', () => {
    expect(decodeRecords(new Uint8Array(0))).toEqual({ records: [], truncated: false });
    expect(decodeRecords(encodeRecord(header).subarray(0, 7))).toEqual({ records: [], truncated: true });
    expect(readReplayHeader(new Uint8Array(0))).toBeNull();
  });
});

/**
 * RE-2 (web sprint 38; W38.R2; research 249 §3): the `hostages` record -- the roster as the room's welcome carries it
 * (`HostageWire`) -- and the reader's tolerance. The format-1 reader threw on any tag it did not know, so it cannot skip
 * the new kind: the version moves to 2 (W38.R2's own condition), format 1 still reads, and from format 2 a kind the
 * reader does not know is skipped by its length -- an older viewer reads a newer file.
 */
describe('RE-2: the hostages record and an unknown kind (W38.R2)', () => {
  const base = (header as { header: ReplayHeader }).header;
  const hostage = (id: number, over: Partial<HostageWire> = {}): HostageWire => ({
    id, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17,
    name: id === 240 ? 'Hostage' : `Hostage${id - 239}`, character: `mp_fem${id - 239}`, at: [id, 0, -id], yaw: 1.5, ...over,
  });
  it('round-trips a hostages record with every field the welcome carries, a dead one with its clip and age', () => {
    const hostages = [hostage(240), hostage(241, { alive: false, ai: 0, deathClip: 'die_front', age: 90 }), hostage(242, { leader: 3, ai: 9, unit: 0x23 })];
    const bytes = Buffer.concat([Buffer.from(encodeRecord(header)), Buffer.from(encodeRecord({ kind: 'hostages', tick: 7, hostages }))]);
    const out = decodeRecords(bytes);
    expect(out.truncated).toBe(false);
    expect(out.records[1]).toEqual({ kind: 'hostages', tick: 7, hostages });
    expect(REPLAY_TAG.hostages).toBe(8);
  });
  it('this build reads 1 and 2 (and 3, SIMDROP-INSTR): a format-1 file (no hostages) reads as before', () => {
    expect(REPLAY_FORMATS.slice(0, 2)).toEqual([1, 2]);
    const v1 = Buffer.concat([
      Buffer.from(encodeRecord({ kind: 'header', header: { ...base, format: 1 } })),
      Buffer.from(encodeRecord({ kind: 'snap', tick: 2, bodies: [body(1, 10)] })), Buffer.from(encodeRecord({ kind: 'end', tick: 2, reason: 'closed' })),
    ]);
    expect(decodeRecords(v1).records.map((r) => r.kind)).toEqual(['header', 'snap', 'end']);
  });
  it('a realistic format-1 file -- every v1 kind -- reads record for record, deep-equal, under the v2 reader, nothing skipped', () => {
    // Every recording made before RE-2 is format 1 (the owner's Crossroads record, sprint 36's retained matches). The
    // encoder of the v1 kinds is the base's unchanged (`payloadOf`, `encodeRecord`, tags 1-7, the wire codec: RE-2 added
    // tag 8 and the version only), so the current encoder stands in for the base's. A `snap` and a `cmd` come back as
    // the wire's own codec round-trips them (its quantisation, the same decoders the base used); the rest exactly.
    const env: EnvWire = { revision: 7, epoch: 2, states: [{ id: 2, active: true }, { id: 513, active: false }] };
    const doors = [{ valve: 3, phase: 1 }, { valve: 9, phase: 0 }];
    const command: Command = { seq: 41, forward: 1, right: 0, yaw: 90, pitch: -12.5, turn: 0, buttons: 0x203, stance: 1, weapon: 1 };
    const v1: ReplayRecord[] = [
      { kind: 'header', header: { ...base, format: 1, rules: 'respawn', gameType: '2', kind: 'dedicated', serverName: 'box', session: null } },
      { kind: 'players', tick: 0, players: [{ id: 1, name: 'A', team: 'seal', role: 'player', char: 2 }, { id: 5, name: 'S', team: null, role: 'spectator', char: 0 }] },
      { kind: 'snap', tick: 2, bodies: [body(1, 10), body(2, -20)], doors, env },
      { kind: 'event', tick: 3, event: { type: 'kill', killer: 1, victim: 2, weapon: 'M4A1', how: 'weapon', clip: 'die_back', cause: 3, voiced: true } as ServerEvent },
      { kind: 'cmd', tick: 3, id: 1, command },
      { kind: 'mark', tick: 4, observation: 'PT-20261006-1a2b-1', at: '2026-10-06T00:00:01.000Z' },
      { kind: 'snap', tick: 4, bodies: [], env },
      { kind: 'end', tick: 4, reason: 'match-over' },
    ];
    const bytes = Buffer.concat(v1.map((r) => Buffer.from(encodeRecord(r))));
    const out = decodeRecords(bytes);
    expect(out).not.toHaveProperty('skipped');
    expect(out.truncated).toBe(false);
    const wireSnap = (r: Extract<ReplayRecord, { kind: 'snap' }>) => {
      const s = decodeSnapshot(encodeSnapshot({ tick: r.tick, own: null, bodies: r.bodies, ...(r.doors ? { doors: r.doors } : {}), ...(r.env ? { env: r.env } : {}) }));
      return { kind: 'snap', tick: s.tick, bodies: s.bodies, ...(s.doors ? { doors: s.doors } : {}), ...(s.env ? { env: s.env } : {}) };
    };
    const expected = v1.map((r) => (r.kind === 'snap' ? wireSnap(r)
      : r.kind === 'cmd' ? { ...r, command: decodeCommands(encodeCommands({ viewTick: r.tick, commands: [r.command] })).commands[0] } : r));
    expect(out.records).toEqual(expected);
    expect((out.records[0] as { header: ReplayHeader }).header.format).toBe(1);
    const { doors: snapDoors, env: snapEnv } = out.records[2] as { doors: unknown; env: unknown };
    expect(snapDoors).toEqual(doors);
    expect(snapEnv).toEqual(env);
  });
  it('an older reader reads a newer file: a format-2 record of a kind it does not know is skipped by its length, the rest kept', () => {
    const later = rawRecord(99, new TextEncoder().encode(JSON.stringify({ tick: 3, whatever: [1, 2, 3] })));
    const bytes = Buffer.concat([
      Buffer.from(encodeRecord(header)), Buffer.from(encodeRecord({ kind: 'snap', tick: 2, bodies: [body(1, 10)] })), later, rawRecord(200, new Uint8Array(0)),
      Buffer.from(encodeRecord({ kind: 'event', tick: 3, event: { type: 'left', id: 1 } })), Buffer.from(encodeRecord({ kind: 'end', tick: 4, reason: 'closed' })),
    ]);
    const out = decodeRecords(bytes);
    expect(out.records.map((r) => r.kind)).toEqual(['header', 'snap', 'event', 'end']);
    expect(out.truncated).toBe(false);
    expect(out.skipped).toBe(2);
    // a record of an unknown kind cut short is a live prefix's tail, as any cut record is
    const cut = decodeRecords(Buffer.concat([Buffer.from(encodeRecord(header)), later.subarray(0, 8)]));
    expect(cut).toEqual({ records: [expect.objectContaining({ kind: 'header' })], truncated: true });
  });
  it('a format-1 file never held a kind past its seven: an unknown tag in one is still a corrupt file', () => {
    const v1 = Buffer.concat([Buffer.from(encodeRecord({ kind: 'header', header: { ...base, format: 1 } })), rawRecord(99, new Uint8Array(0))]);
    expect(() => decodeRecords(v1)).toThrow('unknown replay record tag 99');
  });
  it('nothing skipped, no `skipped` key: the decode of a known file is what it was', () => {
    expect(decodeRecords(encodeRecord(header))).toEqual({ records: [header], truncated: false });
  });
});

describe('#337 takeover (the wire, additive): a replay without hooks', () => {
  it("a snap record with no cranes decodes with none and re-encodes byte-identically, its snapshot main's bytes (the frozen pre-#337 codec)", () => {
    const doors = [{ valve: 1, phase: 3 }, { valve: 0, phase: 0 }];
    const env: EnvWire = { revision: 9, epoch: 2, states: [{ id: 4, active: true }, { id: 7, active: false }] };
    const snapRec: ReplayRecord = { kind: 'snap', tick: 321, bodies: [body(1, 10), body(2, -40)], doors, env };
    const bytes = Buffer.concat([header, snapRec].map((r) => Buffer.from(encodeRecord(r))));
    const out = decodeRecords(bytes);
    const snap = out.records[1] as Extract<ReplayRecord, { kind: 'snap' }>;
    expect('cranes' in snap).toBe(false);
    expect(Buffer.from(encodeRecord(snap)).toString('hex')).toBe(Buffer.from(encodeRecord(snapRec)).toString('hex'));
    const payload = Buffer.from(encodeSnapshotPre337({ tick: 321, own: null, bodies: snapRec.bodies, doors, env }));
    expect(Buffer.from(encodeRecord(snapRec)).includes(payload)).toBe(true);
  });
});

/**
 * SIMDROP-INSTR (sim drops #3 and #4; an instrument, no original -- REPLAY_ADAPTATION): the `refusal` record, a replay-only
 * kind (never a wire `ServerEvent`) -- a `fire: cone: *` refusal with the claimed eye and aim beside the room's eye locus.
 * The format moves to 3; a format-1 and a format-2 file still read.
 */
describe('SIMDROP-INSTR: the refusal record (format 3)', () => {
  const base = (header as { header: ReplayHeader }).header;
  const refusal: ReplayRecord = {
    kind: 'refusal', tick: 812, seat: 3, seq: 640, why: 'fire: cone: eye', eye: [10.5, 52.25, -3], aim: [1, 0, 0],
    locus: [10.5, 12.25, -3], distance: 40, lens: false, feet: [0, 20, 0], groundNormalY: 1, airborne: false, stance: 'crouch',
  };
  it('the format is version 3, and this build reads 1, 2 and 3', () => {
    expect(REPLAY_FORMAT_VERSION).toBe(3);
    expect(REPLAY_FORMATS).toEqual([1, 2, 3]);
    expect(REPLAY_TAG.refusal).toBe(9);
  });
  it('round-trips a refusal record, every field, in a format-3 file', () => {
    const bytes = Buffer.concat([Buffer.from(encodeRecord(header)), Buffer.from(encodeRecord(refusal)), Buffer.from(encodeRecord({ kind: 'end', tick: 900, reason: 'closed' }))]);
    const out = decodeRecords(bytes);
    expect((out.records[0] as { header: ReplayHeader }).header.format).toBe(3);
    expect(out.records).toEqual([header, refusal, { kind: 'end', tick: 900, reason: 'closed' }]);
    expect(out).not.toHaveProperty('skipped');
  });
  it('a format-1 and a format-2 file still read under the format-3 reader, record for record', () => {
    for (const format of [1, 2]) {
      const file: ReplayRecord[] = [
        { kind: 'header', header: { ...base, format } }, { kind: 'event', tick: 3, event: { type: 'left', id: 1 } }, { kind: 'end', tick: 4, reason: 'closed' },
      ];
      const out = decodeRecords(Buffer.concat(file.map((r) => Buffer.from(encodeRecord(r)))));
      expect(out.records).toEqual(file);
    }
  });
  it('a format-2 reader would have skipped the refusal by its length (tag 9 unknown to it): the kind is additive', () => {
    const v2 = Buffer.concat([
      Buffer.from(encodeRecord({ kind: 'header', header: { ...base, format: 2 } })), rawRecord(200, Buffer.from(encodeRecord(refusal)).subarray(5)),
      Buffer.from(encodeRecord({ kind: 'end', tick: 4, reason: 'closed' })),
    ]);
    const out = decodeRecords(v2);
    expect(out.records.map((r) => r.kind)).toEqual(['header', 'end']);
    expect(out.skipped).toBe(1);
  });
});
