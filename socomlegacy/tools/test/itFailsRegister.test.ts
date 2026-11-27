import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * P34 (H), the online-parity sweep's class H guard (2026-11-02): note-versus-code drift -- an expected failure that
 * outlives what it waits on (BO-1: research 214 s6 said "built" while `bombPage.test.ts`'s `it.fails` stood 24 days). A
 * product-track guard: it reads source text and changes nothing the game does.
 *
 * Every `it.fails(` / `test.fails(` call -- in any chain: `it.fails.each(...)(`, `it.skipIf(c).fails(`, `it.concurrent.fails(`
 * -- in the tests of `packages/` and `tools/`, read off the syntax tree
 * (`ts.createSourceFile`, no program), so a comment or a string that names one (`tools/test/parityRegistry.test.ts`'s
 * fixture) does not count -- is listed in `REGISTER` by its file and its title (a template title as written,
 * `${speed}` and all) with the row it waits on:
 * - a parity registry id (`docs/parity/registry/<area>.json`, `area.x.y`): a drift held under TA.R6, which must list the
 *   test (its `tests[]`: file and name), so the register and the registry cannot part;
 * - a task or a row: a sweep task (`P25`), an owner row (`H152`), a plan task (`PAR-21`);
 * - `unrowed`: no row found in the comment above it, its file's doc or `git log -S` -- listed in the P34 report.
 *
 * Fails: an `it.fails` not listed, a listed one no longer found (made an ordinary `it`, or retitled: the line goes or
 * moves with it), a registry id that does not list its test.
 */

const root = resolve(import.meta.dirname, '../..');
const REGISTRY = join(root, 'docs', 'parity', 'registry');

function tests(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'node_modules' && name !== 'dist') out.push(...tests(path)); }
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/**
 * Whether a call is a test's own (the call that takes the title) whose `.` chain -- through property accesses and the
 * calls between them (`it.skipIf(c).fails`, `it.fails.each(t)(...)`) -- starts at `it` or `test` and holds `fails`.
 */
function isFailsCall(n: ts.CallExpression): boolean {
  if (ts.isCallExpression(n.parent) && n.parent.expression === n) return false;   // a callee: its caller takes the title
  let e: ts.Expression = n.expression, fails = false;
  for (;;) {
    if (ts.isPropertyAccessExpression(e)) { if (e.name.text === 'fails') fails = true; e = e.expression; }
    else if (ts.isCallExpression(e)) e = e.expression;
    else break;
  }
  return fails && ts.isIdentifier(e) && /^(?:it|test)$/.test(e.text);
}

/** The `it.fails` / `test.fails` calls a source makes, in any chain (`isFailsCall`): each one's title (a template's as written). */
export function failsTitles(text: string): string[] {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && isFailsCall(n)) {
      const a = n.arguments[0];
      out.push(!a ? '' : ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ? a.text : a.getText(sf));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** What an expected failure waits on: `row` (see the file's doc) and why it stands. */
interface Waits { row: string; why: string }

/** Today's expected failures (main `e181bf6c3`, 2026-11-02; with main `5114525e3`'s, 2026-11-03), by `<file from socomlegacy/>::<title>`. */
export const REGISTER: Record<string, Waits> = {
  "packages/scene/test/projectile.test.ts::LATER 1302: N held game frames give the original's 1 - 0.9^(N-2) at release (IQ-160 3A, unscored capture)":
    { row: 'LATER 1302', why: "B-46 (b), the fix to v0.4.33: IQ-160 3A (r0004, Shadow PC 4, an unscored capture, record IQ160-ORIG-PC4) has the original's first two held game frames add no power (1 - 0.9^(N-2)); the port's stepThrowPower steps from the first held frame (1 - 0.9^N), two steps high; the fix must re-point the test's held() at wherever the delay lands (GrenadeCore / heldPower), not bend stepThrowPower" },
  "packages/scene/test/projectile.test.ts::LATER 1302: a release at the third held frame throws nothing -- the power under abort_threshold (IQ-160 3A, unscored capture)":
    { row: 'LATER 1302', why: "B-46 (b), the fix to v0.4.33: at N = 3 the original's power is 0.1001, under abort_threshold 0.15, and nothing is thrown (IQ-160 3A, 3/3); the port's three steps give 0.271 and throw" },
  "packages/viewer/test/later994WindowSweep.test.ts::the original's band: THROUGH from 39.39 u, STOPPED from 43.73 u (r0004 3 of 3 each)":
    { row: 'LATER 994', why: "DG-WINDOW-SWEEP-r0004 (IQ-164): r0004 passes Desert Glory's SEAL-building window from the sand side only at a 39.39 u take-off and stops at 43.73 u; the port's pass band sits ~2-3 u further out (the air head line's look-ahead meeting the wall above the window); the fix is v0.4.33's (the main controller 2026-11-24)" },
  "packages/match/test/netcode.test.ts::GAP (LATER 580): the facing too is laid back under the round screens within a round trip":
    { row: 'LATER 580', why: 'row 16 (2026-11-22): under the round screens the room freezes the facing where its hold began and the page holds its own (2 degrees apart in the test), so reconcileFacing counts a correction on every held ack until the respawn; the page should lay the room facing once at the hold start (LATER 580 reopened, with the held-flag wire change)' },
  "packages/viewer/test/landingStance.test.ts::prone with the stick held: the landing tick stands with prone pending; prone again within about 2 frames (needs LATER 1377)":
    { row: 'LATER 1377', why: "the original's landing still test sums the move's velocity, not the fall (B90-PC4 t2 pushed the land clip after a 15 u drop with the stick held); the port counts the fall in land()'s still sum, so it pushes no clip and the landing keeps prone" },
  "packages/viewer/test/throwClearVigiCapture.disc.test.ts::`IQ-084 MAIN facing +x, the Mark141 ${latchName(latch)}, a 300 ms hold: the toss, refused (the original threw nothing) -- FAILS today: LATER 1302, the page power at a true 300 ms is 0.6126, over the toss line`":
    { row: 'LATER 1302', why: "the port's throw power at a true 300 ms hold is 0.6126 (1 - 0.9^N from the press) where the original steps N - 2 of N polls (0.469-0.522, a toss), so the page throws where the original tosses (IQ-152 capture 1, IQ-084); drop when LATER 1302 lands" },
  "packages/viewer/test/throwClearVigiCapture.disc.test.ts::IQ-152 capture 1 B facing +x, the Mark141 selected standing, a 300 ms hold: the toss, refused (the original REFUSED 3/3 as a toss, power 0.469-0.522) -- FAILS today: LATER 1302, the page power at 300 ms is 0.6126, a throw":
    { row: 'LATER 1302', why: "the port's throw power at a true 300 ms hold is 0.6126 (1 - 0.9^N from the press) where the original steps N - 2 of N polls (0.469-0.522, a toss), so the page throws where the original tosses (IQ-152 capture 1, IQ-084); drop when LATER 1302 lands" },
  "packages/viewer/test/throwClearVigiCapture.disc.test.ts::IQ-152 capture 1 A facing -x, the Mark141 selected standing, a 300 ms hold: the toss, refused (the original REFUSED 3/3 as a toss, hit x 961.43-961.80) -- FAILS today: LATER 1302, the page power at 300 ms is 0.6126, a throw":
    { row: 'LATER 1302', why: "the port's throw power at a true 300 ms hold is 0.6126 (1 - 0.9^N from the press) where the original steps N - 2 of N polls (0.469-0.522, a toss), so the page throws where the original tosses (IQ-152 capture 1, IQ-084); drop when LATER 1302 lands" },
  "packages/viewer/test/throwClearVigiCapture.disc.test.ts::IQ-152 capture 1 MAIN facing +x, the Mark141 selected standing, a 300 ms hold: the toss, refused (the original REFUSED 3/3 as a toss) -- FAILS today: LATER 1302, the page power at 300 ms is 0.6126, a throw":
    { row: 'LATER 1302', why: "the port's throw power at a true 300 ms hold is 0.6126 (1 - 0.9^N from the press) where the original steps N - 2 of N polls (0.469-0.522, a toss), so the page throws where the original tosses (IQ-152 capture 1, IQ-084); drop when LATER 1302 lands" },
  "packages/viewer/test/depthRatioCheck.devdisc.test.ts::the port f with its own posed firing firepoint at init_aim_pitch is the original\u2019s own f (0.05 px) at both poses -- not yet: LATER 1202":
    { row: 'LATER 1202', why: "the port's posed 552 SD crouched FIRING firepoint at init_aim_pitch is about 1.6 u under the original's +0x14b0 at A-d30 (PC 3's read), leaving f 0.47 px under the original's own there (A-d100 at the 0.05-px tolerance) (research 441 s3.2); the camera and aim meet the original (LATER 1159, closed)" },
  "packages/match/test/hostageShutDoor.devdisc.test.ts::(a2t) LATER 1206: the push of the door goal to the open takes 1.21-1.27 s (Q24b, n = 19; the port 1.200 s with the MOVE as read)":
    { row: 'LATER 1206', why: "with the door program's ai::MOVE built as read (arrived at 1.0 u AND facing within 0.05, or 0.4 s, DAT_00650ac0) the port's push -> open is 1.200 s against the original's 1.21-1.27 s (n = 19): about 0.01-0.07 s short, unaccounted (the frame of the program's first tick and the goal timer's first count; the body does not turn, HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER)" },
  "packages/viewer/test/throttleFrame.test.ts::A2 at CUSTOM / DEAD ZONE minimum, SNAPPED: minimum speed within 1 of the rig's 54.0-54.3 (LATER 1072)":
    { row: 'LATER 1072', why: "R8.1's per-tick window takes the right macro's 0.768 for a tick that the original's single frame read never sees" },
  "packages/viewer/test/throttleFrame.test.ts::A2 at CUSTOM / DEAD ZONE minimum: the caught share within two binomial sigma of the rig's 15 of 20 (LATER 1072)":
    { row: 'LATER 1072', why: "the port catches the macro in about half its phases, the rig in 15 of 20: unexplained (research 208 s10's read latency)" },
  "packages/viewer/test/throttleFrame.test.ts::A2 at RECRUIT: the caught share within two binomial sigma of the rig's 16 of 20 (LATER 1072)":
    { row: 'LATER 1072', why: 'as the CUSTOM share: the port about half, the rig 16 of 20' },
  "packages/viewer/test/console/input.test.ts::a press after keys leaves the mode pad until its click; the click steps the value once and turns it pointer (LATER 1083)":
    { row: 'LATER 1083', why: "the pointerdown flips the console to pointer mode before its click, so pad-only CSS reflows under the pointer (LR.R19's switch)" },
  "packages/viewer/test/flashWarm.test.ts::WM-17 (LATER 772): a body joining in a wave, the wave's glow jobs ahead of its own, builds nothing in the next flash's frame":
    { row: 'LATER 772', why: "a body that joins with no flashbang in the air still has its glow program built in the flash's own frame (promoteGlow acts only during a fuse); it passes once a body's glow compile is done before it can meet a flash, or the programs are shared" },
  "packages/viewer/test/pushApart.capture.test.ts::S2: a standing walker stops at 14.05-14.26 u and holds over 7 s; the teammate never moves":
    { row: 'LATER 711', why: "step (2), the muzzle push, waits on the rig's Q22-T (PUSH_APART_MUZZLE_REACH_READING); the contact slide alone stops a walker near 12" },
  "packages/viewer/test/pushApart.capture.test.ts::S3: head-on, both running, they stall and then pass at a minimum of 1.48-2.22 u":
    { row: 'LATER 711', why: "the rig's pass is inferred to be the two consoles' lag (research 426 s6); one lag-free sim stalls the pair" },
  "packages/viewer/test/pushApart.capture.test.ts::L2: a crouched walker stops at 18.1-19.2 u and holds":
    { row: 'LATER 711', why: "step (2), as S2: the contact slide alone stops a crouched walker near 14" },
  'packages/viewer/test/boltStance.test.ts::BOLT_POP_TRANSITION_READING (reloadClip.ts): the drop before the timer, then crouch with the stick -- taken about 0.567 s after the shot':
    { row: 'LATER 1301', why: "the pop of an in-flight drop transition when the bolt's still clip is pushed (FUN_0058a4d0) is not built; a crouch pressed during a drop waits for the drop as well as the clip; research 150 s6" },
  "packages/scene/test/weaponTable.parity.test.ts::DRIFT: a SEAL's refill after the Satchel on MP1 is the PMN (mask 8, as FUN_0023b9b0 tests the side), not the Claymore":
    { row: 'weapons.arsenal.autofillside', why: 'TA.R6 drift, R94.4/W4.R2: the in-game auto-fill side, the owner\'s question open' },
  "packages/sound/test/decode.parity.test.ts::the port's sceSdNote2Pitch equals Sony's with the disc's table for every centre note and fine (drift: rounded table)":
    { row: 'sound.pitch.note-table', why: 'TA.R6 drift: the port rounds LIBSD.IRX\'s floored note table' },
  "packages/sound/test/decode.parity.test.ts::each pinned tone's pitch word is the port's note2Pitch of its centre note and fine at note 60 (drift: .M4A1, .DINK)":
    { row: 'sound.pitch.note-table', why: 'TA.R6 drift: as above on the pinned tones' },
  'packages/viewer/test/audio.parity.test.ts::".SLIDE\\t" -- the keyboard\'s scale-down, a trailing tab -- is silent (drift: the lookup trims the name)':
    { row: 'sound.lookup.spelt-as-is', why: 'TA.R6 drift: the lookup trims the name' },
  'packages/viewer/test/audio.parity.test.ts::a bank sound sounds.rdr does not list is silent (drift: the port resolves names in the bank, not the script)':
    { row: 'sound.lookup.unlisted-silent', why: 'TA.R6 drift: names resolved in the bank' },
  "packages/viewer/test/audio.parity.test.ts::the data's slips .BUL_CASE_METAL and .GREN_ASPHALT play nothing (drift: SOUND_NAME_FIXES mends them)":
    { row: 'sound.lookup.name-fixes', why: 'TA.R6 drift: SOUND_NAME_FIXES, the owner\'s playtest of 2026-09-29' },
  "packages/viewer/test/audio.parity.test.ts::a name the script spells without the bank's trailing blank plays over its entry's RANGE (drift: the default range)":
    { row: 'sound.lookup.ordinal-binding', why: 'TA.R6 drift: the script filed by the bank\'s own name' },
  "packages/viewer/test/build_keyboard.test.ts::/testroom's teleport (the hook's) and its playtest overlay are folded by import.meta.env.DEV, as the taunt editor is, so no built page reaches them whatever its URL (PAR-16's acceptance; PAR-14)":
    { row: 'H152', why: 'the owner\'s row (answered 2026-10-23: leave as is for now); PAR-16' },
  "packages/viewer/test/impacts.parity.test.ts::the casing's metal bounce asks for .BUL_CASE_METAL, which no bank holds: silent on the console (research 89 section 11)":
    { row: 'combatfx.effects.sound.unfound-names', why: 'TA.R6 drift, ruled departure (SOUND_NAME_FIXES)' },
  'packages/viewer/test/impacts.parity.test.ts::a grenade bouncing on asphalt names .GREN_ASPHALT by command 45, not a sound command, and no bank holds it: silent in the game (research 85 section 9.9)':
    { row: 'combatfx.effects.sound.unfound-names', why: 'TA.R6 drift, ruled departure (SOUND_NAME_FIXES)' },
  'packages/viewer/test/impacts.parity.test.ts::a casing on dirt asks for .BUL_CAS_DIRT; a map whose banks lack it plays nothing, with no stand-in (research 89 section 11)':
    { row: 'combatfx.effects.sound.unfound-names', why: 'TA.R6 drift, ruled departure (SOUND_FALLBACKS)' },
  'packages/viewer/test/look.parity.test.ts::the right stick at byte 176 turns 0 after a 1 s hold, as research 22 read it on both runs [drift: the port 0.005]':
    { row: 'movement.look.byte176', why: 'TA.R6 drift: the pad block gives 0.0048 at byte 176' },
  'packages/viewer/test/fallDrop.test.ts::62 u: every health x 0.857 (measured loss 0.143 -- a capture of the original by placement, pending review)':
    { row: 'LATER 1240', why: 'the fall-leave-edge plan open row 1, a placed drop: whether it falls under the flag is unread (FALL_FLAG_PLACED_READING; research 151 s8 / s9); every placed row fits only with a drop 1.06-1.56 u shorter than stated; settled by a write-watch of a placed drop (the fall-leave-edge plan, open row 1)' },
  'packages/viewer/test/fallDrop.test.ts::75 u: every health x 0.619 (measured loss 0.381 -- a capture of the original by placement, pending review)':
    { row: 'LATER 1240', why: 'the fall-leave-edge plan open row 1, a placed drop: whether it falls under the flag is unread (FALL_FLAG_PLACED_READING; research 151 s8 / s9); every placed row fits only with a drop 1.06-1.56 u shorter than stated; settled by a write-watch of a placed drop (the fall-leave-edge plan, open row 1)' },
  'packages/viewer/test/fallDrop.test.ts::90 u: every health x 0.386 (measured loss 0.614 -- a capture of the original by placement, pending review)':
    { row: 'LATER 1240', why: 'the fall-leave-edge plan open row 1, a placed drop: whether it falls under the flag is unread (FALL_FLAG_PLACED_READING; research 151 s8 / s9); every placed row fits only with a drop 1.06-1.56 u shorter than stated; settled by a write-watch of a placed drop (the fall-leave-edge plan, open row 1)' },
  'packages/viewer/test/fallDrop.test.ts::120 u: dead, all six healths 0 (measured -- a capture of the original by placement, pending review)':
    { row: 'LATER 1240', why: 'the fall-leave-edge plan open row 1, a placed drop: whether it falls under the flag is unread (FALL_FLAG_PLACED_READING; research 151 s8 / s9); every placed row fits only with a drop 1.06-1.56 u shorter than stated; settled by a write-watch of a placed drop (the fall-leave-edge plan, open row 1)' },
  'packages/viewer/test/weaponLine.test.ts::GAP (LATER 681): (iii) the closest approach walking in square: at least half of a fine sweep inside the capture 5.34-5.40':
    { row: 'LATER 681', why: 'SEGMENT-BODY: walked in square on M51 g19733 the segment body stops short of the plane (a fine sweep of 61 starts: 1 inside, trunk and head); the original closes to 5.34-5.40 (r0004 climb-angle ca-0). Scored by the fraction since the LATER 1164 pair review (F1)' },
  "packages/viewer/test/accessBarriers.test.ts::GAP (LATER 1322): access1 in from outside, the final rest within 0.1 of the capture's (mp51-in-t1 row 36, 1054.375)":
    { row: 'LATER 1322', why: 'LATER 1194B (2026-11-21, the fresh review F3): the port stops on the capture own 7th frame within 0.008 and holds; the original then moves 1.042 on one half-time frame (dt 0.0167) to its final rest, which the port with whole frames does not' },
  "packages/viewer/test/bridgeWedge.test.ts::GAP (LATER 1332): the MP51 run off (1349.15, 409.6) lands and walks out in at least 6 of 8 headings":
    { row: 'LATER 1332', why: 'LATER 1194B (2026-11-21): the run off lands 3 u deeper into the crates corner and walks out in 5 of 8 headings, under the owner 6-of-8 bar; not stuck; his word on the hands-on decides' },
  "packages/viewer/test/pushApart.wallSide.test.ts::at 45 degrees along the wall: the runner never sinks below the original deepest stop, 7.75 u (LATER 711, W3)":
    { row: 'LATER 711', why: "the port sinks into a wall-side teammate where the original holds, slides round or wedges at 7.75-7.80 u (Q22-WP W3); with the walls once a frame, over a 3 x 3 grid of starts some still sink (the fresh review of 1d3d40a26a: 99 of 270 under 7.75); likely the unbuilt muzzle push (step 2)" },
  "packages/viewer/test/traversal.test.ts::GAP (LATER 1334): PAR-21a C2 at 30 degrees: the climb is offered from every start of the walk-in sweep (+0 to +0.6)":
    { row: 'LATER 1334', why: 'LATER 1194B (2026-11-21, the fresh review F4): at 30 degrees into a two-crate inside corner the climb is offered at only 4 of 13 walk-in starts under the walls met once a frame, by the original own drop rule (FUN_005483d0, second-read r0001 + r0004), its phase uncaptured: a named limit, the capture in the backlog' },
  'packages/viewer/test/m51DitchBlock.disc.test.ts::GAP (LATER 690): from the capture start, the running jump lands back in the ditch, apex 13.17 +- 0.5':
    { row: 'LATER 690', why: 'SEGMENT-BODY (written before LATER 1194B; at the walls head the cut speed is under 0.01 on all 70 push ticks, so the first cause below no longer holds and the GAP is to be re-read): on 25 of the 70 push ticks the move meets no segment, so the take-off carries 65 -x over the ditch log and lands at x 932, where r0004 (ac ditch capture) stalls with the contact set and lands back at x 984; the causes (DITCH-ESCAPE-READ): the 60 Hz wall step (H404) and the take-off carry, zeroed on a jam where the original keeps +0x38 (from +0x64, writer unread); the follow-up branch for the next release steps the walls at 30 Hz per the owner H404 (b) ruling, plus the carry' },
  "packages/viewer/test/parity/actionStack.test.ts::the standing swap cut forward carries the stack's phase onto the overlay's clock":
    { row: 'unrowed', why: 'research 251 s10.5 owed: the cut\'s carry-over moves the room\'s swap life; "waits for a row that checks the room with it"' },
  "packages/viewer/test/parity/actionStack.test.ts::the standing swap cut reversed carries the stack's phase onto the overlay's clock, counting down":
    { row: 'unrowed', why: 'research 251 s10.5 owed, as above' },
  "packages/viewer/test/parity/climbInterrupt.parity.test.ts::the body does not end on the top: under it, inside the hull's span (the original as research 230 s3.3 reads it)":
    { row: 'movement.climb.place-interrupt', why: 'TA.R6 drift; PB-7 (b), issue #96' },
  "packages/viewer/test/parity/climbInterrupt.parity.test.ts::the body does not end on the top: under it, inside the hull's span (research 230 s3.3)":
    { row: 'movement.climb.place-interrupt', why: 'TA.R6 drift; PB-7 (b), issue #96 (MP2)' },
  'packages/viewer/test/parity/climbInterrupt.parity.test.ts::GAP (LATER 680): an ordinary climb ends on the 111.85 top':
    { row: 'LATER 680', why: 'SEGMENT-BODY: walked -z from x 938 only a side line meets prop01, no contact is stored and the weapon line\'s slot is never consulted, so no climb is offered; an r0004 capture of the walk owed (research 86 s3.8)' },
  'packages/viewer/test/parity/climbInterrupt.parity.test.ts::GAP (LATER 680): the place is accepted mid-climb':
    { row: 'LATER 680', why: 'SEGMENT-BODY: no climb to cut from x 938, as above' },
  "packages/viewer/test/traversal.parity.test.ts::drift: the hang's pull-up stand-in rises 22.59 and goes 5.24 ahead, as the table has seal_hang2climbup":
    { row: 'movement.traversal.fallback-shapes', why: 'TA.R6 drift: the FALLBACK shape before the pack arrives' },
  'packages/viewer/test/traversal.parity.test.ts::drift: TRAVERSAL_CLIP.rleanStep (seal_rlean_rstep) is a clip in MOTION_P.ZAR':
    { row: 'movement.traversal.clip-names', why: 'TA.R6 drift: a clip name MOTION_P.ZAR does not hold' },
  "packages/viewer/test/traversal.test.ts::the obstacle ray stores its wall as the contact: after a tick at the ledge the stored contact is the wall behind it, as FUN_0054e430 stores it (D:L416793) [drift: the port keeps the crate's face]":
    { row: 'movement.climb.obstacle-ray', why: 'TA.R6 drift; closes with C3\'s segment records (PAR-21, WALL_PROBE_READING)' },
  'tools/test/uiCommandTable.parity.test.ts::DRIFT: for every byte 0x80..0xFF, uiCommandFold adds 0x20 (mod 256) exactly where the pinned bit 0 is set, as the signed index does':
    { row: 'frontend.commands.lookup.fold-high', why: 'TA.R6 drift: the signed fold of the high bytes' },
  "packages/viewer/test/forge/tokens.test.ts::no colour literal in the three stylesheets, nor in the alias block itself":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::every --fx-* and --agent-* read is declared, and none hides behind a fallback":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::the one alias block: every colour, type role, radius, shadow and z-index of the forge is a token":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::one focus ring: the forge's one rule for keyboard and pad, and every outline anywhere is that ring, never \"none\"":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::one disabled look: opacity only 0, 1 or the system disabled token; no wait cursor":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::every z-index, radius and shadow is a named token":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::no text below 12 px; dim text (text-dim, \"not below 13px\", shared/ds/tokens.json) not below 13 px":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/viewer/test/forge/tokens.test.ts::a control's edge clears 3:1 on the surfaces behind it (VP-9)":
    { row: 'H453', why: 'FC2: his look\'s raw values against FUI.R4, the owner\'s question (tokens at his values, his rules exempted, or his look changed)' },
  "packages/match/test/roomEquipment.test.ts::GAP (LATER 1294): the forged throw from past a wall 5 ahead, its original expectation (HONEST RED under r0004's clearance until the capture's leg T rules on the toss window)":
    { row: 'LATER 1294', why: "the room's own throw aim is owed (B-06; the controller's option A, 2026-11-21): with no aim of its own the room tries every launch matching the velocity, past the clamp's bounds to the cone, so it cannot refuse what this asserts; the capture's legs T (no toss faces a wall at 10-10.5 u) and T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) bear on it" },
  "packages/match/test/roomEquipment.test.ts::GAP (LATER 1294): the request's body against the throw's, its ORIGINAL input -- a zero-velocity throw from the eye, the wall 8 ahead (HONEST RED under r0004's clearance until the capture's leg T rules on the toss window)":
    { row: 'LATER 1294', why: "the room's own throw aim is owed (B-06; the controller's option A, 2026-11-21): with no aim of its own the room tries every launch matching the velocity, past the clamp's bounds to the cone, so it cannot refuse what this asserts; the capture's legs T (no toss faces a wall at 10-10.5 u) and T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) bear on it" },
  "packages/match/test/roomEquipment.test.ts::GAP (LATER 1294): upright: the same throw is still refused as `hand walled` (the SVC-23b guard kept)":
    { row: 'LATER 1294', why: "the room's own throw aim is owed (B-06; the controller's option A, 2026-11-21): with no aim of its own the room tries every launch matching the velocity, past the clamp's bounds to the cone, so it cannot refuse what this asserts; the capture's legs T (no toss faces a wall at 10-10.5 u) and T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) bear on it" },
  "packages/match/test/roomEquipment.test.ts::GAP (LATER 1294): the review F1: just after the lean is let go (the camera’s peek still easing back) the walls are asked again":
    { row: 'LATER 1294', why: "the room's own throw aim is owed (B-06; the controller's option A, 2026-11-21): with no aim of its own the room tries every launch matching the velocity, past the clamp's bounds to the cone, so it cannot refuse what this asserts; the capture's legs T (no toss faces a wall at 10-10.5 u) and T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) bear on it" },
  "packages/match/test/roomEquipment.test.ts::GAP (LATER 1294): leaning, the wall 8 ahead and the throw from 4 ahead: REFUSED as `unclear` -- r0004 casts the lean (r0001 exempted it)":
    { row: 'LATER 1294', why: "the room's own throw aim is owed (B-06; the controller's option A, 2026-11-21): with no aim of its own the room tries every launch matching the velocity, past the clamp's bounds to the cone, so it cannot refuse what this asserts; the capture's legs T (no toss faces a wall at 10-10.5 u) and T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) bear on it" },
  "packages/viewer/test/forge/meshTools.test.ts::misses two points with no face in common, and passes over two already joined":
    { row: 'LATER 1370', why: "his own red at his import (0ed80a521b; the owner, 2026-11-22: 'Mark as known failures'); the Forge's owner (crispy, OT.R112) to fix; a LATER row number owed: asked of the merge seat 2026-11-22" },
  "packages/viewer/test/forge/meshTools.test.ts::cuts a zigzag with two places on each edge":
    { row: 'LATER 1370', why: "his own red at his import (0ed80a521b; the owner, 2026-11-22: 'Mark as known failures'); the Forge's owner (crispy, OT.R112) to fix; a LATER row number owed: asked of the merge seat 2026-11-22" },
  "packages/viewer/test/forge/meshTools.test.ts::bevels a grid edge that carries straight on: no flat triangle, the end points on the bevel":
    { row: 'LATER 1370', why: "his own red at his import (0ed80a521b; the owner, 2026-11-22: 'Mark as known failures'); the Forge's owner (crispy, OT.R112) to fix; a LATER row number owed: asked of the merge seat 2026-11-22" },
  "packages/viewer/test/forge/toolRules.test.ts::cuts straight across several faces between two edge points":
    { row: 'LATER 1370', why: "his own red at his import (0ed80a521b; the owner, 2026-11-22: 'Mark as known failures'); the Forge's owner (crispy, OT.R112) to fix; a LATER row number owed: asked of the merge seat 2026-11-22" },
  "packages/viewer/test/forge/geometry.test.ts::split an edge, cut a face, merge it back":
    { row: 'LATER 1370', why: "his own red at his import (0ed80a521b; the owner, 2026-11-22: 'Mark as known failures'); the Forge's owner (crispy, OT.R112) to fix; a LATER row number owed: asked of the merge seat 2026-11-22" },
  "packages/viewer/test/forge/blockShapes.test.ts::stairs climb the longer side from where the drag began, a step each STAIR_STEP_RISE_ADAPTATION of height":
    { row: 'LATER 1370', why: "his own red at his import (0ed80a521b; the owner, 2026-11-22: 'Mark as known failures'); the Forge's owner (crispy, OT.R112) to fix; a LATER row number owed: asked of the merge seat 2026-11-22" },
  "packages/viewer/test/inventoryMenu.test.ts::GAP (LATER 1345), the residue: %s Hz page, X held, a refused R1 at update N -- the round leaves at N+2 (the original's), every tap, every phase; flips with the original's pad write (FUN_0021aaa0) in fireCore.ts, v0.4.33":
    { row: 'LATER 1345', why: "the port's cleared fire lane reads up then down, so the firearm's pad re-enters at state 1 and the round leaves at N+3; the original's X goes 2 -> 1 -> 2 and fires at N+2 (PC 4's capture); waits for the pad write in fireCore.ts, v0.4.33 (research 451 s5)" },
  "packages/viewer/test/inventoryMenu.test.ts::GAP (LATER 1345), the span: %s Hz page -- per refused R1 the trigger reads not held for exactly ONE game update (the constant), let go across no second; flips with the original's pad write (FUN_0021aaa0) in fireCore.ts, v0.4.33":
    { row: 'LATER 1345', why: "the firearm reads not held for 2 or 3 game updates per refused R1 against the original's 1, and at 60 and 144 Hz the clear's span in seconds holds the trigger up across two steps in some phases; waits for the pad write in fireCore.ts, v0.4.33 (research 451 s5)" },
  "packages/viewer/test/inventoryMenu.test.ts::GAP (LATER 1345), 60 Hz, R1 tapped 10 a second with X held: every phase fires what X re-tapped at its best phase fires (the bad phase fires 0); flips with the original's pad write (FUN_0021aaa0) in fireCore.ts, v0.4.33":
    { row: 'LATER 1345', why: "at 60 Hz the clear's three page frames hold two game steps in the bad phases, so R1 tapped 10 a second fires [15, 0, 15, 0, 15, 1] rounds by phase against X re-tapped's 15; waits for the pad write in fireCore.ts, v0.4.33 (research 451 s5)" },
};

/** A parity registry id's shape (`area.x.y`). */
const REGISTRY_ID = /^[a-z]+(?:\.[a-z0-9-]+)+$/;
/** A task or a row: a sweep task, an owner row, a plan task, a LATER row, a sweep finding. */
const TASK = /^(?:P\d+|H\d+|PAR-\d+|LATER \d+|[A-Z]{2,3}-\d+)$/;

/** Every registry entry's tests, by id. */
function registry(): Map<string, { file: string; name: string }[]> {
  const out = new Map<string, { file: string; name: string }[]>();
  for (const f of readdirSync(REGISTRY).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(REGISTRY, f), 'utf8')) as { entries?: { id: string; tests?: { file: string; name: string }[] }[] };
    for (const e of j.entries ?? []) out.set(e.id, e.tests ?? []);
  }
  return out;
}

describe('P34 (H): every it.fails is registered with the row it waits on', () => {
  it('reads it.fails and test.fails calls, not comments or strings, a template title as written', () => {
    const text = [
      "// it.fails('in a comment', () => {});",
      "const s = \"it.fails('in a string', () => {});\";",
      "it.fails('one', () => {});",
      'for (const n of [1, 2]) test.fails(`two ${n}`, () => {});',
      "it('plain', () => {}); it.skip('skipped', () => {}); describe.skip('d', () => {}); it.skipIf(c)('not fails', () => {});",
      "it.fails.each([1, 2])('each %i', () => {});",
      "it.skipIf(noDisc).fails('skipIf', () => {});",
      "it.concurrent.fails('concurrent', () => {});",
      "test.runIf(x).concurrent.fails('runIf concurrent', () => {});",
      "describe.fails ? 0 : 1; other.fails('not a test', () => {});",
    ].join('\n');
    expect(failsTitles(text)).toEqual(['one', '`two ${n}`', 'each %i', 'skipIf', 'concurrent', 'runIf concurrent']);
  });

  const found = new Map<string, number>();
  for (const dir of [join(root, 'packages'), join(root, 'tools')]) {
    for (const f of tests(dir)) {
      const text = readFileSync(f, 'utf8');
      if (!text.includes('.fails')) continue;
      const rel = relative(root, f).replace(/\\/g, '/');
      for (const title of failsTitles(text)) found.set(`${rel}::${title}`, (found.get(`${rel}::${title}`) ?? 0) + 1);
    }
  }

  it('lists every it.fails in packages/ and tools/, and nothing that is gone', () => {
    const unlisted = [...found.keys()].filter((k) => !(k in REGISTER));
    expect(unlisted, 'an it.fails with no register line: add it with the row it waits on (or \'unrowed\')').toEqual([]);
    const gone = Object.keys(REGISTER).filter((k) => !found.has(k));
    expect(gone, 'a registered it.fails no longer found: an ordinary it now (its row closed?), or retitled').toEqual([]);
    expect([...found].filter(([, n]) => n > 1).map(([k]) => k), 'two it.fails with one title in one file').toEqual([]);
  });

  it('names a registry id that lists its test, a task, or unrowed', () => {
    const reg = registry();
    const bad: string[] = [];
    for (const [key, w] of Object.entries(REGISTER)) {
      const [file, name] = key.split('::') as [string, string];
      if (w.row === 'unrowed' || TASK.test(w.row)) continue;
      if (!REGISTRY_ID.test(w.row)) { bad.push(`${key}: '${w.row}' is no registry id, task or 'unrowed'`); continue; }
      if (!reg.get(w.row)?.some((t) => t.file === file && t.name === name)) bad.push(`${key}: ${w.row} does not list it`);
    }
    expect(bad).toEqual([]);
  });

  for (const [key, w] of Object.entries(REGISTER)) if (w.row === 'unrowed') it.todo(`unrowed: ${key} -- ${w.why}`);
});
