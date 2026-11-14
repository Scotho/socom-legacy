/**
 * The death count (LATER 967's follow-up; research 421 section 13): what a directory of `.s2r` match replays records of
 * the port's deaths in real play, AGGREGATED -- by cause, by the clip the room chose, by the clip's end facing, by the
 * victim's posture and the killing part as far as the replay lets it be told, per build -- and the same deaths as the
 * fixed lists would draw them (LIMB-DEATH, 2026-11-12: a crouched or prone player's limb kill plays `Die`,
 * `death_stand_chest01`, not the stance's own BODY first).
 *
 * DEATH_COUNT_ADAPTATION: a measuring tool of ours (product track), with no original in the game; it reads replays the
 * port's own rooms wrote (`packages/match/src/replay/format.ts`, itself an adaptation) and changes nothing the game does.
 * It says nothing of what the original's players saw.
 *
 * AGGREGATES ONLY (the controller's hard condition): the output never names a player, an account, an id, a match, a
 * replay or a file. The core (`countDeaths`) takes the files' bytes alone, never their names; what it keeps per death
 * is dropped once counted; a file that will not decode is counted in a fixed bucket, never with the decoder's message
 * (a JSON parse error can quote the payload). A build is named by its commit (the header's `build.commit`) and protocol.
 *
 * What a replay records (read from the code, not assumed):
 * - the `kill` event (viewer `src/net/protocol.ts`, `type: 'kill'`): `victim`, `cause` (5 a bullet, 3 its head, 4 a
 *   blast, 7 a fall; `deathCause`), `clip` (the room's `deathClip`, null for a fall and for a standing or crouched
 *   blast) and `victimKind` ('hostage' for a hostage's body);
 * - the killing PART is NOT recorded: the room passes it to `kill` (match `src/room.ts`, `kill(..., part)`) but the
 *   broadcast event drops it; the `hurt` event that carries a part goes to its recipient only, never into a replay;
 * - the victim's POSTURE is in every snapshot (`BodyState.stance`, a `STANCE_CODES` index) -- the walker's posture, which
 *   reads `stand` while a crouch runs at full stick, so a crouch-runner's first dead snapshot may show `crouch`;
 * - the build is the header's `build` (`commit`, `dirty`) and `protocol`.
 *
 * So the part is inferred from cause and clip: cause 3 is the head; for cause 5 a clip only the stance's BODY list holds
 * is a body kill; the BODY list's first (`death_stand_chest01`, `death_crouch_back01`, `death_prone_chest01`) is a limb
 * kill or a body kill that drew it -- every recorded replay predates LIMB-DEATH, when a limb played the stance's own BODY
 * first. Those are reported as a range (none of them limbs .. all of them limbs) and as an expected split by the uniform
 * draw (`rand() % count`, viewer `src/net/deaths.ts` `pick`): a body kill draws each clip of its list equally often, so
 * the body kills that drew the first are expected to number the body-only kills over the list's other clips. Prone's
 * BODY list holds one clip, so the draw tells nothing there: the expected split takes the standing and crouched kills'
 * expected limb share instead (an assumption, said in the output; the range stands beside it).
 *
 * The lists are read from viewer `src/net/deaths.ts` itself (`deathClip`, enumerated over its draw), never retyped.
 *
 * Usage: `npx tsx tools/death-count.ts <dir> [--json <file>] [--exclude-bots]` from `socomlegacy/`. The directory is walked
 * for `*.s2r` (gzipped or plain); byte-identical files are counted once.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeRecords, gunzipReplay, type ReplayRecord } from '../packages/match/src/replay/format';
import { deathClip, DEATH_CAUSE } from '../packages/viewer/src/net/deaths';
import { PART } from '../packages/viewer/src/net/damage';
import { ACTION_CODES, BodyFlag, STANCE_CODES } from '../packages/viewer/src/net/protocol';

export const DEATH_COUNT_ADAPTATION =
  'DEATH_COUNT_ADAPTATION: a measuring tool of ours over the port\'s own replays; no original, no game behaviour changed';

type Stance = (typeof STANCE_CODES)[number];
export type Facing = 'up' | 'down' | 'side' | 'unknown';

/**
 * Each death clip's end facing, the clip's own on the SEAL (research 421 section 2's table, "own chest, SEAL"; the
 * test that measures it, viewer `test/deathPoses.test.ts`, calls a chest elevation over +30 UP, under -30 DOWN, else
 * SIDE). Transcribed: the measuring test computes them off the disc and exports no constant.
 */
export const CLIP_FACING: Readonly<Record<string, Facing>> = {
  death_stand_chest01: 'up', death_stand_chest02: 'up', death_stand_chest03: 'up', death_stand_rarm01: 'down',
  death_stand_larm01: 'up', death_stand_larm02: 'down', death_stand_groin02: 'down', death_stand_groin01: 'down',
  death_stand_head01: 'up', death_stand_head02: 'down', death_stand_head03: 'down', death_stand_head04: 'up',
  death_crouch_back01: 'down', death_crouch_chest01: 'up', death_crouch_chest02: 'up', death_crouch_head01: 'up',
  death_prone_chest01: 'up',
  death_buddy_stand01: 'side', death_buddy_stand02: 'up', death_buddy_stand03: 'down', death_buddy_crouch01: 'down',
  death_buddy_prone01: 'up',
};

/**
 * A death with no clip of its own (a fall, a standing or crouched blast) ends in the knock's or the landing's clip, read
 * off the victim's snapshots after the kill: `landDeath` is `Land forward` and `landBackwards` `Land backwards` (viewer
 * `src/mover.ts`; research 421 section 2: `seal_landforward01` DOWN, `seal_landbackwards01` UP); a fall still in the air
 * when the window closes ends the way it falls (`fallForward` forward, `fallBackwards` backwards).
 */
const ACTION_FACING: Readonly<Record<string, Facing>> = {
  landDeath: 'down', fallForward: 'down', landBackwards: 'up', fallBackwards: 'up',
};
/** How long after the kill the victim's snapshots are read for that landing: 3 s at the room's 60 Hz. */
const LANDING_WINDOW_TICKS = 180;

/** Every clip `deathClip` can draw for one case, in list order (its draw enumerated: `random` over 64 even steps). */
function drawable(part: number, stance: Stance): string[] {
  const out: string[] = [];
  for (let k = 0; k < 64; k++) {
    const c = deathClip('bullet', part, stance, () => (k + 0.5) / 64);
    if (c !== null && !out.includes(c)) out.push(c);
  }
  return out;
}
const STANCES: readonly Stance[] = STANCE_CODES;
/** The players' HEAD and BODY lists per stance, read from `deathClip`. */
export const HEAD_LIST: Readonly<Record<Stance, readonly string[]>> =
  Object.fromEntries(STANCES.map((s) => [s, drawable(PART.HEAD, s)])) as Record<Stance, string[]>;
export const BODY_LIST: Readonly<Record<Stance, readonly string[]>> =
  Object.fromEntries(STANCES.map((s) => [s, drawable(PART.BODY, s)])) as Record<Stance, string[]>;
/** A limb's clip as the fixed lists draw it, in every stance (LIMB-DEATH): `Die`. */
export const LIMB_CLIP_FIXED: string = drawable(PART.LARM, 'stand')[0]!;
/** A limb's clip in the recorded replays (before LIMB-DEATH): the stance's own BODY list's first. */
export const limbClipRecorded = (s: Stance): string => BODY_LIST[s][0]!;

const CAUSE_NAME: Readonly<Record<number, string>> = {
  [DEATH_CAUSE.BULLET]: '5 bullet', [DEATH_CAUSE.HEADSHOT]: '3 head', [DEATH_CAUSE.BLAST]: '4 blast', [DEATH_CAUSE.FALL]: '7 fall',
};
/** The kill's part as far as the replay tells it. */
export type PartClass = 'head' | 'body' | 'limb' | 'body or limb' | 'blast' | 'fall' | 'other';
const PART_CLASSES: readonly PartClass[] = ['head', 'body', 'limb', 'body or limb', 'blast', 'fall', 'other'];
const NO_CLIP = '(none: fall or blast)';

/** One death, while it is counted: no name, no id, no file (dropped once counted). */
interface Death {
  cause: number | null; clip: string | null; stance: Stance | null; bot: boolean; facing: Facing;
  snapshotStance: Stance | null;
}

/**
 * A count under the three limb scenarios: `low` none of the ambiguous kills a limb, `high` all of them, `expected` the
 * uniform draw's split (the header). For a clip or a facing it is the count in that scenario, not a minimum or maximum.
 */
export interface Range { low: number; expected: number; high: number }
export interface DeathCount {
  tool: 'death-count';
  adaptation: string;
  files: { read: number; duplicates: number; truncated: number; unreadable: Record<string, number> };
  builds: { build: string; protocol: number; files: number; deaths: number }[];
  deaths: { total: number; humanVictims: number; botVictims: number; hostagesExcluded: number; botsExcluded: boolean };
  byCause: Record<string, number>;
  byClip: Record<string, number>;
  byFacing: Record<Facing, number>;
  byPostureAndPart: Record<string, Record<PartClass, number>>;
  posture: { fromSnapshot: number; fromClip: number; unknown: number; clipAgainstSnapshot: Record<string, number> };
  parts: {
    head: number; body: number; limb: number;
    ambiguous: Record<Stance, number>;
    bodyOnly: Record<Stance, number>;
    limbAmongAmbiguous: Record<Stance, Range>;
    limbTotal: Range;
    method: string;
  };
  fixed: { byClip: Record<string, Range>; byFacing: Record<Facing, Range>; method: string };
  warnings: string[];
}

const stanceOfClip = (clip: string): Stance | null => {
  const m = /^death_(stand|crouch|prone)_/.exec(clip);
  return m ? (m[1] as Stance) : null;
};

/** The file's bytes, plain (a closed segment is gzipped). */
function plainBytes(bytes: Uint8Array): Uint8Array {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipReplay(bytes) : bytes;
}

/** A decoder refusal in a fixed bucket: never the message (a JSON parse error can quote the payload). */
function bucketOf(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (m.startsWith('unsupported replay format')) return 'unsupported format';
  if (m.startsWith('unsupported replay protocol')) return 'unsupported protocol';
  if (m.startsWith('replay has no header')) return 'no header';
  if (/incorrect header check|unexpected end of file|invalid/i.test(m) && !m.includes('{')) return 'not gzip or cut short';
  return 'corrupt';
}

/** The deaths one file's records hold, with the victims' postures and landings from its snapshots. */
function deathsOf(records: readonly ReplayRecord[]): { deaths: Death[]; hostages: number } {
  const kills: { tick: number; victim: number; cause: number | null; clip: string | null }[] = [];
  let hostages = 0;
  for (const r of records) {
    if (r.kind !== 'event' || r.event.type !== 'kill') continue;
    const e = r.event;
    if (e.victimKind === 'hostage') { hostages++; continue; }
    kills.push({ tick: r.tick, victim: e.victim, cause: typeof e.cause === 'number' ? e.cause : null, clip: e.clip ?? null });
  }
  if (kills.length === 0) return { deaths: [], hostages };
  const victims = new Set(kills.map((k) => k.victim));
  const seen = new Map<number, { tick: number; stance: number; alive: boolean; action: string | null }[]>();
  const rosters: { tick: number; bots: Set<number> }[] = [];
  for (const r of records) {
    if (r.kind === 'players') rosters.push({ tick: r.tick, bots: new Set(r.players.filter((p) => p.bot === true).map((p) => p.id)) });
    if (r.kind !== 'snap') continue;
    for (const b of r.bodies) {
      if (!victims.has(b.id)) continue;
      let list = seen.get(b.id);
      if (!list) seen.set(b.id, list = []);
      list.push({ tick: r.tick, stance: b.stance, alive: (b.flags & BodyFlag.Alive) !== 0, action: b.action > 0 ? ACTION_CODES[b.action - 1] ?? null : null });
    }
  }
  const deaths = kills.map((k): Death => {
    const list = seen.get(k.victim) ?? [];
    // The posture's fallback and cross-check: the first snapshot at or after the kill that shows the body dead, else the
    // last one before the kill (a crouch-runner reads `stand` while running and `crouch` once dead).
    const after = list.find((s) => s.tick >= k.tick && !s.alive);
    const before = [...list].reverse().find((s) => s.tick <= k.tick);
    const snap = after ?? before;
    const snapshotStance: Stance | null = snap ? STANCE_CODES[snap.stance] ?? null : null;
    // Every recorded replay predates LIMB-DEATH: a list clip names the posture the room drew it for (`deathClip`'s
    // stance, the walker's posture at the kill); the snapshot's is the fallback and the cross-check.
    const clipStance = k.clip ? stanceOfClip(k.clip) : null;
    const stance = clipStance ?? snapshotStance;
    let facing: Facing = 'unknown';
    if (k.clip) facing = CLIP_FACING[k.clip] ?? 'unknown';
    else {
      for (const s of list) {
        if (s.tick < k.tick || s.tick > k.tick + LANDING_WINDOW_TICKS || s.alive) continue;
        const f = s.action ? ACTION_FACING[s.action] : undefined;
        if (f) facing = f;
      }
    }
    const roster = [...rosters].reverse().find((x) => x.tick <= k.tick) ?? rosters[0];
    return { cause: k.cause, clip: k.clip, stance, snapshotStance, bot: roster?.bots.has(k.victim) ?? false, facing };
  });
  return { deaths, hostages };
}

/** The part as far as cause, clip and posture tell it (see the header). */
export function partClassOf(cause: number | null, clip: string | null, stance: Stance | null): PartClass {
  if (cause === DEATH_CAUSE.HEADSHOT) return 'head';
  if (cause === DEATH_CAUSE.BLAST) return 'blast';
  if (cause === DEATH_CAUSE.FALL) return 'fall';
  if (cause !== DEATH_CAUSE.BULLET || !clip || !stance) return 'other';
  if (clip === LIMB_CLIP_FIXED && stance !== 'stand') return 'limb';   // only the fixed lists draw it crouched or prone
  const body = BODY_LIST[stance].includes(clip), limb = clip === limbClipRecorded(stance);
  if (body && limb) return 'body or limb';
  if (body) return 'body';
  return 'other';
}

const zeroStances = (): Record<Stance, number> => ({ stand: 0, crouch: 0, prone: 0 });
const zeroFacing = (): Record<Facing, number> => ({ up: 0, down: 0, side: 0, unknown: 0 });
const zeroParts = (): Record<PartClass, number> => Object.fromEntries(PART_CLASSES.map((p) => [p, 0])) as Record<PartClass, number>;
const inc = (o: Record<string, number>, k: string, n = 1): void => { o[k] = (o[k] ?? 0) + n; };
const sortDesc = (o: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

/**
 * The aggregate over the files' bytes (no names: AGGREGATES ONLY). `excludeBots` leaves out a victim the roster marks a
 * CPU seat (`ReplayPlayer.bot`).
 */
const AFTER_FIX = 'a prone body drew Die on a bullet kill: a recording made after LIMB-DEATH -- this count assumes every '
  + 'recording predates it (a post-fix crouched or prone limb kill would be counted as a standing body-or-limb kill)';

export function countDeaths(files: Iterable<Uint8Array | null>, opts: { excludeBots?: boolean } = {}): DeathCount {
  const out: DeathCount = {
    tool: 'death-count', adaptation: DEATH_COUNT_ADAPTATION,
    files: { read: 0, duplicates: 0, truncated: 0, unreadable: {} },
    builds: [],
    deaths: { total: 0, humanVictims: 0, botVictims: 0, hostagesExcluded: 0, botsExcluded: opts.excludeBots === true },
    byCause: {}, byClip: {}, byFacing: zeroFacing(),
    byPostureAndPart: { stand: zeroParts(), crouch: zeroParts(), prone: zeroParts(), unknown: zeroParts() },
    posture: { fromSnapshot: 0, fromClip: 0, unknown: 0, clipAgainstSnapshot: {} },
    parts: {
      head: 0, body: 0, limb: 0, ambiguous: zeroStances(), bodyOnly: zeroStances(),
      limbAmongAmbiguous: { stand: { low: 0, expected: 0, high: 0 }, crouch: { low: 0, expected: 0, high: 0 }, prone: { low: 0, expected: 0, high: 0 } },
      limbTotal: { low: 0, expected: 0, high: 0 },
      method: '',
    },
    fixed: { byClip: {}, byFacing: { up: { low: 0, expected: 0, high: 0 }, down: { low: 0, expected: 0, high: 0 }, side: { low: 0, expected: 0, high: 0 }, unknown: { low: 0, expected: 0, high: 0 } }, method: '' },
    warnings: [],
  };
  const hashes = new Set<string>();
  const builds = new Map<string, { build: string; protocol: number; files: number; deaths: number }>();
  for (const raw of files) {
    if (!raw) { inc(out.files.unreadable, 'unreadable entry'); continue; }
    const hash = createHash('sha256').update(raw).digest('hex');
    if (hashes.has(hash)) { out.files.duplicates++; continue; }
    hashes.add(hash);
    let records: ReplayRecord[];
    try {
      const decoded = decodeRecords(plainBytes(raw));
      records = decoded.records;
      if (decoded.truncated) out.files.truncated++;
    } catch (e) {
      inc(out.files.unreadable, bucketOf(e));
      continue;
    }
    const first = records[0];
    const header = first?.kind === 'header' ? first.header : null;
    if (!header) { inc(out.files.unreadable, 'no header'); continue; }
    out.files.read++;
    let parsed: { deaths: Death[]; hostages: number };
    try { parsed = deathsOf(records); } catch (e) { out.files.read--; inc(out.files.unreadable, bucketOf(e)); continue; }
    const build = `${String(header.build?.commit ?? 'unknown')}${header.build?.dirty ? '+dirty' : ''}`;
    const key = `${build} p${header.protocol}`;
    let row = builds.get(key);
    if (!row) builds.set(key, row = { build, protocol: header.protocol, files: 0, deaths: 0 });
    row.files++;
    const { deaths, hostages } = parsed;
    out.deaths.hostagesExcluded += hostages;
    for (const d of deaths) {
      if (d.bot && opts.excludeBots) continue;
      row.deaths++;
      out.deaths.total++;
      if (d.bot) out.deaths.botVictims++; else out.deaths.humanVictims++;
      inc(out.byCause, d.cause === null ? 'unknown' : CAUSE_NAME[d.cause] ?? String(d.cause));
      inc(out.byClip, d.clip ?? NO_CLIP);
      out.byFacing[d.facing]++;
      const clipStance = d.clip ? stanceOfClip(d.clip) : null;
      if (clipStance) out.posture.fromClip++; else if (d.snapshotStance) out.posture.fromSnapshot++; else out.posture.unknown++;
      if (clipStance && d.snapshotStance && clipStance !== d.snapshotStance) {
        inc(out.posture.clipAgainstSnapshot, `clip ${clipStance} / snapshot ${d.snapshotStance}`);
      }
      const part = partClassOf(d.cause, d.clip, d.stance);
      out.byPostureAndPart[d.stance ?? 'unknown']![part]++;
      if (part === 'head') out.parts.head++;
      else if (part === 'body') { out.parts.body++; if (d.stance) out.parts.bodyOnly[d.stance]++; }
      else if (part === 'limb') out.parts.limb++;
      else if (part === 'body or limb' && d.stance) out.parts.ambiguous[d.stance]++;
      if (part === 'limb' && d.stance !== 'stand') out.warnings.push('a crouched or prone bullet kill drew Die: a recording made after LIMB-DEATH');
      // Reachable: a prone body (no crouch-run reads prone) whose clip is Die is a prone limb kill after LIMB-DEATH --
      // before it a prone limb drew death_prone_chest01. The tool's split assumes every recording predates LIMB-DEATH.
      if (d.cause === 5 && d.clip === 'death_stand_chest01' && d.snapshotStance === 'prone' && !out.warnings.includes(AFTER_FIX)) out.warnings.push(AFTER_FIX);
    }
  }
  out.builds = [...builds.values()].sort((a, b) => b.deaths - a.deaths || a.build.localeCompare(b.build) || a.protocol - b.protocol);
  out.byCause = sortDesc(out.byCause);
  out.byClip = sortDesc(out.byClip);
  out.posture.clipAgainstSnapshot = sortDesc(out.posture.clipAgainstSnapshot);
  out.warnings = [...new Set(out.warnings)];

  // The limb kills among the ambiguous: the range, and the expected split by the uniform draw.
  const p = out.parts;
  const expectedBodyFirst = (s: Stance): number | null => {
    const others = BODY_LIST[s].length - 1;
    return others > 0 ? Math.min(p.ambiguous[s], p.bodyOnly[s] / others) : null;
  };
  let drawnAmbiguous = 0, drawnLimb = 0;
  for (const s of ['stand', 'crouch'] as const) {
    const body = expectedBodyFirst(s) ?? 0;
    p.limbAmongAmbiguous[s] = { low: 0, expected: p.ambiguous[s] - body, high: p.ambiguous[s] };
    drawnAmbiguous += p.ambiguous[s]; drawnLimb += p.ambiguous[s] - body;
  }
  // Prone's BODY list is one clip: the draw tells nothing; the standing and crouched expected limb share stands in.
  const share = drawnAmbiguous > 0 ? drawnLimb / drawnAmbiguous : 0;
  p.limbAmongAmbiguous.prone = { low: 0, expected: p.ambiguous.prone * share, high: p.ambiguous.prone };
  const sum = (k: keyof Range): number => p.limb + STANCES.reduce((a, s) => a + p.limbAmongAmbiguous[s][k], 0);
  p.limbTotal = { low: sum('low'), expected: sum('expected'), high: sum('high') };
  p.method =
    'part: cause 3 = head; cause 5 with a clip only the stance\'s BODY list holds = body; the BODY list\'s first ' +
    `(${STANCES.map((s) => limbClipRecorded(s)).join(', ')}) = body or limb (before LIMB-DEATH a limb drew it). Range: ` +
    'none of them limbs .. all of them. Expected: by the uniform draw, the body kills that drew the first number the ' +
    `body-only kills over the list's other clips (standing ${BODY_LIST.stand.length - 1}, crouched ${BODY_LIST.crouch.length - 1}); ` +
    'prone\'s list is one clip, so its expected split takes the standing and crouched expected limb share (an assumption).';

  // The fixed lists: every crouched or prone limb kill re-assigned to Die; standing kills unchanged.
  const fixedClip: Record<string, Range> = {};
  for (const [clip, n] of Object.entries(out.byClip)) fixedClip[clip] = { low: n, expected: n, high: n };
  const moveToDie = (from: string, r: Range): void => {
    const die = fixedClip[LIMB_CLIP_FIXED] ??= { low: 0, expected: 0, high: 0 };
    const src = fixedClip[from]!;
    for (const k of ['low', 'expected', 'high'] as const) { src[k] -= r[k]; die[k] += r[k]; }
  };
  for (const s of ['crouch', 'prone'] as const) if (p.ambiguous[s] > 0) moveToDie(limbClipRecorded(s), p.limbAmongAmbiguous[s]);
  out.fixed.byClip = Object.fromEntries(Object.entries(fixedClip).sort((a, b) => b[1].expected - a[1].expected || a[0].localeCompare(b[0])));
  const facing = out.fixed.byFacing;
  for (const k of ['low', 'expected', 'high'] as const) {
    for (const f of Object.keys(facing) as Facing[]) facing[f][k] = 0;
    for (const [clip, r] of Object.entries(fixedClip)) if (clip !== NO_CLIP) facing[CLIP_FACING[clip] ?? 'unknown'][k] += r[k];
  }
  // The deaths with no list clip keep their recorded landing's facing (the fixed lists do not touch them).
  const listed = Object.entries(out.byClip).filter(([c]) => c !== NO_CLIP);
  const listedFacing = zeroFacing();
  for (const [clip, n] of listed) listedFacing[CLIP_FACING[clip] ?? 'unknown'] += n;
  for (const f of Object.keys(facing) as Facing[]) {
    const unlisted = out.byFacing[f] - listedFacing[f];
    for (const k of ['low', 'expected', 'high'] as const) facing[f][k] += unlisted;
  }
  out.fixed.method =
    `each crouched or prone limb kill re-assigned to ${LIMB_CLIP_FIXED} (Die); low: no ambiguous kill a limb, high: every ` +
    `${limbClipRecorded('crouch')} and bullet ${limbClipRecorded('prone')} a limb, expected: the parts' expected split. ` +
    'Standing kills and deaths with no list clip are as recorded.';
  return out;
}

/** The three columns of a `Range`: the limb count's scenarios (`low` none of the ambiguous a limb, `high` all). */
const SCENARIOS = ['fewest limbs', 'expected', 'most limbs'];
const pct = (n: number, of: number): string => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : '-');
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function table(title: string, head: string[], rows: string[][]): string {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]): string => r.map((c, i) => (i === 0 ? c.padEnd(w[i]!) : c.padStart(w[i]!))).join('  ');
  return [title, line(head), w.map((n) => '-'.repeat(n)).join('  '), ...rows.map(line), ''].join('\n');
}

/** The printed tables (aggregates only). */
export function renderDeathCount(c: DeathCount): string {
  const t = c.deaths.total;
  const parts: string[] = [];
  parts.push(`death-count -- ${c.adaptation}`, '');
  parts.push(`files read ${c.files.read}, byte-identical duplicates ${c.files.duplicates}, cut short ${c.files.truncated}, ` +
    `unreadable ${Object.values(c.files.unreadable).reduce((a, b) => a + b, 0)}` +
    (Object.keys(c.files.unreadable).length ? ` (${Object.entries(c.files.unreadable).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''));
  parts.push(`player deaths ${t} (human victims ${c.deaths.humanVictims}, bot victims ${c.deaths.botVictims}` +
    `${c.deaths.botsExcluded ? ', bots excluded' : ''}); hostage deaths left out ${c.deaths.hostagesExcluded}`, '');
  parts.push(table('Per build', ['build', 'protocol', 'files', 'deaths'],
    c.builds.map((b) => [b.build, String(b.protocol), String(b.files), String(b.deaths)])));
  parts.push(table('By cause', ['cause', 'deaths', 'share'], Object.entries(c.byCause).map(([k, n]) => [k, String(n), pct(n, t)])));
  parts.push(table('By clip, as recorded', ['clip', 'facing', 'deaths', 'share'],
    Object.entries(c.byClip).map(([k, n]) => [k, k === NO_CLIP ? '(landing)' : CLIP_FACING[k] ?? 'unknown', String(n), pct(n, t)])));
  parts.push(table('By end facing, as recorded', ['facing', 'deaths', 'share'],
    (Object.keys(c.byFacing) as Facing[]).map((f) => [f, String(c.byFacing[f]), pct(c.byFacing[f], t)])));
  parts.push(table('By posture and part (part as far as the replay tells it)', ['posture', ...PART_CLASSES, 'total'],
    Object.entries(c.byPostureAndPart).map(([s, r]) => [s, ...PART_CLASSES.map((p) => String(r[p])),
      String(PART_CLASSES.reduce((a, p) => a + r[p], 0))])));
  parts.push(`posture: from the clip ${c.posture.fromClip}, from the snapshot ${c.posture.fromSnapshot}, unknown ${c.posture.unknown}; ` +
    `clip against snapshot: ${Object.entries(c.posture.clipAgainstSnapshot).map(([k, n]) => `${k} ${n}`).join(', ') || 'agree'}`, '');
  const p = c.parts, bullets = p.head + p.body + p.limb + STANCES.reduce((a, s) => a + p.ambiguous[s], 0);
  parts.push(table('Bullet kills by part (inferred)', ['part', ...SCENARIOS, 'share (expected)'], [
    ['head', String(p.head), String(p.head), String(p.head), pct(p.head, bullets)],
    ['body', num(bullets - p.head - p.limbTotal.low), num(bullets - p.head - p.limbTotal.expected), num(bullets - p.head - p.limbTotal.high),
      pct(bullets - p.head - p.limbTotal.expected, bullets)],
    ['limb', num(p.limbTotal.low), num(p.limbTotal.expected), num(p.limbTotal.high), pct(p.limbTotal.expected, bullets)],
    ...STANCES.map((s) => [`  of which ambiguous, ${s}`, num(p.limbAmongAmbiguous[s].low), num(p.limbAmongAmbiguous[s].expected),
      num(p.limbAmongAmbiguous[s].high), `of ${p.ambiguous[s]}`]),
  ]));
  parts.push(`method: ${p.method}`, '');
  parts.push(table('By clip, as the fixed lists would draw', ['clip', 'facing', ...SCENARIOS, 'share (expected)'],
    Object.entries(c.fixed.byClip).map(([k, r]) => [k, k === NO_CLIP ? '(landing)' : CLIP_FACING[k] ?? 'unknown',
      num(r.low), num(r.expected), num(r.high), pct(r.expected, t)])));
  parts.push(table('By end facing, as the fixed lists would draw', ['facing', ...SCENARIOS, 'share (expected)'],
    (Object.keys(c.fixed.byFacing) as Facing[]).map((f) => [f, num(c.fixed.byFacing[f].low), num(c.fixed.byFacing[f].expected),
      num(c.fixed.byFacing[f].high), pct(c.fixed.byFacing[f].expected, t)])));
  parts.push(`method: ${c.fixed.method}`);
  parts.push('assumes: every recording predates LIMB-DEATH (2026-11-12); the posture is read from the clip, so a later crouched or '
    + 'prone limb kill (Die) would read as standing; check the builds above against it.');
  if (c.warnings.length) parts.push('', ...c.warnings.map((w) => `warning: ${w}`));
  return parts.join('\n');
}

/**
 * Every `*.s2r` under a directory, its bytes only (the names stay here): an entry that cannot be listed, stat'd or read
 * (a dangling link, a file gone mid-walk, no permission) yields null, counted as unreadable without its name or path.
 * A directory already walked (by its real path) is not walked again, so a symlink loop cannot recurse without end.
 */
export function* replayBytesUnder(dir: string, walked: Set<string> = new Set()): Generator<Uint8Array | null> {
  let real: string;
  try { real = realpathSync(dir); } catch { yield null; return; }
  if (walked.has(real)) return;
  walked.add(real);
  let names: string[];
  try { names = readdirSync(dir).sort(); } catch { yield null; return; }
  for (const name of names) {
    const path = join(dir, name);
    let bytes: Uint8Array | null | 'dir' | 'skip';
    try {
      const st = statSync(path);
      bytes = st.isDirectory() ? 'dir' : st.isFile() && name.endsWith('.s2r') ? new Uint8Array(readFileSync(path)) : 'skip';
    } catch { bytes = null; }
    if (bytes === 'dir') yield* replayBytesUnder(path, walked);
    else if (bytes !== 'skip') yield bytes;
  }
}

export function main(argv: string[]): number {
  const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const jsonPath = flag('--json');
  const dir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json');
  if (!dir) {
    console.error('usage: npx tsx tools/death-count.ts <dir of .s2r> [--json <file>] [--exclude-bots]');
    return 2;
  }
  const count = countDeaths(replayBytesUnder(resolve(dir)), { excludeBots: argv.includes('--exclude-bots') });
  console.log(renderDeathCount(count));
  const json = JSON.stringify(count, null, 2);
  console.log('\nJSON:');
  console.log(json);
  if (jsonPath) writeFileSync(jsonPath, `${json}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
