import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * P34 (A), the online-parity sweep's class A (2026-11-02): a stand-in literal in the room where the page reads a source.
 * The archetype is SW-1 -- the page walks a round through the disc's SOILS table, the room handed the same `roundPath`
 * `() => 0.5`. A product-track guard: it reads source text and changes nothing the game does.
 *
 * - (A1) A call in `packages/match/src/room.ts` to a function it imports by value from the shared boundary
 *   (`@s2u/scene`, or any `viewer/src` module: `./sim`, `./net/*`, ...) that hands a literal -- a number, `true`/`false`,
 *   a string, through `as` and parentheses -- or an arrow whose body is one, at an argument position where the page
 *   (`packages/viewer/src`) calls the same function and never hands that same literal there: the page passes a reader,
 *   the room a constant.
 * - (A2) A room statement whose own comments name a `*_READING`, `*_PLACEHOLDER` or `*_ADAPTATION` the viewer or the
 *   scene exports with a literal value, which room.ts does not import, and which re-types that value as a call
 *   argument or an object property's value: the named constant restated (AR-6's `coneStance: 'stand'`).
 *
 * "The page" is `packages/viewer/src` outside `net/`: the net modules are the rules the room and the page both run
 * (`net/startLine.ts`'s `headEye` call is the room's own start line), so a call there is no page's choice.
 *
 * Both read the TypeScript syntax tree (`ts.createSourceFile`, no program), so a comment or a string cannot fake a
 * call. What today's tree holds is `KNOWN`, each with the sweep's task that retires it (P1..P33, or S5 -- the sweep's
 * section 5 docs task, "ledger rows for departures stated as fact"); a found case not listed fails, and so does a listed
 * one no longer found (the retiring task removes its line). A row kept at `count: 0` is the other case: the detector
 * has gone blind on the page side (the page no longer passes the argument it compared against), while the room still
 * hands the literal, so the departure stays owed to its task -- the row is not deleted, and a page call that returns
 * raises its count again.
 */

const root = resolve(import.meta.dirname, '../..');
const ROOM = join(root, 'packages', 'match', 'src', 'room.ts');
const PAGE_DIR = join(root, 'packages', 'viewer', 'src');
const SCENE_DIR = join(root, 'packages', 'scene', 'src');
/** The rules both sides run (`viewer/src/net`): not the page's own calls. */
const NET_DIR = join(PAGE_DIR, 'net') + sep;
const NAMED = /\b[A-Z][A-Z0-9_]*_(?:READING|PLACEHOLDER|ADAPTATION)\b/g;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'node_modules') out.push(...sources(path)); }
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(path);
  }
  return out;
}

function parse(text: string, file = 'x.ts'): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function unwrap(n: ts.Node): ts.Node {
  let e = n;
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/** A literal's canonical text (`0.50` and `.5` alike `0.5`; a string quoted), or null when the node is none. */
export function literalOf(n: ts.Node): string | null {
  const e = unwrap(n);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return String(-Number(e.operand.text));
  if (ts.isNumericLiteral(e)) return String(Number(e.text));
  if (e.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (e.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return JSON.stringify(e.text);
  return null;
}

/** An argument's shape when it is a literal or an arrow returning one (`() => 0.5`); null for anything that reads. */
export function constantShape(n: ts.Node): string | null {
  const lit = literalOf(n);
  if (lit !== null) return lit;
  const e = unwrap(n);
  if (ts.isArrowFunction(e) && !ts.isBlock(e.body)) {
    const body = literalOf(e.body);
    if (body !== null) return `() => ${body}`;
  }
  return null;
}

/** The names a module imports by value from the shared boundary: `@s2u/scene`, or a path through `viewer/src`. */
export function sharedImports(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.importClause?.isTypeOnly || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/^@s2u\/scene$|viewer\/src/.test(st.moduleSpecifier.text)) continue;
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const e of named.elements) if (!e.isTypeOnly) out.add(e.name.text);
  }
  return out;
}

/** Every name a module imports, by value or type. */
function importedNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const e of named.elements) out.add(e.name.text);
  }
  return out;
}

interface Call { fn: string; args: readonly ts.Expression[]; sf: ts.SourceFile }

/** The calls (and `new`s) of a plain identifier among `names`. */
function callsOf(sf: ts.SourceFile, names: ReadonlySet<string>): Call[] {
  const out: Call[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && ts.isIdentifier(n.expression) && names.has(n.expression.text)) {
      out.push({ fn: n.expression.text, args: n.arguments ?? [], sf });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const lineOf = (sf: ts.SourceFile, n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** A finding: its key (what the allow-list names) and where it is. */
export interface Finding { key: string; at: string }

/**
 * (A1) The room's literal arguments to shared functions where the page hands that position something else and never the
 * same literal. `pages`: the page's sources, text by file.
 */
export function literalArgs(room: string, pages: ReadonlyMap<string, string>): Finding[] {
  const sf = parse(room, 'room.ts');
  const constants: { fn: string; i: number; shape: string; line: number }[] = [];
  for (const c of callsOf(sf, sharedImports(sf))) {
    c.args.forEach((a, i) => {
      const shape = constantShape(a);
      if (shape !== null) constants.push({ fn: c.fn, i, shape, line: lineOf(sf, a) });
    });
  }
  const wanted = new Set(constants.map((c) => c.fn));
  const page = new Map<string, Set<string>>();   // `fn#i` -> the shapes the page hands there (a reader's own text)
  for (const [file, text] of pages) {
    if (![...wanted].some((fn) => text.includes(`${fn}(`))) continue;
    const psf = parse(text, file);
    for (const c of callsOf(psf, wanted)) {
      c.args.forEach((a, i) => {
        const key = `${c.fn}#${i}`;
        if (!page.has(key)) page.set(key, new Set());
        page.get(key)!.add(constantShape(a) ?? `reader:${a.getText(psf)}`);
      });
    }
  }
  return constants
    .filter((c) => { const seen = page.get(`${c.fn}#${c.i}`); return seen !== undefined && !seen.has(c.shape); })
    .map((c) => ({ key: `${c.fn}#${c.i} ${c.shape}`, at: `room.ts:${c.line}` }));
}

/** The `*_READING`/`*_PLACEHOLDER`/`*_ADAPTATION` constants a source exports with a literal value, by name. */
export function namedLiterals(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const sf = parse(text);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer || !/_(?:READING|PLACEHOLDER|ADAPTATION)$/.test(d.name.text)) continue;
      const lit = literalOf(d.initializer);
      if (lit !== null) out.set(d.name.text, lit);
    }
  }
  return out;
}

/**
 * (A2) The room's statements that name an exported named constant room.ts does not import and re-type its literal as an
 * argument or a property's value. Only the statement's own text counts: a nested block (an arrow's or a method's body)
 * is its own statements'.
 */
export function restatedConstants(room: string, named: ReadonlyMap<string, string>): Finding[] {
  const sf = parse(room, 'room.ts');
  const imported = importedNames(sf);
  const out: Finding[] = [];
  const seen = new Set<number>();
  const visit = (n: ts.Node): void => {
    if (ts.isExpressionStatement(n) || ts.isVariableStatement(n) || ts.isReturnStatement(n)) {
      // The statement's leading comments and its own text, its nested blocks blanked out.
      let own = room.slice(n.getFullStart(), n.getEnd());
      const blocks: ts.Block[] = [];
      const findBlocks = (m: ts.Node): void => { if (ts.isBlock(m)) blocks.push(m); else ts.forEachChild(m, findBlocks); };
      ts.forEachChild(n, findBlocks);
      for (const b of blocks.sort((x, y) => y.getStart(sf) - x.getStart(sf))) {
        const a = b.getStart(sf) - n.getFullStart(), z = b.getEnd() - n.getFullStart();
        own = own.slice(0, a) + ' '.repeat(z - a) + own.slice(z);
      }
      const comments = (own.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join(' ');
      for (const name of new Set(comments.match(NAMED) ?? [])) {
        const want = named.get(name);
        if (want === undefined || imported.has(name)) continue;
        const look = (m: ts.Node): void => {
          if (ts.isBlock(m)) return;
          const at = ts.isCallExpression(m) || ts.isNewExpression(m) ? [...(m.arguments ?? [])]
            : ts.isPropertyAssignment(m) ? [m.initializer] : [];
          for (const a of at) {
            if (literalOf(a) === want && !seen.has(a.getStart(sf))) {
              seen.add(a.getStart(sf));
              out.push({ key: `${name}=${want}`, at: `room.ts:${lineOf(sf, a)}` });
            }
          }
          ts.forEachChild(m, look);
        };
        ts.forEachChild(n, look);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** A case today's tree holds: how many times, the task that retires it, and why it stands until then. */
interface Known { count: number; task: string | null; why: string }

/**
 * Today's cases (main `e181bf6c3`, 2026-11-02). `task`: the sweep's task that retires the line (P1..P33), S5 for its
 * section 5 docs task (a departure stated in prose with no named constant), null for a case read as equal (the `why`
 * says how) -- never a guard loosened.
 */
const KNOWN: Record<string, Known> = {
  // A1
  'throwAnim#0 0': { count: 1, task: 'P22', why: 'TB-9: the room\'s release check samples the throw\'s power from 0 (no power on the wire)' },
  'throwVelocity#0 0': { count: 1, task: 'P22', why: 'TB-9: as throwAnim -- the release power the page holds, 0 in the room' },
  'maxThrowDistance#0 "stand"': { count: 1, task: 'P22', why: 'TB-9: throwLaunchAllowed bounds over both stances in place of the page\'s one' },
  'maxThrowDistance#0 "crouch"': { count: 2, task: 'P22', why: 'TB-9: as above' },
  'headEye#3 () => true': {
    count: 0, task: 'S5',
    why: 'new (P34): the room\'s start heads take every polygon, the page\'s camera isCameraSurface -- said in cameraRig.ts headEye\'s doc, no named constant or ledger row. '
      + 'Found 0 since WALL-CAM (research 382 §1): playerCamera\'s draw() replaced its two headEye(.., accept) calls, so the page hands position 3 nothing to compare; the departure stands (S5)',
  },
  'canMount#3 false': { count: 1, task: null, why: 'equal: the room refuses an occupied turret as \'occupied\' before it asks canMount' },
};

function tally(found: readonly Finding[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of found) { if (!out.has(f.key)) out.set(f.key, []); out.get(f.key)!.push(f.at); }
  return out;
}

describe('P34 (A): the room hands a shared sim function no stand-in literal where the page passes a reader', () => {
  it('reads a literal and an arrow returning one, through as and parentheses, and nothing that reads', () => {
    const sf = parse('f(0.50, -1, true, "a", `b`, () => .5, (x) => x, () => K, K, (1 as number), () => { return 1; });');
    const call = sf.statements[0]! as ts.ExpressionStatement;
    const args = (call.expression as ts.CallExpression).arguments.map(constantShape);
    expect(args).toEqual(['0.5', '-1', 'true', '"a"', '"b"', '() => 0.5', null, null, null, '1', null]);
  });

  it('flags a literal only where the page hands the position something else and never the same literal', () => {
    const room = [
      "import { roundPath, headEye, only, both } from '../../viewer/src/sim';",
      "import { local } from './mine';",
      'roundPath(g, a, () => 0.5);', 'headEye(g, f, () => true);', 'only(1);', 'both(1);', 'local(2);', 'roundPath(g, a, pen);',
    ].join('\n');
    const pages = new Map([
      ['fire.ts', 'roundPath(g, a, this.penetrationOf); headEye(g, f); both(1); both(n); local(x);'],
    ]);
    // headEye's third is omitted by the page (its default): no position to compare; `only` the page never calls;
    // `both` the page hands the same 1 somewhere; `local` is no shared import.
    expect(literalArgs(room, pages)).toEqual([{ key: 'roundPath#2 () => 0.5', at: 'room.ts:3' }]);
  });

  it('flags a named constant re-typed as a literal in its own statement, not one imported or in a nested block', () => {
    const named = namedLiterals("export const STANCE_READING: S = 'stand';\nexport const OTHER_READING = 3;\nconst LOCAL_READING = 4;");
    expect([...named]).toEqual([['STANCE_READING', '"stand"'], ['OTHER_READING', '3']]);
    const room = [
      "import { OTHER_READING } from '../../viewer/src/x';",
      '// STANCE_READING\'s stand, as the page runs it', "cone.tick(cmd, { stance: 'stand' as const });",
      '// OTHER_READING (imported: its own name could be used)', 'f(3);',
      '// STANCE_READING', 'list.forEach((x) => {', "  g('stand');", '});',
      "h('stand');",
    ].join('\n');
    expect(restatedConstants(room, named)).toEqual([{ key: 'STANCE_READING="stand"', at: 'room.ts:3' }]);
  });

  it('holds only the known cases in room.ts, each with the task that retires it', () => {
    const room = readFileSync(ROOM, 'utf8');
    const pages = new Map(sources(PAGE_DIR).filter((f) => !f.startsWith(NET_DIR)).map((f) => [relative(root, f), readFileSync(f, 'utf8')] as const));
    const named = new Map<string, string>();
    for (const f of [...sources(PAGE_DIR), ...sources(SCENE_DIR)]) for (const [k, v] of namedLiterals(readFileSync(f, 'utf8'))) named.set(k, v);
    const found = tally([...literalArgs(room, pages), ...restatedConstants(room, named)]);
    const unlisted = [...found].filter(([k]) => !(k in KNOWN)).map(([k, at]) => `${k} (${at.join(', ')})`);
    expect(unlisted, 'a literal where the page passes a reader: hand the room the page\'s source, or name it and list it in KNOWN').toEqual([]);
    const moved = Object.entries(KNOWN).filter(([k, v]) => (found.get(k)?.length ?? 0) !== v.count)
      .map(([k, v]) => `${k}: listed ${v.count}, found ${found.get(k)?.length ?? 0}${v.task ? ` -- ${v.task} retires it` : ''}`);
    expect(moved, 'a KNOWN case changed: a fixed one leaves the list, a new one at the same key raises its count').toEqual([]);
    for (const v of Object.values(KNOWN)) expect(v.task === null || /^(?:P(?:[1-9]|[12]\d|3[0-3])|S5)$/.test(v.task)).toBe(true);
  });
});
