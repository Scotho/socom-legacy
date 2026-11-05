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
  'tools/test/harnessTrace.test.ts::GAP (LATER 680): the Frostfire box scenario walked from x 938 reaches the climb':
    { row: 'LATER 680', why: 'SEGMENT-BODY: walked -z from x 938 the side line meets prop01, no contact is stored, no climb offered; unsettled at the source, an r0004 capture of the walk owed (research 86 s3.8)' },
  'packages/viewer/test/weaponLine.test.ts::GAP (LATER 681): (iii) the closest approach walking in square: 5.24-5.50 (the capture 5.34-5.40)':
    { row: 'LATER 681', why: 'SEGMENT-BODY: walked in square on M51 g19733 the segment body stops a whole step short, 5.66 from the plane; the original closes to 5.34-5.40 (r0004 climb-angle ca-0)' },
  'packages/viewer/test/m51DitchBlock.disc.test.ts::GAP (LATER 690): from the capture start, the running jump lands back in the ditch, apex 13.17 +- 0.5':
    { row: 'LATER 690', why: 'SEGMENT-BODY: on 25 of the 70 push ticks the move meets no segment, so the take-off carries 65 -x over the ditch log and lands at x 932, where r0004 (ac ditch capture) stalls with the contact set and lands back at x 984; the causes (DITCH-ESCAPE-READ): the 60 Hz wall step (H404) and the take-off carry, zeroed on a jam where the original keeps +0x38 (from +0x64, writer unread); the follow-up branch for the next release steps the walls at 30 Hz per the owner H404 (b) ruling, plus the carry' },
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
  'packages/viewer/test/parity/movement.test.ts::`refuses jump at speed ${speed} with a solid hit in the posed-head ray`':
    { row: 'PAR-21', why: 'research 230 D13 (movement-01, -02): the jump\'s posed-head ray' },
  "packages/viewer/test/traversal.parity.test.ts::drift: the hang's pull-up stand-in rises 22.59 and goes 5.24 ahead, as the table has seal_hang2climbup":
    { row: 'movement.traversal.fallback-shapes', why: 'TA.R6 drift: the FALLBACK shape before the pack arrives' },
  'packages/viewer/test/traversal.parity.test.ts::drift: TRAVERSAL_CLIP.rleanStep (seal_rlean_rstep) is a clip in MOTION_P.ZAR':
    { row: 'movement.traversal.clip-names', why: 'TA.R6 drift: a clip name MOTION_P.ZAR does not hold' },
  "packages/viewer/test/traversal.test.ts::the obstacle ray stores its wall as the contact: after a tick at the ledge the stored contact is the wall behind it, as FUN_0054e430 stores it (D:L416793) [drift: the port keeps the crate's face]":
    { row: 'movement.climb.obstacle-ray', why: 'TA.R6 drift; closes with C3\'s segment records (PAR-21, WALL_PROBE_READING)' },
  'tools/test/uiCommandTable.parity.test.ts::DRIFT: for every byte 0x80..0xFF, uiCommandFold adds 0x20 (mod 256) exactly where the pinned bit 0 is set, as the signed index does':
    { row: 'frontend.commands.lookup.fold-high', why: 'TA.R6 drift: the signed fold of the high bytes' },
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
