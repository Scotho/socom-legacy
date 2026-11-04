import { decodeEffectProgram, type EffectCondition, type EffectOp, type EffectProgram, type ZAnimArchive } from '@s2u/scene';

/**
 * The round's streamed cues as the map's own `objectives` script plays them (socomlegacy/docs/research/124 §5; the
 * script is the animation `objectives` of the map's `MZANIM.ZAR`, its sequences read as research 91 §2.1 reads MP51's):
 *
 * - **the intro**: the sequence `start` (`start2` in a respawn room, which `respawn` calls instead) waits, then by
 *   `player_team` -- 0 the SEALs, 8 the Terrorists, 16 a spectator -- posts the objective and plays the side's
 *   `MUS_MP_*_INTRO_*`. On Frostfire, WAIT 5 and `INTRO_4` for both sides, the spectator the SEALs'.
 * - **the elimination**: inside `start`'s loop, the branch that finds no living Terrorist (`aiteam_08 == 0`, the SEALs
 *   win) or no living SEAL (`aiteam_00 == 0`) for the local `player_team` plays the result line (`^PH_0014` SEALs,
 *   `^PH_0002` Terrorists: one line for both sides, whichever the local team) and the winner's music, with the
 *   script's WAIT between where it has one (MP51: WAIT 2; MP2: none). No branch plays anything for a draw.
 * - **TIME EXPIRED** (a respawn room): `mission_timer2`, once its clock loop ends, plays one cue -- the SEALs' win
 *   music on every map that has the sequence, whoever leads -- and then waits 15 s for the result. Classic's time-out
 *   (`mission_timer` -> `abort`) plays nothing.
 *
 * Read off the disc at run time (W2.R6), never copied into the source: the dev disc's table, map by map, is research
 * 124 §5. A SOUND command's flag 0x800 (or 0x400) hands the play to the one-voice slot (`FUN_00348dc0`, research 81 §6):
 * `slot` -- the music; a plain 0x80 play (the result line) is a voice of its own.
 *
 * - **the objective** (PF-12; research 192 s3.1, 179 s9.8): `start`'s `MESSAGE` lines before its loop, by `player_team`,
 *   each with the script's wait before it -- the HUD posts them (`./hud` `OBJECTIVE_POST_OFFSET_READING`).
 *
 * An `IF`'s condition is evaluated as the game does (`evaluateCondition`, a port of `FUN_0025e960`; research 179 s9.9):
 * the branch for a team is the first of the chain whose condition holds with `player_team` that team (and, for the
 * eliminations, the losing side's `aiteam_0x` at 0); any other test -- another objective's valve, a zone test -- is
 * false. A branch's steps are its waits and sounds up to its `CALL_SEQUENCE`.
 */

/** A step of a cue: a wait, or a stream played (`slot`: in the one-voice music slot, flag 0x800/0x400). */
export type CueStep = { wait: number } | { sound: string; slot: boolean };
/** `player_team`: 0 the SEALs, 8 the Terrorists, 16 a spectator (research 91 §18.2.3). */
export type TeamCode = 0 | 8 | 16;
export type CuesByTeam<T = CueStep[]> = Partial<Record<TeamCode, T>>;

/**
 * One line of `start`'s objective (a `MESSAGE`, `@s2u/scene` `EffectOp`): its raw text or its locale id in the map's
 * `MPnnLOC` (the other null; the page's loader fills `text` from the table), its scale, and the seconds the script
 * waits before it -- since the line before, or since the round's start for the first.
 */
export interface ObjectiveLine { text: string | null; locId: number | null; scale: number; waitBefore: number }

export interface RoundCues {
  map: string;
  /** `start`'s opening, by `player_team`, from the round's start. */
  intro: CuesByTeam;
  /** `start2`'s, null when the script has none (a map with no respawn mode: `start` runs in any room). */
  introRespawn: CuesByTeam | null;
  /** `start`'s elimination branches: by the winner, by the local `player_team`. */
  elimination: { seal: CuesByTeam; terrorist: CuesByTeam };
  /** `mission_timer2` after its clock loop; empty when the script has none. */
  timeExpired: CueStep[];
  /** `start`'s objective lines before its loop, by `player_team`; a team the script posts nothing for is absent. */
  objective: CuesByTeam<ObjectiveLine[]>;
  /**
   * XR-06 (research 214 s3, 213 s2.4): the bomb's cues, on a map whose script has the bomb's sequences (absent elsewhere):
   * each by the bomb's side (`bomb_owner` 1 the SEALs, 2 the Terrorists) and the local `player_team`.
   */
  bomb?: BombCues;
  /**
   * HX-5 (research 239 s5-s6): the hostage one-shots' cues -- Lead, Rescue, HostKill, SealKill -- on a map whose script
   * has them (MP6, MP10, MP11, MP71); absent elsewhere (`hostageCues`).
   */
  hostages?: HostageCues;
  /**
   * HX-5: `start`'s branches the room's `eliminated.reason` names, by the local `player_team` -- `rescue` (`rescuecount >=
   * 2 AND rescuecheck == 1`) and `hostageKills` (`mp_hostages_by_seals >= 2`); absent on a map with neither.
   */
  decided?: DecidedCues;
  /** LATER 131 (`ESCORT_IN_ROUND_LINES_READING`): ESCORT's in-round lines the room's `escort` names; absent off ESCORT. */
  escort?: EscortCues;
}

/**
 * LATER 131: ESCORT's in-round lines -- `staged` RescueN's and `extracted` EndRescueN's steps by the VIP's record name
 * (`VIP1`..), `aborted` VIPcheck's by the local `player_team`.
 */
export interface EscortCues {
  staged: Record<string, BombStep[]>;
  extracted: Record<string, BombStep[]>;
  aborted: CuesByTeam<BombStep[]>;
}

/**
 * HX-5 (research 239 s5): a hostage one-shot's cue as its sequence's loop plays it: the stream (a plain 0x80 play, the
 * announcer) and the `MESSAGE` lines, each with the script's wait before it.
 */
export interface HostageCue {
  sound: string | null; lines: ObjectiveLine[];
  /**
   * LATER 125 (the review's F1): each copy's own steps -- streams (the music slot's too), lines and waits in order --
   * copy N at `[N - 1]`, where the copies differ (ESCORT's kill one-shots: `^PH_0042`, the line, `MUS_MP_VIP_KILL_N`; the
   * N-th fires at its side's count `>= N`, MP52 HostKill2 @2900); absent on EXTRACTION's, which play `sound` then
   * `lines` as before, their copies alike (`HOSTAGE_CUES_READING`).
   */
  copies?: BombStep[][];
}
/** Which one-shot: Lead (INSTATE 9), Rescue (INREGION), SealKill (`mp_hostages_by_seals`), HostKill (`_by_turds`). */
export type HostageCueKind = 'lead' | 'rescued' | 'killedBySeals' | 'killedByTerrorists';
/** LATER 125: partial on ESCORT (its two kill one-shots alone: its `Rescue` is the staging line, another trigger). */
export type HostageCues = Partial<Record<HostageCueKind, HostageCue>>;
/**
 * The decided branches' steps (waits, lines, streams) by reason and local `player_team`. LATER 125: `elimination`, the
 * SEALs' elimination win on ESCORT alone (`start`'s line then `escort_success`'s); absent on every other map, whose page
 * posts the elimination's two lines.
 */
export interface DecidedCues {
  rescue: CuesByTeam<BombStep[]>; hostageKills: CuesByTeam<BombStep[]>; elimination?: CuesByTeam<BombStep[]>;
  /**
   * LATER 125 (the review's F2): on ESCORT, whether the path that decides the round stops the kill one-shots (its
   * `STOP_SEQUENCE`s of HostKill1-3 / SealKill1-3), by reason and local `player_team` -- `terroristElimination` the
   * SEALs eliminated (`start`'s branch, MP52 @1368-@1408). Read per map: The Mixer's and Guidance's `escort_success` stop
   * them (MP52 @7120-@7160, MP82 @6532-@6572), Foxhunt's does not (its `mission_timer` does). Absent elsewhere: EXTRACTION's
   * one-shots play in a decided round.
   */
  stopsKills?: Partial<Record<'rescue' | 'hostageKills' | 'elimination' | 'terroristElimination' | 'timeout', CuesByTeam<boolean>>>;
  /**
   * LATER 130 (`BREACH_LINES_READING`): the Terrorists' elimination win on BREACH alone -- `start`'s SEALs-eliminated
   * branch, then `breach_success`'s steps; absent on every other map, whose page posts the elimination's two lines.
   */
  terroristElimination?: CuesByTeam<BombStep[]>;
  /**
   * LATER 127 / 138: the time-out's win on ESCORT and BREACH alone (the room's `timedOut`) -- `escort_success`'s steps
   * (its two lines, WAIT 2, the SEAL win music) or `breach_success`'s (^*PT_0021, its two lines, WAIT 2, the music), every
   * console; absent on every other map, whose time-out is a draw with no line.
   */
  timeout?: CuesByTeam<BombStep[]>;
  /**
   * LATER 150 (`TIMEOUT_PLANT_LIVE_READING`): on BREACH, present where the time-out's path leaves `switch_timer` running --
   * neither `mission_timer`'s nor `breach_success`'s ops past their `WHILE` stop it (MP61, MP62; MP73's `breach_success`
   * does, @5976). In that hold a plant plays its own cue, and a defuse `defused`: the `defuse` branches' own steps
   * (`breach_success` ran to its end at the time-out, its tail not again).
   */
  timeoutPlantLive?: { defused: BombCue };
}

/**
 * BREACH_LINES_READING (LATER 130; research 174 §2a, the disc's MP61, MP62, MP73 `objectives` read 2026-10-19 through
 * `tools/probe-npc-maps.ts`): `breach_success` (MP61 @6504, MP62 and MP73 @5916) waits for `mp_winner == 8` and so runs
 * on **every** Terrorist win -- `^*PT_0021`, "THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE." 0.7, "TERRORISTS
 * WIN!" 0.9, WAIT 2, the Terrorist win music; `start`'s SEALs-eliminated branch posts "ALL SEALS ELIMINATED" and the
 * music, then sets the valve (MP61 @1368-@1768), and `defuse`'s Terrorist branch `^PH_0003`, "BOMB DEFUSED", WAIT 3, the
 * music, then the valve (MP61 @2632-@3228): each then `breach_success`'s. `bomb_timer`'s Terrorist detonation and its
 * valve (MP61 @4932) cannot happen there: no `seal_tent` to plant at (research 284 §5). Read at run time, never typed
 * (MP73's `start` and `defuse` lines by loc id, 7305 and 7307, `breach_success`'s as text; its music ALG). [reading:
 * re-read at the source by LATER 130's fresh review, 2026-10-19]
 */
export const BREACH_LINES_READING = 'breach_success on every Terrorist win: start SEALs-eliminated, defuse Terrorist';

/**
 * TIMEOUT_PLANT_LIVE_READING (LATER 150; research 174 s2a, the disc's MP61, MP62, MP73 `objectives` read 2026-10-19 through
 * `tools/probe-npc-maps.ts`): the breach time-out's path -- `mission_timer`'s `mp_winner = 8` (MP61 @6488, MP62 @5900),
 * then `breach_success` -- stops the music and `start` alone on MP61 (@6564-@6612) and MP62 (@5976-@6000), never
 * `switch_timer`; MP73's `breach_success` stops it first (@5976), and every elimination branch of `start` does on all
 * three (MP61 @624 ... @1704). So in MP61's and MP62's 23 s hold a plant runs `switch_timer`'s branch (@3304-@3564: its
 * lines, WAIT 2, the music, then `bomb_timer` and `defuse`) and a defuse `defuse`'s own branch (MP61 @2632-@2828);
 * a detonation cannot come inside it (the 30 s fuse). Derived from each map's script at run time, never typed.
 * [reading, pending review]
 */
export const TIMEOUT_PLANT_LIVE_READING = "the breach time-out's path leaves switch_timer running on MP61 and MP62";

/**
 * ESCORT_LINES_READING (LATER 125; research 175 §4 and §4a, the disc's MP52, MP53, MP82 `objectives` re-read
 * 2026-10-18 through `tools/probe-npc-maps.ts`): `escort_success` (MP52 @7088, MP53 @7140, MP82 @6472) waits for
 * `mp_winner == 0` and so runs on **every** SEAL win -- "THE TERRORISTS FAILED TO ELIMINATE THE VIPS." 0.7, "SEALS
 * VICTORIOUS!" 0.9, WAIT 2, the SEAL win music; `start`'s Terrorists-eliminated branch posts "ALL TERRORISTS ELIMINATED"
 * and `^PH_0014` alone (MP52 @776); an extraction is `EndRescueN`'s "A VIP HAS BEEN EXTRACTED", `^*PT_0051`, WAIT 2,
 * `MUS_MP_VIP_RESC_1` (MP52 @4392), then `hostages_rescued`'s `^*PT_0055` (@6236); three VIP kills `start`'s
 * `killcount >= 3` branch (MP52 @1984): "THE VIPS HAVE BEEN ELIMINATED.", "TERRORISTS WIN!". Read at run time, never
 * typed (the streams differ by map and team). The kill one-shots' copies each their own music (`MUS_MP_VIP_KILL_1`..`_3`),
 * the N-th at its side's count `>= N`, counted on the page from the round's start (`ESCORT_KILL_COPY_FROM_JOIN_PLACEHOLDER`).
 * [reading, pending review]
 */
export const ESCORT_LINES_READING = 'escort_success on every SEAL win; EndRescue + hostages_rescued; killcount >= 3';

/**
 * ESCORT_IN_ROUND_LINES_READING (LATER 131; research 175 §4, the disc's MP52, MP53, MP82 `objectives` re-read 2026-10-20
 * through `tools/probe-npc-maps.ts`): the lines the room's `escort` names, each at the room's own moment -- RescueN's
 * first branch, "A VIP IS IN THE EXTRACTION ZONE" 0.7 (MP52 @3836, MP53 @3868, MP82 @3732); EndRescueN's, "A VIP HAS BEEN
 * EXTRACTED", `^*PT_0051`, WAIT 2, `MUS_MP_VIP_RESC_N` (MP52 @4536-@4596, MP53 @4568-@4628, MP82 @4308-@4368), each copy
 * the VIP's its `<name>_valve_alive` test names (MP52 Rescue1 @3868, EndRescue1 @4400); VIPcheck's branch after its
 * WHILE by `player_team` (MP52 @6716-@6948, MP53 @6748-@6980, MP82 @6128-@6360). Read at run time, never typed. A
 * decision keeps RescueN's and EndRescueN's pending steps (no branch stops them) and VIPcheck's on the time-out alone
 * (`./roundAudio` `decide`). Retires `ESCORT_EXTRACTED_AT_DECISION_PLACEHOLDER` (EndRescue1's lines at the decision).
 * [reading, pending review]
 */
export const ESCORT_IN_ROUND_LINES_READING = 'RescueN and EndRescueN by <vip>_valve_alive; VIPcheck by player_team';

/**
 * HOSTAGE_CUES_READING (HX-5; research 190 s4 C's table, re-read off the MP6 fixture 2026-10-06): the one-shots' first
 * copies -- `Lead1` `^PH_0006` + "A HOSTAGE IS BEING ESCORTED"; `Rescue1` `^PH_0013` + "A HOSTAGE HAS BEEN RESCUED";
 * `HostKill1` `^PH_0008` + "THE TERRORISTS HAVE KILLED A HOSTAGE", WAIT 2, "THE SEALS HAVE BEEN CREDITED WITH RESCUING
 * THAT HOSTAGE"; `SealKill1` `^PH_0007` + "THE SEALS HAVE KILLED A HOSTAGE", WAIT 2, "ONE MINUTE HAS BEEN DEDUCTED FROM
 * THE MISSION TIMER" (`PENALTY_LINE_READING`) -- each the same for every `player_team` (no team test), the 2 and 3
 * copies alike in their streams and lines (their valve writes' order differs, SealKill2/3: no cue). Read at run time,
 * never typed. [reading]
 */
export const HOSTAGE_CUES_READING = 'Lead1, Rescue1, HostKill1, SealKill1: the first copy of each';

/**
 * PENALTY_LINE_READING (HX-5): the minute's line is SealKillN's second `MESSAGE`, 2 s after the first (its WAIT 2), the
 * same moment its valves raise `mp_penalty` -- posted by the page from the kill, never from the room's `roundTime`. [reading]
 */
export const PENALTY_LINE_READING = "SealKill's second line, WAIT 2";

/**
 * RESCUE_WIN_LINES_READING (HX-5; the MP6 fixture's `start`, 2026-10-06): the rescue win's branch (`rescuecount >= 2 AND
 * player_team == t AND rescuecheck == 1`) opens with WAIT 2 and has no "ALL ... ELIMINATED" line: WAIT 2, "SEALS
 * VICTORIOUS!" 0.9, `^PH_0014`, WAIT 2, `MUS_MP_SEAL_WIN_ALG` -- for every `player_team`; the hostage-kill win
 * (`mp_hostages_by_seals >= 2`) "TERRORISTS WIN!" 0.9, `^PH_0002`, WAIT 2, `MUS_MP_TERR_WIN_ALG`. [reading]
 */
export const RESCUE_WIN_LINES_READING = 'WAIT 2, SEALS VICTORIOUS!, no first line';

/**
 * A step of the bomb's cues: a wait, a stream, or a `MESSAGE` line (`message` its text -- null until the map's strings fill
 * it, `withObjectiveTexts` -- `locId` its id in the map's `MPnnLOC`, `scale` the script's).
 */
export type BombStep = CueStep | { message: string | null; locId: number | null; scale: number };
/** Which of the bomb's cues: its states as the script's five sequences watch them (`mp_bomb`). */
export type BombCueKind = 'pickup' | 'drop' | 'planted' | 'defused' | 'detonated';
/** A bomb cue by the bomb's side (`bomb_owner`) and the local `player_team`. */
export interface BombCue { seal: CuesByTeam<BombStep[]>; terrorist: CuesByTeam<BombStep[]> }
/**
 * The bomb's cues (research 213 s2.4; 171 s7), each the `IF` the sequence's loop waits on, run for every side and team:
 * - `pickup`: `bomb_pickup` (@4344) on `mp_bomb == 2`; `drop`: `bomb_drop` (@4204) on `mp_bomb == 1`;
 * - `planted`: `switch_timer` (@3844) on `mp_bomb == 3`, `bomb_owner` the planting side;
 * - `defused`: `defuse` (@1960) on `mp_bomb == 4`, `bomb_owner` the defuser's side (171 s6);
 * - `detonated`: `bomb_timer` (@4596) on `mp_bomb == 5`, `bomb_owner` the planting side.
 * The sequences' `CALL_SEQUENCE`s, `STOP_SEQUENCE`s, `CALL`s (the base's pulse) and valve writes (the score, the winner)
 * are no cues: the room owns the round (PF.R27); a step is a wait, a sound or a message.
 */
export type BombCues = Record<BombCueKind, BombCue>;

/** Each bomb cue's sequence and the `mp_bomb` its loop waits for (213 s2.4). */
const BOMB_SEQUENCES: Record<BombCueKind, { sequence: string; state: number }> = {
  pickup: { sequence: 'bomb_pickup', state: 2 }, drop: { sequence: 'bomb_drop', state: 1 }, planted: { sequence: 'switch_timer', state: 3 },
  defused: { sequence: 'defuse', state: 4 }, detonated: { sequence: 'bomb_timer', state: 5 },
};
/** `bomb_owner`'s values: 1 the SEALs (7208 "THE SEALS HAVE PLANTED THE BOMB"), 2 the Terrorists (7209). */
const BOMB_OWNER = { seal: 1, terrorist: 2 } as const;

/**
 * An `IF`/`ELSEIF`/`WHILE` condition evaluated as `FUN_0025e960` (D:L108288-108425; research 179 s9.9) does: the
 * operands left to right, each folded into the value by the operator pending before it (2 AND, 3 OR;
 * D:L108394-108416) with no precedence; 1 NOT flags the next operand or group (D:L108369-108371, D:L108383-108386); 4
 * `(` evaluates up to its 5 `)` as one operand (D:L108325-108327, D:L108366-108368); an operand straight after an
 * operand ends the condition at the first (the game rewinds to it, D:L108375-108379). `valueOf` answers an operand (any
 * token not an operator).
 */
export function evaluateCondition(tokens: readonly EffectCondition[], valueOf: (c: EffectCondition) => boolean): boolean {
  let at = 0;
  const group = (): boolean => {
    let value = false, have = false, not = false, pending = 0;
    // The pending operator over the value so far (D:L108394-108416): 3 OR, 2 AND, 1 the operand negated, else false.
    const fold = (v: boolean): boolean => (pending === 3 ? value || v : pending === 2 ? value && v : pending === 1 ? !v : false);
    while (at < tokens.length) {
      const t = tokens[at++]!;
      if (t.kind === 'operator') {
        if (t.operator === 5) return value;
        if (t.operator === 1) { not = true; continue; }
        if (t.operator !== 4) { pending = t.operator; continue; }
        let v = group();
        if (not) { not = false; v = !v; }
        if (have) { value = fold(v); pending = 0; } else { have = true; value = v; }
        continue;
      }
      if (pending === 0 && have) { at--; return value; }
      let v = valueOf(t);
      if (not) { not = false; v = !v; }
      value = pending === 0 ? v : fold(v);
      have = true;
      pending = 0;
    }
    return value;
  };
  return group();
}

/** A valve test against a value (`FUN_00353fd0`'s tests 1-6: !=, ==, >, <, >=, <=). */
function test(value: number, operation: number, operand: number): boolean {
  switch (operation) {
    case 1: return value !== operand;
    case 2: return value === operand;
    case 3: return value > operand;
    case 4: return value < operand;
    case 5: return value >= operand;
    case 6: return value <= operand;
    default: return false;
  }
}

/** A condition with the valves named in `valves` at those values; any other operand (another valve, a zone test) false. */
const holds = (cs: readonly EffectCondition[], valves: Readonly<Record<string, number>>): boolean => evaluateCondition(cs, (c) => (
  c.kind === 'valve' && c.valve in valves ? test(valves[c.valve]!, c.operation, c.operand) : false
));

const SLOT_FLAGS = 0x800 | 0x400;
const TEAMS: readonly TeamCode[] = [0, 8, 16];
/**
 * The step an op is, if it is one. A WAIT counted in frames (flag 0x10) is none: no WAIT of the 22 maps' round
 * sequences is (research 124 §5), and the frame's length is not read here.
 */
function step(o: EffectOp): CueStep | null {
  if (o.op === 'wait') return o.frames === null ? { wait: o.seconds } : null;
  if (o.op === 'sound') return { sound: o.sound, slot: ((o.flags ?? 0) & SLOT_FLAGS) !== 0 };
  return null;
}
const trim = (steps: CueStep[]): CueStep[] => {
  let n = steps.length;
  while (n > 0 && 'wait' in steps[n - 1]!) n--;
  return steps.slice(0, n);
};

/** An `IF` chain from `at` (its `if`): each branch's conditions and ops, and where the chain ends (past its `endif`). */
function chain(ops: readonly EffectOp[], at: number): { branches: { conditions: EffectCondition[]; ops: EffectOp[] }[]; end: number } {
  const branches: { conditions: EffectCondition[]; ops: EffectOp[] }[] = [];
  let depth = 0, i = at;
  for (; i < ops.length; i++) {
    const o = ops[i]!;
    if (depth === 0 && (o.op === 'if' || o.op === 'elseif' || o.op === 'else')) {
      if (o.op === 'if' && i !== at) { depth++; branches[branches.length - 1]!.ops.push(o); continue; }
      branches.push({ conditions: 'conditions' in o ? o.conditions : [], ops: [] });
      continue;
    }
    if (o.op === 'if' || o.op === 'while') depth++;
    if (o.op === 'endif' || o.op === 'endWhile') {
      if (depth === 0) { if (o.op === 'endif') return { branches, end: i + 1 }; continue; }
      depth--;
    }
    branches[branches.length - 1]?.ops.push(o);
  }
  return { branches, end: i };
}

/** A branch's own steps (nested blocks skipped) up to its first `CALL_SEQUENCE` / `STOP_SEQUENCE` past a sound. */
function branchSteps(ops: readonly EffectOp[]): CueStep[] {
  const out: CueStep[] = [];
  let depth = 0;
  for (const o of ops) {
    if (o.op === 'if' || o.op === 'while') { depth++; continue; }
    if (o.op === 'endif' || o.op === 'endWhile') { depth--; continue; }
    if (depth > 0) continue;
    if (o.op === 'callSequence') break;
    const s = step(o);
    if (s) out.push(s);
  }
  return trim(out);
}

/** A step of the objective: a wait, or a `MESSAGE` line. */
type LineStep = { wait: number } | { line: Extract<EffectOp, { op: 'message' }> };

/** A branch's own waits and `MESSAGE`s (nested blocks skipped) up to its first `CALL_SEQUENCE`. */
function branchLines(ops: readonly EffectOp[]): LineStep[] {
  const out: LineStep[] = [];
  let depth = 0;
  for (const o of ops) {
    if (o.op === 'if' || o.op === 'while') { depth++; continue; }
    if (o.op === 'endif' || o.op === 'endWhile') { depth--; continue; }
    if (depth > 0) continue;
    if (o.op === 'callSequence') break;
    if (o.op === 'message') out.push({ line: o });
    else if (o.op === 'wait' && o.frames === null) out.push({ wait: o.seconds });
  }
  return out;
}

/** The objective lines a team's steps post, each with the waits since the line before. */
function lines(steps: readonly LineStep[]): ObjectiveLine[] {
  const out: ObjectiveLine[] = [];
  let wait = 0;
  for (const s of steps) {
    if ('wait' in s) { wait += s.wait; continue; }
    out.push({ text: s.line.text, locId: s.line.locId, scale: s.line.scale, waitBefore: wait });
    wait = 0;
  }
  return out;
}

/** A sequence's opening up to its first top-level `WHILE`: the steps each `player_team` takes, and the lines it posts. */
function opening(ops: readonly EffectOp[]): { cues: CuesByTeam; objective: CuesByTeam<ObjectiveLine[]> } {
  const per = new Map<TeamCode, CueStep[]>(TEAMS.map((t) => [t, []]));
  const said = new Map<TeamCode, LineStep[]>(TEAMS.map((t) => [t, []]));
  for (let i = 0; i < ops.length;) {
    const o = ops[i]!;
    if (o.op === 'while' || o.op === 'callSequence' || o.op === 'stopSequence') break;
    if (o.op === 'if') {
      const { branches, end } = chain(ops, i);
      for (const t of TEAMS) {
        const b = branches.find((x) => x.conditions.length === 0 || holds(x.conditions, { player_team: t }));
        if (b) { per.get(t)!.push(...branchSteps(b.ops)); said.get(t)!.push(...branchLines(b.ops)); }
      }
      i = end;
      continue;
    }
    const s = step(o);
    if (s) for (const t of TEAMS) per.get(t)!.push(s);
    if (o.op === 'message') for (const t of TEAMS) said.get(t)!.push({ line: o });
    else if (o.op === 'wait' && o.frames === null) for (const t of TEAMS) said.get(t)!.push({ wait: o.seconds });
    i++;
  }
  const cues: CuesByTeam = {}, objective: CuesByTeam<ObjectiveLine[]> = {};
  for (const [t, steps] of per) { const s = trim(steps); if (s.some((x) => 'sound' in x)) cues[t] = s; }
  for (const [t, steps] of said) { const l = lines(steps); if (l.length) objective[t] = l; }
  return { cues, objective };
}

/** `start`'s elimination branches (inside its first top-level `WHILE`), the first per winner and local team. */
function eliminations(ops: readonly EffectOp[]): RoundCues['elimination'] {
  const out: RoundCues['elimination'] = { seal: {}, terrorist: {} };
  const w = ops.findIndex((o) => o.op === 'while');
  if (w < 0) return out;
  for (let i = w + 1; i < ops.length; i++) {
    const o = ops[i]!;
    if (o.op === 'endWhile') break;
    if (o.op !== 'if') continue;
    const { branches, end } = chain(ops, i);
    // The first branch of the chain whose condition holds, for each winner and local team: the losing side's
    // `aiteam_0x` at 0, the other side's alive (1), `player_team` the team; another objective's test (MP6's
    // `rescuecount`) is false.
    for (const winner of ['seal', 'terrorist'] as const) {
      for (const team of TEAMS) {
        const valves = { aiteam_08: winner === 'seal' ? 0 : 1, aiteam_00: winner === 'seal' ? 1 : 0, player_team: team };
        const b = branches.find((x) => x.conditions.length > 0 && holds(x.conditions, valves));
        if (b && !out[winner][team]) out[winner][team] = branchSteps(b.ops);
      }
    }
    i = end - 1;
  }
  return out;
}

/** `mission_timer2`'s steps after its clock loop. */
function afterLoop(ops: readonly EffectOp[]): CueStep[] {
  const e = ops.findIndex((o) => o.op === 'endWhile');
  return e < 0 ? [] : branchSteps(ops.slice(e + 1));
}

/** A step of the bomb's cues, if the op is one. */
function bombStep(o: EffectOp): BombStep | null {
  if (o.op === 'message') return { message: o.text, locId: o.locId, scale: o.scale };
  return step(o);
}

/**
 * The steps a block of ops takes with the valves at `valves`: its own steps, and each nested `IF` chain's first branch
 * whose condition holds, in order (`CALL_SEQUENCE` and the rest are no steps).
 */
function stepsUnder(ops: readonly EffectOp[], valves: Readonly<Record<string, number>>): BombStep[] {
  const out: BombStep[] = [];
  for (let i = 0; i < ops.length;) {
    const o = ops[i]!;
    if (o.op === 'if') {
      const { branches, end } = chain(ops, i);
      const b = branches.find((x) => x.conditions.length === 0 || holds(x.conditions, valves));
      if (b) out.push(...stepsUnder(b.ops, valves));
      i = end;
      continue;
    }
    const s = bombStep(o);
    if (s) out.push(s);
    i++;
  }
  return out;
}

/**
 * A bomb sequence's cue (`BOMB_SEQUENCES`): inside its top-level `WHILE` (forever, or a condition that holds with the
 * mission undecided -- `defuse`'s `mission_complete == 0 AND mission_failure == 0`), the `IF` chains of the loop, each
 * its first branch that holds with `mp_bomb` the state, `bomb_owner` the side and `player_team` the team; trailing waits
 * trimmed; a team no branch takes is absent. A step at the loop's own level would run on every pass: none of the five
 * has one, and none is taken.
 */
function bombCue(ops: readonly EffectOp[] | null, state: number): BombCue {
  const out: BombCue = { seal: {}, terrorist: {} };
  const w = ops ? ops.findIndex((o) => o.op === 'while') : -1;
  const loop = ops?.[w];
  if (!ops || !loop || loop.op !== 'while') return out;
  for (const side of ['seal', 'terrorist'] as const) {
    for (const team of TEAMS) {
      const valves = { mp_bomb: state, bomb_owner: BOMB_OWNER[side], player_team: team, mission_complete: 0, mission_failure: 0 };
      if (!loop.forever && loop.conditions && !holds(loop.conditions, valves)) continue;
      const steps: BombStep[] = [];
      for (let i = w + 1; i < ops.length;) {
        const o = ops[i]!;
        if (o.op === 'endWhile') break;
        if (o.op !== 'if') { i++; continue; }
        const { branches, end } = chain(ops, i);
        const b = branches.find((x) => x.conditions.length === 0 || holds(x.conditions, valves));
        if (b) steps.push(...stepsUnder(b.ops, valves));
        i = end;
      }
      let n = steps.length;
      while (n > 0 && 'wait' in steps[n - 1]!) n--;
      if (n > 0) out[side][team] = steps.slice(0, n);
    }
  }
  return out;
}

/** The bomb's cues of a script, or undefined when it has none of the five sequences (a map with no bomb). */
function bombCues(seq: (name: string) => readonly EffectOp[] | null): BombCues | undefined {
  const kinds = Object.keys(BOMB_SEQUENCES) as BombCueKind[];
  if (!kinds.some((k) => seq(BOMB_SEQUENCES[k].sequence))) return undefined;
  return Object.fromEntries(kinds.map((k) => [k, bombCue(seq(BOMB_SEQUENCES[k].sequence), BOMB_SEQUENCES[k].state)])) as BombCues;
}

/**
 * PB-9b (research 284 s3, s8; ruling PB2.R5): the bases' pulse programs the bomb's sequences name -- with the `pickup`
 * cue, the animations `bomb_pickup`'s loop calls (`CALL_ANIMATION`) on `mp_bomb == 2`, by the bomb's side (`bomb_owner`
 * 1 the SEALs: `pulse_terrorist`; 2 the Terrorists: `pulse_seal`); with `drop`, those `bomb_drop`'s stops
 * (`STOP_ANIMATION`) on `mp_bomb == 1` (both). Read off the script, as the cues are, never typed.
 */
export interface BombPulses { pickup: Record<'seal' | 'terrorist', string[]>; drop: string[] }

/** The ops a block takes with the valves at `valves`: its own, and each nested `IF` chain's first branch that holds. */
function opsUnder(ops: readonly EffectOp[], valves: Readonly<Record<string, number>>): EffectOp[] {
  const out: EffectOp[] = [];
  for (let i = 0; i < ops.length;) {
    const o = ops[i]!;
    if (o.op === 'if') {
      const { branches, end } = chain(ops, i);
      const b = branches.find((x) => x.conditions.length === 0 || holds(x.conditions, valves));
      if (b) out.push(...opsUnder(b.ops, valves));
      i = end;
      continue;
    }
    out.push(o);
    i++;
  }
  return out;
}

/** A bomb sequence's loop body as it runs with `valves`: the `IF` chains inside its top-level `WHILE` (`bombCue`'s walk). */
function loopOps(ops: readonly EffectOp[] | null, valves: Readonly<Record<string, number>>): EffectOp[] {
  const w = ops ? ops.findIndex((o) => o.op === 'while') : -1;
  if (!ops || w < 0) return [];
  const end = ops.findIndex((o, i) => i > w && o.op === 'endWhile');
  return opsUnder(ops.slice(w + 1, end < 0 ? ops.length : end), valves);
}

/** The bases' pulses of a decoded `objectives` program (`BombPulses`), or undefined when it has no `bomb_pickup`. */
export function bombPulses(program: EffectProgram): BombPulses | undefined {
  const seq = (name: string): readonly EffectOp[] | null => program.sequences.find((s) => s.name === name)?.ops ?? null;
  const pickup = seq(BOMB_SEQUENCES.pickup.sequence), drop = seq(BOMB_SEQUENCES.drop.sequence);
  if (!pickup) return undefined;
  const calls = (side: 'seal' | 'terrorist'): string[] => loopOps(pickup, { mp_bomb: BOMB_SEQUENCES.pickup.state, bomb_owner: BOMB_OWNER[side] })
    .flatMap((o) => (o.op === 'call' ? [o.anim] : []));
  const stops = loopOps(drop, { mp_bomb: BOMB_SEQUENCES.drop.state }).flatMap((o) => (o.op === 'stopAnimation' ? [o.anim] : []));
  return { pickup: { seal: calls('seal'), terrorist: calls('terrorist') }, drop: stops };
}

/** Each hostage cue's sequence stem: its copies are `<stem>1`..`<stem>3` (`HOSTAGE_CUES_READING`). */
const HOSTAGE_SEQUENCES: Record<HostageCueKind, string> = { lead: 'Lead', rescued: 'Rescue', killedBySeals: 'SealKill', killedByTerrorists: 'HostKill' };

/**
 * A hostage one-shot's cue (`HostageCue`): its loop's first `IF`'s branch -- the first stream it plays and its lines at
 * their waits, up to its `STOP_SEQUENCE`; null when the sequence has no such branch.
 */
export function hostageCueOf(program: EffectProgram, sequence: string): HostageCue | null {
  const ops = program.sequences.find((q) => q.name === sequence)?.ops;
  const at = ops ? ops.findIndex((o) => o.op === 'if') : -1;
  if (!ops || at < 0) return null;
  const b = chain(ops, at).branches[0];
  if (!b) return null;
  const sound = b.ops.find((o): o is Extract<EffectOp, { op: 'sound' }> => o.op === 'sound')?.sound ?? null;
  return { sound, lines: lines(branchLines(b.ops)) };
}

/**
 * The hostage one-shots' cues (`HOSTAGE_CUES_READING`), or undefined unless the script has all four. LATER 125: on
 * ESCORT (`escort_success`; no `Lead1`) the two kill one-shots, each with its branch's own `steps` (`ESCORT_LINES_READING`).
 */
export function hostageCues(program: EffectProgram): HostageCues | undefined {
  const out: HostageCues = {};
  for (const k of Object.keys(HOSTAGE_SEQUENCES) as HostageCueKind[]) {
    const c = hostageCueOf(program, `${HOSTAGE_SEQUENCES[k]}1`);
    if (!c) return isEscort(program) ? escortKills(program) : undefined;
    out[k] = c;
  }
  return out;
}

/** LATER 125: whether the script is ESCORT's -- it has `escort_success` (the three escort maps, research 175 §4). */
function isEscort(program: EffectProgram): boolean {
  return program.sequences.some((s) => s.name === 'escort_success');
}

/**
 * LATER 130 (`BREACH_LINES_READING`): `breach_success`'s own steps after its `WHILE` -- `^*PT_0021`, its two lines, WAIT 2,
 * the music -- up to its `IF` of `success` / `failure`; null without the sequence (every map but the three breach maps).
 */
function breachTail(seq: (name: string) => readonly EffectOp[] | null): BombStep[] | null {
  const success = seq('breach_success');
  const e = success ? success.findIndex((o) => o.op === 'endWhile') : -1;
  return success && e >= 0 ? decidedSteps(success.slice(e + 1)) : null;
}

/**
 * LATER 130: BREACH's Terrorist elimination by local `player_team` -- `start`'s SEALs-eliminated branch (the SEALs dead,
 * the Terrorists alive), then `breach_success`'s steps; a team no branch takes is absent; undefined without either.
 */
function breachDecided(start: readonly EffectOp[] | null, tail: readonly BombStep[] | null): DecidedCues | undefined {
  if (!start || !tail) return undefined;
  const terroristElimination: CuesByTeam<BombStep[]> = {};
  const timeout: CuesByTeam<BombStep[]> = {};
  for (const team of TEAMS) {
    const lost = inLoop(start, { aiteam_00: 0, aiteam_08: 1, player_team: team });
    if (lost) terroristElimination[team] = [...decidedSteps(lost), ...tail];
    timeout[team] = [...tail];                     // LATER 138: `mission_timer`'s `mp_winner = 8`, then `breach_success`
  }
  return { rescue: {}, hostageKills: {}, terroristElimination, timeout };
}

/**
 * LATER 150 (`TIMEOUT_PLANT_LIVE_READING`): whether the time-out's path stops `switch_timer` -- a `STOP_SEQUENCE` of it
 * among `mission_timer`'s or `breach_success`'s ops past their `WHILE`.
 */
function timeoutStopsPlant(seq: (name: string) => readonly EffectOp[] | null): boolean {
  const stops = (ops: readonly EffectOp[] | null): boolean => {
    const e = ops ? ops.findIndex((o) => o.op === 'endWhile') : -1;
    return !!ops && e >= 0 && ops.slice(e + 1).some((o) => o.op === 'stopSequence' && o.sequence === 'switch_timer');
  };
  return stops(seq('mission_timer')) || stops(seq('breach_success'));
}

/** LATER 130: on BREACH the Terrorists' defuse is `defuse`'s branch, then `breach_success`'s steps (its valve after both). */
function withBreachDefuse(bomb: BombCues, tail: readonly BombStep[]): BombCues {
  const terrorist: CuesByTeam<BombStep[]> = {};
  for (const team of TEAMS) {
    const steps = bomb.defused.terrorist[team];
    if (steps) terrorist[team] = [...steps, ...tail];
  }
  return { ...bomb, defused: { seal: bomb.defused.seal, terrorist } };
}

/** A sequence's first `IF`'s first branch, taken by position (its test may be a zone's, no valve), or null. */
function firstBranch(ops: readonly EffectOp[] | null): EffectOp[] | null {
  const at = ops ? ops.findIndex((o) => o.op === 'if') : -1;
  return ops && at >= 0 ? chain(ops, at).branches[0]?.ops ?? null : null;
}

/**
 * LATER 125: ESCORT's kill one-shots (`SealKill1-3`, `HostKill1-3`), each copy its branch's own steps (the review's F1);
 * undefined without copy 1 of both. A copy the script lacks ends the list (the page plays the last it has).
 */
function escortKills(program: EffectProgram): HostageCues | undefined {
  const out: HostageCues = {};
  const branch = (name: string): EffectOp[] | null => firstBranch(program.sequences.find((q) => q.name === name)?.ops ?? null);
  for (const k of ['killedBySeals', 'killedByTerrorists'] as const) {
    const c = hostageCueOf(program, `${HOSTAGE_SEQUENCES[k]}1`);
    const b = branch(`${HOSTAGE_SEQUENCES[k]}1`);
    if (!c || !b) return undefined;
    const copies: BombStep[][] = [];
    for (let n = 1; n <= 3; n++) {
      const bn = branch(`${HOSTAGE_SEQUENCES[k]}${n}`);
      if (!bn) break;
      copies.push(decidedSteps(bn));
    }
    const voice = b.find((o): o is Extract<EffectOp, { op: 'sound' }> => o.op === 'sound' && ((o.flags ?? 0) & SLOT_FLAGS) === 0)?.sound ?? null;
    out[k] = { ...c, sound: voice, copies };
  }
  return out;
}

/** LATER 125 (F2): whether a branch's own ops -- up to its `CALL_SEQUENCE` -- stop a kill one-shot (HostKillN / SealKillN). */
function stopsKill(ops: readonly EffectOp[]): boolean {
  for (const o of ops) {
    if (o.op === 'callSequence' || o.op === 'if' || o.op === 'while') break;
    if (o.op === 'stopSequence' && /^(Host|Seal)Kill\d$/.test(o.sequence)) return true;
  }
  return false;
}

/** `start`'s loop: the ops of the first branch, of its `IF` chains in order, that holds with `valves`; null when none. */
function inLoop(start: readonly EffectOp[], valves: Readonly<Record<string, number>>): EffectOp[] | null {
  const w = start.findIndex((o) => o.op === 'while');
  for (let i = w + 1; w >= 0 && i < start.length; i++) {
    const o = start[i]!;
    if (o.op === 'endWhile') break;
    if (o.op !== 'if') continue;
    const { branches, end: after } = chain(start, i);
    const b = branches.find((x) => x.conditions.length > 0 && holds(x.conditions, valves));
    if (b) return b.ops;
    i = after - 1;
  }
  return null;
}

/**
 * LATER 131 (`ESCORT_IN_ROUND_LINES_READING`): ESCORT's in-round lines -- RescueN's and EndRescueN's first branch, each by
 * the VIP its `<name>_valve_alive` names; VIPcheck's branch after its WHILE by local `player_team`. Undefined off ESCORT.
 */
function escortCues(program: EffectProgram): EscortCues | undefined {
  if (!isEscort(program)) return undefined;
  const out: EscortCues = { staged: {}, extracted: {}, aborted: {} };
  for (const s of program.sequences) {
    const m = /^(Rescue|EndRescue)\d$/.exec(s.name);
    const vip = m ? vipOf(s.ops) : null, b = m ? firstBranch(s.ops) : null;
    if (m && vip !== null && b) out[m[1] === 'Rescue' ? 'staged' : 'extracted'][vip] = decidedSteps(b);
  }
  const check = program.sequences.find((s) => s.name === 'VIPcheck')?.ops ?? null;
  const e = check ? check.findIndex((o) => o.op === 'endWhile') : -1;
  const at = check && e >= 0 ? check.findIndex((o, i) => i > e && o.op === 'if') : -1;
  if (check && at >= 0) {
    const { branches } = chain(check, at);
    for (const team of TEAMS) {
      const b = branches.find((x) => x.conditions.length > 0 && holds(x.conditions, { player_team: team }));
      if (b) out.aborted[team] = decidedSteps(b.ops);
    }
  }
  return out;
}

/** LATER 131: the VIP a sequence watches -- the name in its `<name>_valve_alive` test -- or null. */
function vipOf(ops: readonly EffectOp[]): string | null {
  for (const o of ops) {
    for (const c of (o as { conditions?: readonly EffectCondition[] }).conditions ?? []) {
      const m = c.kind === 'valve' ? /^(.+)_valve_alive$/.exec(c.valve) : null;
      if (m) return m[1]!;
    }
  }
  return null;
}

/**
 * LATER 125 (`ESCORT_LINES_READING`): ESCORT's decided branches by local `player_team` -- `rescue` `hostages_rescued`'s
 * branch for the team, then `escort_success`'s steps (LATER 131: EndRescueN's own lines are the room's `escort`'s); `hostageKills` `start`'s `killcount >= 3`
 * branch; `elimination` (the SEALs' win) `start`'s Terrorists-eliminated branch, then `escort_success`'s. A team a part is
 * missing for is absent; undefined when `start` or `escort_success` is.
 */
function escortDecided(seq: (name: string) => readonly EffectOp[] | null): DecidedCues | undefined {
  const start = seq('start'), success = seq('escort_success');
  if (!start || !success) return undefined;
  const e = success.findIndex((o) => o.op === 'endWhile');
  const tailOps = e < 0 ? [] : success.slice(e + 1);
  const tail = decidedSteps(tailOps), tailStops = stopsKill(tailOps);
  const rescued = seq('hostages_rescued');
  const stops = { rescue: {}, hostageKills: {}, elimination: {}, terroristElimination: {}, timeout: {} } as Required<NonNullable<DecidedCues['stopsKills']>>;
  const out: Required<Omit<DecidedCues, 'terroristElimination' | 'timeoutPlantLive'>> = { rescue: {}, hostageKills: {}, elimination: {}, timeout: {}, stopsKills: stops };
  // LATER 127: the time-out's win -- `mission_timer`'s own steps past its WHILE (Foxhunt's stop the kill one-shots,
  // MP53 @7068-@7108), then `escort_success`'s.
  const timer = seq('mission_timer');
  const t = timer ? timer.findIndex((o) => o.op === 'endWhile') : -1;
  const timerStops = timer && t >= 0 ? stopsKill(timer.slice(t + 1)) : false;
  const inStart = (valves: Readonly<Record<string, number>>): EffectOp[] | null => inLoop(start, valves);
  for (const team of TEAMS) {
    out.timeout[team] = [...tail]; stops.timeout[team] = timerStops || tailStops;
    const alive = { aiteam_00: 1, aiteam_08: 1, player_team: team };
    const kills = inStart({ ...alive, killcount: 3 });
    if (kills) { out.hostageKills[team] = decidedSteps(kills); stops.hostageKills[team] = stopsKill(kills); }
    const elim = inStart({ ...alive, aiteam_08: 0 });
    if (elim) { out.elimination[team] = [...decidedSteps(elim), ...tail]; stops.elimination[team] = stopsKill(elim) || tailStops; }
    const lost = inStart({ ...alive, aiteam_00: 0 });
    if (lost) stops.terroristElimination[team] = stopsKill(lost);
    const at = rescued ? rescued.findIndex((o) => o.op === 'if') : -1;
    const r = rescued && at >= 0 ? chain(rescued, at).branches.find((x) => x.conditions.length > 0 && holds(x.conditions, { truecount: 1, rescuecheck: 1, player_team: team })) : undefined;
    if (r) {
      out.rescue[team] = [...decidedSteps(r.ops), ...tail];
      stops.rescue[team] = stopsKill(r.ops) || tailStops;
    }
  }
  return out;
}

/** A decided branch's own steps -- waits, `MESSAGE`s and streams, in order -- up to its `CALL_SEQUENCE`, trailing waits trimmed. */
function decidedSteps(ops: readonly EffectOp[]): BombStep[] {
  const out: BombStep[] = [];
  for (const o of ops) {
    if (o.op === 'callSequence' || o.op === 'if' || o.op === 'while') break;
    const st = bombStep(o);
    if (st) out.push(st);
  }
  let n = out.length;
  while (n > 0 && 'wait' in out[n - 1]!) n--;
  return out.slice(0, n);
}

/**
 * `start`'s rescue and hostage-kill branches (`RESCUE_WIN_LINES_READING`), the first of its loop's chain that holds per
 * local team with both sides alive and the reason's valves set; undefined when the script has neither.
 */
function decidedCues(ops: readonly EffectOp[]): DecidedCues | undefined {
  const out: DecidedCues = { rescue: {}, hostageKills: {} };
  const w = ops.findIndex((o) => o.op === 'while');
  if (w < 0) return undefined;
  const reasons = {
    rescue: { rescuecount: 2, rescuecheck: 1 },
    hostageKills: { mp_hostages_by_seals: 2 },
  } as const;
  let any = false;
  for (let i = w + 1; i < ops.length; i++) {
    const o = ops[i]!;
    if (o.op === 'endWhile') break;
    if (o.op !== 'if') continue;
    const { branches, end } = chain(ops, i);
    for (const reason of ['rescue', 'hostageKills'] as const) {
      for (const team of TEAMS) {
        if (out[reason][team]) continue;
        const valves = { aiteam_00: 1, aiteam_08: 1, player_team: team, ...reasons[reason] };
        const b = branches.find((x) => x.conditions.length > 0 && holds(x.conditions, valves));
        if (b) { out[reason][team] = decidedSteps(b.ops); any = true; }
      }
    }
    i = end - 1;
  }
  return any ? out : undefined;
}

/** The cues of a decoded `objectives` program. */
export function roundCues(program: EffectProgram, map: string): RoundCues {
  const seq = (name: string): readonly EffectOp[] | null => program.sequences.find((s) => s.name === name)?.ops ?? null;
  const start = seq('start') ?? [], start2 = seq('start2'), timer2 = seq('mission_timer2');
  const open = opening(start);
  const tail = breachTail(seq);                       // LATER 130: BREACH's, else null
  const read = bombCues(seq), bomb = read && tail ? withBreachDefuse(read, tail) : read;
  const hostages = hostageCues(program);
  const escort = escortCues(program);                 // LATER 131
  const read0 = isEscort(program) ? escortDecided(seq) : tail ? breachDecided(seq('start'), tail) : decidedCues(start);   // LATER 125, 130
  // LATER 150: the breach time-out's hold keeps the plant live where its path leaves `switch_timer` running.
  const decided = read0 && tail && read && !timeoutStopsPlant(seq) ? { ...read0, timeoutPlantLive: { defused: read.defused } } : read0;
  return {
    map, intro: open.cues, introRespawn: start2 ? opening(start2).cues : null,
    elimination: eliminations(start), timeExpired: timer2 ? afterLoop(timer2) : [], objective: open.objective,
    ...(bomb ? { bomb } : {}), ...(hostages ? { hostages } : {}), ...(decided ? { decided } : {}), ...(escort ? { escort } : {}),
  };
}

/** The cues of a map's mission zAnims (`MZANIM.ZAR`, parsed): its `objectives` animation's, or null without one. */
export function roundCuesFromArchive(archive: ZAnimArchive, map: string): RoundCues | null {
  for (const set of archive.sets) for (const a of set.anims) if (a.name === 'objectives') return roundCues(decodeEffectProgram(a), map);
  return null;
}

/**
 * The cues with each objective line's locale id read through the map's strings (`@s2u/scene` `mapLocArchive`,
 * `readLocArchive`): `text` filled where the table holds the id, the id kept; a raw line, or an id the table lacks, as
 * it was.
 */
export function withObjectiveTexts(cues: RoundCues, text: (id: number) => string | undefined): RoundCues {
  const objective: CuesByTeam<ObjectiveLine[]> = {};
  for (const t of TEAMS) {
    const ls = cues.objective[t];
    if (ls) objective[t] = ls.map((l) => (l.text === null && l.locId !== null ? { ...l, text: text(l.locId) ?? null } : l));
  }
  // XR-06: the bomb's lines too (mp72LOC 7206-7213 on Crossroads).
  const fill = (steps: BombStep[]): BombStep[] => steps.map((s) => ('message' in s && s.message === null && s.locId !== null ? { ...s, message: text(s.locId) ?? null } : s));
  const byTeam = (by: CuesByTeam<BombStep[]>): CuesByTeam<BombStep[]> => {
    const out: CuesByTeam<BombStep[]> = {};
    for (const t of TEAMS) { const steps = by[t]; if (steps) out[t] = fill(steps); }
    return out;
  };
  const bomb = cues.bomb && Object.fromEntries((Object.entries(cues.bomb) as [BombCueKind, BombCue][])
    .map(([k, cue]) => [k, { seal: byTeam(cue.seal), terrorist: byTeam(cue.terrorist) }])) as BombCues;
  // HX-5: the hostage one-shots' lines and the decided branches' too.
  const fillLine = (l: ObjectiveLine): ObjectiveLine => (l.text === null && l.locId !== null ? { ...l, text: text(l.locId) ?? null } : l);
  const hostages = cues.hostages && Object.fromEntries((Object.entries(cues.hostages) as [HostageCueKind, HostageCue][])
    .map(([k, c]) => [k, { ...c, lines: c.lines.map(fillLine), ...(c.copies ? { copies: c.copies.map(fill) } : {}) }])) as HostageCues;
  // LATER 150: every field kept -- the fill dropped `decided.timeout` (LATER 138, B87), MP73's time-out lines with it.
  const decided = cues.decided && {
    ...cues.decided,
    rescue: byTeam(cues.decided.rescue), hostageKills: byTeam(cues.decided.hostageKills),
    ...(cues.decided.timeout ? { timeout: byTeam(cues.decided.timeout) } : {}),
    ...(cues.decided.timeoutPlantLive ? { timeoutPlantLive: { defused: { seal: byTeam(cues.decided.timeoutPlantLive.defused.seal), terrorist: byTeam(cues.decided.timeoutPlantLive.defused.terrorist) } } } : {}),
    ...(cues.decided.elimination ? { elimination: byTeam(cues.decided.elimination) } : {}),   // LATER 125
    ...(cues.decided.terroristElimination ? { terroristElimination: byTeam(cues.decided.terroristElimination) } : {}),   // LATER 130: MP73's 7305
    ...(cues.decided.stopsKills ? { stopsKills: cues.decided.stopsKills } : {}),
  };
  // LATER 131: ESCORT's in-round lines too.
  const byVip = (by: Record<string, BombStep[]>): Record<string, BombStep[]> => Object.fromEntries(Object.entries(by).map(([k, v]) => [k, fill(v)]));
  const escort = cues.escort && { staged: byVip(cues.escort.staged), extracted: byVip(cues.escort.extracted), aborted: byTeam(cues.escort.aborted) };
  return { ...cues, objective, ...(bomb ? { bomb } : {}), ...(hostages ? { hostages } : {}), ...(decided ? { decided } : {}), ...(escort ? { escort } : {}) };
}

/** LATER 131: every step list of the cues' escort lines. */
function escortSteps(c: RoundCues): BombStep[][] {
  return c.escort ? [...Object.values(c.escort.staged), ...Object.values(c.escort.extracted), ...Object.values(c.escort.aborted)] : [];
}

/** Whether the cues name a line by an id the map's strings must fill: the objective's, or the bomb's (XR-06). */
export function needsTexts(c: RoundCues): boolean {
  const ids = (steps: readonly (ObjectiveLine | BombStep)[] | undefined): boolean => !!steps?.some((s) => 'locId' in s && s.locId !== null);
  return Object.values(c.objective).some(ids)
    || Object.values(c.bomb ?? {}).some((cue) => [...Object.values(cue.seal), ...Object.values(cue.terrorist)].some(ids))
    || Object.values(c.hostages ?? {}).some((h) => ids(h.lines) || !!h.copies?.some(ids))
    || [...Object.values(c.decided?.rescue ?? {}), ...Object.values(c.decided?.hostageKills ?? {}), ...Object.values(c.decided?.elimination ?? {}),
      ...Object.values(c.decided?.terroristElimination ?? {}), ...Object.values(c.decided?.timeout ?? {}),
      ...Object.values(c.decided?.timeoutPlantLive?.defused.seal ?? {}), ...Object.values(c.decided?.timeoutPlantLive?.defused.terrorist ?? {})].some(ids)   // LATER 130, 150
    || escortSteps(c).some(ids);                                                                                                    // LATER 131
}

/** Every stream name the cues play, once each: what the worker reads out of VAGSTORE for the map -- the bomb's too (XR-06). */
export function cueNames(c: RoundCues): string[] {
  const all = [c.intro, c.introRespawn ?? {}, c.elimination.seal, c.elimination.terrorist].flatMap((by) => Object.values(by).flat());
  const bomb: BombStep[] = Object.values(c.bomb ?? {}).flatMap((cue) => [...Object.values(cue.seal), ...Object.values(cue.terrorist)].flat());
  // HX-5: the hostage one-shots' streams and the decided branches'.
  // LATER 125: ESCORT's `elimination` and its kill one-shots' own steps too.
  const decided: BombStep[] = [...Object.values(c.decided?.rescue ?? {}), ...Object.values(c.decided?.hostageKills ?? {}),
    ...Object.values(c.decided?.elimination ?? {}), ...Object.values(c.decided?.terroristElimination ?? {}),   // LATER 130
    ...Object.values(c.hostages ?? {}).flatMap((h) => h.copies ?? []), ...escortSteps(c)].flat();   // LATER 131: the escort lines'
  const hostages = Object.values(c.hostages ?? {}).flatMap((h) => (h.sound ? [h.sound] : []));
  return [...new Set([...[...all, ...c.timeExpired, ...bomb, ...decided].flatMap((s) => ('sound' in s ? [s.sound] : [])), ...hostages])];
}
