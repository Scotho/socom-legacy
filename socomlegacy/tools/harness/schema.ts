/**
 * The parity harness field schema (plan `2026-10-11-web-parity-harness.md` section 2.2, PH-2).
 *
 * Each recomp read was re-read at the decompilation on the owner's host on 2026-10-26 (research 366 section 2), its
 * function and `D:L` lines cited: a reading, pending a fresh reviewer's re-read at the source. Where the source gave
 * another meaning the row says what it is; a field with no decisive site, or whose source meaning the port has no
 * reading of, is recorded and masked, never scored. U6 is settled: `actor+0x404` is the floor hit's y, and
 * `matrix.y` reads the body node's translation. r0004's column is unavailable until the desktop's address match
 * places it (plan section 3.2) -- nothing is invented for it.
 */
export type FieldType = 'f32' | 'i32' | 'bits' | 'enum' | 'str';

export type Tolerance =
  | { kind: 'exact' }
  | { kind: 'abs'; limit: number; unit: string }
  | { kind: 'recorded' }
  | { kind: 'masked' }
  | { kind: 'position' };

export interface FieldDef {
  name: string;
  type: FieldType;
  /** The recomp read, r0001, as re-read at the source (research 366 section 2). r0004 is not filled in here. */
  recomp: string;
  port: string;
  tolerance: Tolerance;
  evidence: string;
  /** False: stored on the trace, not a scored line (PH.R9 keeps those apart). */
  scored: boolean;
  /**
   * PH.R8 (PH-23): the desktop's KNOWN section 1 row, by its key at the pinned commit, whose artefact measured this
   * field's behaviour on PCSX2 or a console. Absent, a line of this field against a recomp reference is recomp-only.
   */
  known?: string;
}

export class SchemaRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaRefusal';
  }
}

/**
 * X and the place button, as the plan's section 2.1 example writes the pad word (`0x4000` at the climb prompt,
 * `0x8000` the place button). The other fourteen bits are carried and compared exactly; they are not named here.
 */
export const PAD_X = 0x4000;
export const PAD_PLACE = 0x8000;
export const PRESS_EDGE_BITS = PAD_X | PAD_PLACE;

/**
 * Position bands from section 2.2: 0.05 u on the press frame, 0.5 u over a fall, 0.1 u otherwise (the rest band).
 * A fall is `vel.local.y < 0`. The fall band widens by `|dt_a - dt_b| * |v|` in the comparator (section 2.4, U1).
 */
export const POSITION_PRESS_U = 0.05;
export const POSITION_FALL_U = 0.5;
export const POSITION_REST_U = 0.1;

const R = (recomp: string, port: string, tolerance: Tolerance, evidence: string, scored: boolean, type: FieldType, name: string): FieldDef =>
  ({ name, type, recomp, port, tolerance, evidence, scored });

const EXACT = { kind: 'exact' } as const;

/**
 * The first field set, `frostfire-box` (section 2.2). One row per field the two emitters and the comparator share.
 */
export const FROSTFIRE_BOX: readonly FieldDef[] = [
  R('call index of the player\'s CZSealBody_Tick_0 (FUN_0057a330, D:L438655; its dt from actor+0x2e0, D:L439135)', 'game frames since the scenario started (two mover ticks a frame)', { kind: 'recorded' },
    'plan section 2.2: the frame index is the harness\'s count, not a game value; FUN_0057a330 as the tick re-read 2026-10-26 (research 366 section 2; its name a callgraph match). Recorded, not scored across traces: PH.R3 aligns on the press edge, so the indexes differ by that offset.', false, 'i32', 'frame'),
  R('guest_clock 0x4365c0 (0x4364e0 + 0xe0, advanced by FUN_002aa490, D:L151067)', 'seconds since the scenario started, at the stepped dt', { kind: 'abs', limit: 1e-3, unit: 's' },
    'research 366 section 2 (re-read 2026-10-26): FUN_002aa490 adds its argument to +0xe0 of its object; that the call at D:L151261 passes 0x4364e0 is not proven (a trace of the call settles it). Tolerance 1e-3 s.', true, 'f32', 't_guest'),
  R('difference of guest_clock', 'the dt the recorder stepped (two mover ticks)', { kind: 'recorded' },
    'plan section 2.2: dt is recorded, not scored. The fall tolerance widens by it (section 2.4, U1, H281\'s default).', false, 'f32', 'dt'),
  R('pad as read this frame', 'the button word fed this frame', EXACT,
    'plan section 2.2: exact, the alignment key. Bits 0x4000 and 0x8000 are the plan\'s X and place (section 2.1). Not re-read (the input trace is the desktop\'s instrument).', true, 'bits', 'pad.b'),
  R('pad lx as read', 'left stick x fed (0..255, 128 neutral)', EXACT, 'plan section 2.2: exact.', true, 'i32', 'pad.lx'),
  R('pad ly as read (0 = full forward)', 'left stick y fed (0 full forward, 128 neutral)', EXACT, 'plan section 2.1 and 2.2: ly 0 is full forward; exact.', true, 'i32', 'pad.ly'),
  R('pad rx as read', 'right stick x fed (0..255, 128 neutral)', EXACT, 'plan section 2.2: exact.', true, 'i32', 'pad.rx'),
  R('pad ry as read', 'right stick y fed (0..255, 128 neutral)', EXACT, 'plan section 2.2: exact.', true, 'i32', 'pad.ry'),
  R('actor+0x1c (r0001), the position at feet level', 'Walker.state.x', { kind: 'position' },
    'research 366 section 2 (re-read 2026-10-26): FUN_0054e8f0 D:L416877-416880 copies +0x1c..+0x24 and adds the root height to y. No writer found by name; a capture against the spawn raises it. r0004 +0x1c (desktop@be557831:tools_py/parity/guest_addresses.py:379).', true, 'f32', 'pos.x'),
  R('actor+0x20 (r0001), the feet y', 'Walker.state.y (the feet)', { kind: 'position' },
    'research 366 section 2: FUN_0054e8f0 D:L416880; FUN_00584240 D:L443762 compares the altitude + 1 with it; FUN_005a21b0 D:L459729 sets the altitude from it.', true, 'f32', 'pos.y'),
  R('actor+0x24 (r0001)', 'Walker.state.z', { kind: 'position' },
    'research 366 section 2: FUN_0054e8f0 D:L416877-416880.', true, 'f32', 'pos.z'),
  R('*(*(actor+0x28)+0x34): the body node\'s matrix translation y (U6 settled: actor+0x404 is the floor hit\'s y, not a matrix)', 'no port read of the body node\'s matrix', { kind: 'masked' },
    'research 366 section 2 (U6, re-read 2026-10-26): FUN_003157d0 D:L215068-215070 writes the node\'s translation at +0x30..+0x38; FUN_00550ef0 D:L418145 and FUN_005b5d40 D:L470273 read its y. actor+0x400..+0x41c is a copy of the floor hit record (FUN_005b0420 D:L467127-467141). Recorded, not scored: the port has no node matrix.', false, 'f32', 'matrix.y'),
  R('actor+0x2e4, the body\'s altitude (every tick), as of the last frame the climb was current', 'feet y the recorder kept while Traversal.state().kind was climb', { kind: 'abs', limit: 0.1, unit: 'u' },
    'research 366 section 2 (re-read 2026-10-26): +0x2e4 is the altitude each tick -- lowered by the fall speed in FUN_0059b440 D:L456496-456498, clamped to the floor on landing D:L456513-456523, pinned to the floor hit +0x404 in the suspended branch, FUN_005af930 D:L466784 (the plan cited D:L466781, a brace). The climb-only sample is the harness\'s. Tolerance 0.1 u.', true, 'f32', 'feetY.climb'),
  R('actor+0x2c (r0001), the body-frame velocity', 'Walker.state.vx', { kind: 'abs', limit: 1, unit: 'u/s' },
    'research 366 section 2 (re-read 2026-10-26): FUN_0057a330 D:L439134-439138 sets +0x2c..+0x34 to the root delta over dt; D:L438971/438978 set x and z from the stick; D:L438988-438990 zero it.', true, 'f32', 'vel.local.x'),
  R('actor+0x30 (r0001), the body-frame velocity', 'Walker.state.vy', { kind: 'abs', limit: 1, unit: 'u/s' },
    'research 366 section 2: FUN_0057a330 D:L439134-439138.', true, 'f32', 'vel.local.y'),
  R('actor+0x34 (r0001), the body-frame velocity', 'Walker.state.vz', { kind: 'abs', limit: 1, unit: 'u/s' },
    'research 366 section 2: FUN_0057a330 D:L439134-439138.', true, 'f32', 'vel.local.z'),
  R('unread: not actor+0x64 (no float use in the seal code); actor+0x38 the likely word', 'Walker.state.vx (the port keeps one velocity vector)', { kind: 'masked' },
    'research 366 section 2 (re-read 2026-10-26): no decisive site for actor+0x64..+0x6c; +0x38..+0x40 is copied into the carry +0x1350..+0x1358 (FUN_005af930 D:L466972-466974) and research 50 maps SOCOM 1\'s world velocity there -- a read owed. Recorded, not scored until read.', false, 'f32', 'vel.world.x'),
  R('unread: not actor+0x68; actor+0x3c the likely word', 'Walker.state.vy (the port keeps one velocity vector)', { kind: 'masked' },
    'research 366 section 2: as vel.world.x. Recorded, not scored until read.', false, 'f32', 'vel.world.y'),
  R('unread: not actor+0x6c; actor+0x40 the likely word', 'Walker.state.vz (the port keeps one velocity vector)', { kind: 'masked' },
    'research 366 section 2: as vel.world.x. Recorded, not scored until read.', false, 'f32', 'vel.world.z'),
  R('actor+0x534, the current play\'s motion-type id (a short), mapped to climb / place / none', 'climb while Traversal.state().kind is climb; place while the place hold is current; else none', EXACT,
    'research 366 section 2 (re-read 2026-10-26): FUN_0057d5e0 D:L440391-440393 writes the top play\'s motion id (play record +0x22) through the anim set at +0x528; FUN_00577e40 D:L437404-437409 tests it. The enum is the harness\'s mapping of motion ids (research 313\'s names, not re-read).', true, 'enum', 'action.current'),
  R('actor+0x1c8 + 1: the play count (+0x1c8 is the top index into the play array at *(actor+0x1c0), -1 empty)', '1 while a climb, a hold or a mover action is current, else 0 (the plan\'s "1 today")', EXACT,
    'research 366 section 2 (re-read 2026-10-26): FUN_00555170 D:L419950-419954; pops run while the index is >= 1 (D:L437905). Whether the base play is always present (so a climb reads 2) is unread; the port has no covered-move depth until PB-7 (b).', true, 'i32', 'action.depth'),
  R('unnamed: the top play\'s phase (research 230 points to play+0x1c, unread)', 'Traversal.state().key while a climb clip plays', { kind: 'masked' },
    'research 366 section 2 (re-read 2026-10-26): the plan gives no offset and none was read. Recorded, not scored until an offset is named and read.', false, 'f32', 'play.phase'),
  R('unread: the steer is the play\'s vector set (+0x6c, +0x7c, +0x8c); play+0x78 is its active marker', 'no public port read (the steer is private on the running clip)', { kind: 'masked' },
    'research 366 section 2 (re-read 2026-10-26): in FUN_0057a330 play+0x78 is tested and cleared (D:L439017, D:L439026) and set to the play\'s own address by FUN_00578990 (D:L437864, at D:L437941), so it is not a float steer; which vector is the steer is unread. Recorded, not scored.', false, 'f32', 'play.steer'),
  R('FUN_005af930\'s suspended branch (D:L466782-466787): motion 0x2e, 0x2a, 0x23, 0x2d or two DAT_ ids current, or state +0x174 == 4 -- the gravity step skipped', '1 while the port\'s traversal runs a climb', EXACT,
    'research 366 section 2 (re-read 2026-10-26): the function starts D:L466729; the branch skips FUN_0059b440 and returns 0; D:L466754 (+0x1061 bit 3) also exits early. The source has no vy condition. Whether the port\'s ladder is one of those motions is unread.', true, 'i32', 'gravity.suspended'),
  R('actor+0xe1 bit 4: an active flag, its meaning unread (not airborne; the fall flag is +0x105e bit 5)', 'no port reading (the port has no actions-permitted flag)', { kind: 'masked' },
    'research 366 section 2 (re-read 2026-10-26; review F3): set in FUN_0029ee10 D:L145030, from a parameter at construction (FUN_003a9930 D:L300741), cleared in FUN_0029e8b0 D:L144775 at the seal\'s teardown (FUN_00547af0 D:L413024), and required by FUN_0057d540 D:L440342 to start an action; it has many readers and reads as an active flag, its meaning unread. The port\'s inAir is not this bit. Recorded, not scored.', false, 'i32', 'flags.e1bit4'),
  R('actor+0x200, the != 4 gate (FUN_005be9a0 D:L475305)', 'no port read in the headless recorder', EXACT,
    'research 366 section 2 (re-read 2026-10-26): the gate is D:L475305 (the plan cited D:L475310, which reads +0x105e); FUN_005448a0 D:L410938-410941 keeps the old value at +0x201 and a changed flag at +0x202. "View mode" is not proven. No reading here: the line is skipped.', true, 'i32', 'flags.0x200'),
  R('the top play\'s +0x2b (!= 8)', 'no port reading', { kind: 'masked' },
    'research 366 section 2 (re-read 2026-10-26): FUN_0057d540 D:L440343; FUN_0057a330 D:L439151; written at push by FUN_0028dc90 D:L135204. Not the floor record\'s +0x2b (FUN_0059b440 D:L456563-456565). Masked where the port has no reading.', false, 'i32', 'flags.2b'),
  R('*(the claymore object)+0x87c, the 1.3 s timer (its owner, the actor, at object+0x830)', 'grenade placing clock, seconds, when a grenade page is attached', { kind: 'abs', limit: 1, unit: 'frame' },
    'research 366 section 2 (re-read 2026-10-26): FUN_005be9a0 D:L475324-475327 writes 1.3 into +0x87c of its own object, not the actor. Tolerance 1 frame. The headless walk reads it from its GrenadeThrower (PH-3).', true, 'f32', 'claymore.timer'),
  R('the charges placed, by the owner\'s id (actor+4), from the charge registry (< 4)', 'grenade placed count when a grenade page is attached', EXACT,
    'research 366 section 2 (re-read 2026-10-26): FUN_005be9a0 D:L475307-475308 counts them through FUN_003cc1f0 and requires fewer than 4; object+0x818 counts placements (D:L475328). The headless walk reads it from its GrenadeThrower (PH-3).', true, 'i32', 'claymore.placed'),
  R('actor+0x374, the wished stance byte (0/1/2)', 'Walker.pendingStance, else Walker.posture', EXACT,
    'research 366 section 2 (re-read 2026-10-26): FUN_00552d60 (D:L418865) retries it at D:L418875-418906; its callee FUN_00552ec0 (D:L418914) resets it to +0x174 on refusal (D:L418991, D:L419011). The value-to-stance names are unread.', true, 'enum', 'stance.wished'),
  R('actor+0x1044, a float 0..1', 'no port read on the headless walker', { kind: 'recorded' },
    'research 366 section 2 (re-read 2026-10-26): set to 1.0 in FUN_00553ea0 D:L419759; <= 0 gates FUN_005af930 D:L466816; below 0.25 at D:L427229. Recorded (a death ends the scenario), not scored.', false, 'f32', 'health'),
  R('actor+0xF7A, a life-state byte (1 alive; 3 set on death; 2 or 3 to 1 a revival)', '0 when Walker.dead, else 1 (not the source\'s encoding)', { kind: 'recorded' },
    'research 366 section 2 (re-read 2026-10-26): the setter FUN_00544210 D:L410551-410556; the death paths D:L410529-410530, D:L412701-412702. KNOWN section 1 (a recomp run, desktop@be557831:docs/KNOWN.md:54): 1 -> 2 on the death row, -> 3 at +3.7 s. Recorded, not scored; a death ends the scenario.', false, 'i32', 'alive'),
  R('actor+0x1368 (r0001)', '1 (single player; the headless recorder has no MoveScale)', EXACT,
    'research 366 section 2 (re-read 2026-10-26): FUN_00551ec0 D:L418621-418623 scales +0x23c..+0x244 by it; the setter FUN_00553dc0 D:L419379-419384 clamps to [0,1]; the constructor sets 1.0 (D:L419814). Research 79\'s rule: exact 1.0, else the frame is rejected.', true, 'f32', 'moveScale'),
  R('actor+0x20 + *(*(actor+0x2e8)+4): the feet y plus the root\'s height over it (root_node)', 'feet y plus the posed root over the feet (Traversal.pose().rootY, else the stance root)', { kind: 'abs', limit: 0.1, unit: 'u' },
    'research 366 section 2 (re-read 2026-10-26): the root\'s height is local, added to +0x20 at D:L416880 and FUN_005aca70 D:L465173; the recorder adds it so both columns are absolute. Tolerance 0.1 u.', true, 'f32', 'root.y'),
  R('*(the hit record FUN_005b5d40 returns)+4, copied to actor+0x404 (FUN_005b0420 D:L467127-467141)', 'floorUnder at the feet', { kind: 'abs', limit: 0.1, unit: 'u' },
    'research 366 section 2 (re-read 2026-10-26): FUN_005b5d40 (D:L470165) returns a pointer to the chosen 32-byte hit, or 0 (D:L470298): the highest at or below the probe plus the window, else the lowest (D:L470233-470240). Tolerance 0.1 u.', true, 'f32', 'floor.y'),
  R('the altitude window FUN_005b0420 passes (1.0, D:L467055)', 'no port read of that window (the probe lift is a different quantity)', EXACT,
    'research 366 section 2 (re-read 2026-10-26): FUN_005b0420 (D:L467030) passes 1.0 at D:L467055, used at D:L470233; a second path (FUN_0054edf0 to FUN_005b4f30, D:L417178-417179, D:L469708) passes a computed value, so 1.0 holds on that path only. The probe lift (probeLiftOf, LATER 785) is not that argument: the line is skipped.', true, 'f32', 'floor.window'),
];

/** The recomp's revisions this harness knows: the r0001 disc and PSRewired's r0004 capsule over it. */
export type Revision = 'r0001' | 'r0004';
const REVISIONS: readonly Revision[] = ['r0001', 'r0004'];

/**
 * PH-2: the guest addresses the recomp reads go through, per revision -- the desktop's PROBE_ADDRESSES, in its shape
 * (desktop@be557831:tools_py/parity/guest_addresses.py:57-62; each r0004 value placed by its twins there).
 */
export const RECOMP_ADDRESSES: Readonly<Record<'player_actor' | 'guest_clock', Readonly<Record<Revision, number>>>> = {
  player_actor: { r0001: 0x00408c58, r0004: 0x00435618 },
  guest_clock: { r0001: 0x004365c0, r0004: 0x00442fd0 },
};

/**
 * PH-2: each field's actor displacement per revision, for the fields whose recomp read is one actor word (or, for
 * `root.y`, the root node pointer's displacement). r0001 is the row's own read (research 366 section 2). r0004 is the
 * desktop's only where it established one -- the position triple, `root_node` and `move_scale`
 * (desktop@be557831:tools_py/parity/guest_addresses.py:376-380, PROBE_OFFSETS) -- and null otherwise. The desktop's table
 * leaves health and alive out on purpose, as the online ladder's r0001 offsets with no r0004 value established ("a
 * column filled by assumption is the defect this table exists to stop", :443-447); the other fields are absent from it.
 * A field read through a chain or another object is not keyed here.
 */
export const RECOMP_OFFSETS: Readonly<Record<string, Readonly<{ r0001: number; r0004: number | null }>>> = {
  'pos.x': { r0001: 0x1c, r0004: 0x1c },
  'pos.y': { r0001: 0x20, r0004: 0x20 },
  'pos.z': { r0001: 0x24, r0004: 0x24 },
  'feetY.climb': { r0001: 0x2e4, r0004: null },
  'vel.local.x': { r0001: 0x2c, r0004: null },
  'vel.local.y': { r0001: 0x30, r0004: null },
  'vel.local.z': { r0001: 0x34, r0004: null },
  'action.current': { r0001: 0x534, r0004: null },
  'action.depth': { r0001: 0x1c8, r0004: null },
  'flags.e1bit4': { r0001: 0xe1, r0004: null },
  'flags.0x200': { r0001: 0x200, r0004: null },
  'stance.wished': { r0001: 0x374, r0004: null },
  health: { r0001: 0x1044, r0004: null },
  alive: { r0001: 0xf7a, r0004: null },
  moveScale: { r0001: 0x1368, r0004: 0x136c },
  'root.y': { r0001: 0x2e8, r0004: 0x2e8 },
};

/**
 * One field's displacement on one revision: null where that revision's is not established. An unknown field or
 * revision is refused -- never answered with another column's number (the desktop's `offset()` contract: r0001's
 * 0x1368 read on r0004 presents as 0.0, not as an error).
 */
export function recompOffset(field: string, revision: Revision): number | null {
  const col = RECOMP_OFFSETS[field];
  if (!col) throw new SchemaRefusal(`no recomp offset for ${field}`);
  if (!REVISIONS.includes(revision)) throw new SchemaRefusal(`no revision ${String(revision)} (have ${REVISIONS.join(', ')})`);
  return col[revision];
}

export const FIELD_SETS: Readonly<Record<string, readonly FieldDef[]>> = {
  'frostfire-box': FROSTFIRE_BOX,
};

export function fieldSet(name: string): readonly FieldDef[] {
  const set = FIELD_SETS[name];
  if (!set) throw new SchemaRefusal(`unknown field set ${name}`);
  return set;
}

/** A field with no evidence, or with no tolerance, is refused (PH-2). */
export function checkSchema(fields: readonly FieldDef[]): void {
  const names = new Set<string>();
  for (const f of fields) {
    if (!f.name) throw new SchemaRefusal('a field has no name');
    if (names.has(f.name)) throw new SchemaRefusal(`duplicate field ${f.name}`);
    names.add(f.name);
    if (!f.evidence.trim()) throw new SchemaRefusal(`${f.name} has no evidence`);
    if (!f.tolerance || !f.tolerance.kind) throw new SchemaRefusal(`${f.name} has no tolerance`);
    if (f.tolerance.kind === 'abs' && !(f.tolerance.limit >= 0)) throw new SchemaRefusal(`${f.name} has a tolerance that is not a limit`);
    if (!f.recomp.trim() || !f.port.trim()) throw new SchemaRefusal(`${f.name} has no recomp or port read`);
  }
}

checkSchema(FROSTFIRE_BOX);

export function fieldByName(set: readonly FieldDef[], name: string): FieldDef | undefined {
  return set.find((f) => f.name === name);
}
