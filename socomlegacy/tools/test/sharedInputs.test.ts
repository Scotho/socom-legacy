import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * P34 (D), the online-parity sweep's class C guard (2026-11-02): the shared-function trap. A sim function the page's
 * path and the room both call -- the test room's Play mode runs the room's own `Room` in the page, so "offline vs
 * online" is the page's inputs against the room's -- is handed the same KIND of input at both call sites. Each row
 * below names the two sites (a file, the function or method that holds the call, the call and its argument), reads
 * each argument from the TypeScript syntax tree (a local `const` it names resolved in its own function), and sorts it
 * into a kind by the row's own classifier; the two kinds must agree. A product-track guard, in the project's
 * source-pin style: it reads text and changes nothing the game does.
 *
 * A row the two sites disagree on today carries `known`: the sweep's task that retires it (P1..P33). It fails both
 * ways -- a disagreement with no `known`, and a `known` whose sites now agree (the retiring task removes it). A site
 * that is no longer found fails too: the row is stale and is re-pointed, never dropped silently.
 */

const root = resolve(import.meta.dirname, '../..');
const MATCH = join(root, 'packages', 'match', 'src');
const VIEWER = join(root, 'packages', 'viewer', 'src');

const parsed = new Map<string, ts.SourceFile>();
function source(path: string): ts.SourceFile {
  let sf = parsed.get(path);
  if (!sf) { sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true); parsed.set(path, sf); }
  return sf;
}

type Fn = ts.FunctionLikeDeclaration;
const isFn = (n: ts.Node): n is Fn => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n)
  || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n);

/** The named function or method `name` in the file (the first); throws when none -- the row is stale. */
function fnNamed(sf: ts.SourceFile, name: string): Fn {
  let found: Fn | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name && n.name.getText(sf) === name) { found = n; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error(`${sf.fileName}: no function ${name}`);
  return found;
}

/** The calls in `scope` whose callee is `name` -- a bare name or the last member of a property access. */
function callsIn(scope: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if ((ts.isIdentifier(e) && e.text === name) || (ts.isPropertyAccessExpression(e) && e.name.text === name)) out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return out;
}

/** The nearest enclosing function's `const <name> = <init>` before the use (out through nested arrows); null when none. */
function localInit(id: ts.Identifier): ts.Expression | null {
  for (let fn: ts.Node | undefined = id.parent; fn; fn = fn.parent) {
    if (!isFn(fn)) continue;
    let init: ts.Expression | null = null;
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === id.text && n.initializer && n.getStart() < id.getStart()) init = n.initializer;
      ts.forEachChild(n, visit);
    };
    visit(fn);
    if (init) return init;
  }
  return null;
}

/** An argument's text, through one local `const` it names (`penetration` -> its arrow). */
function argText(call: ts.CallExpression, i: number): string | null {
  const a = call.arguments[i];
  if (!a) return null;
  const sf = call.getSourceFile();
  if (ts.isIdentifier(a)) { const init = localInit(a); if (init) return init.getText(sf); }
  return a.getText(sf);
}

/** One site: the file, the function that holds the call, and what of it the row classifies. */
interface Site { file: string; in: string; read(fn: Fn): string | null; label: string }

/** A row: what is handed, its two sites, the classifier, and today's known disagreement. */
interface Row { what: string; page: Site; room: Site; kind(text: string | null): string; known?: { task: string; why: string } }

/** A site reading call `name`'s argument `i` (the first such call in the function). */
const arg = (file: string, inFn: string, name: string, i: number): Site => ({
  file, in: inFn, label: `${name} arg ${i}`,
  read: (fn) => {
    const call = callsIn(fn, name)[0];
    if (!call) throw new Error(`${file} ${inFn}: no call ${name}`);
    return argText(call, i);
  },
});
/** A site reading the whole function's text (a rule the function applies, not one argument). */
const body = (file: string, inFn: string): Site => ({ file, in: inFn, label: 'its body', read: (fn) => fn.getText() });
/** A site reading an object property's value inside the first call `name` in the function that holds one (`{ coneStance: ... }`). */
const prop = (file: string, inFn: string, name: string, key: string): Site => ({
  file, in: inFn, label: `${name}({ ${key}: ... })`,
  read: (fn) => {
    for (const call of callsIn(fn, name)) {
      let v: string | null = null;
      const visit = (n: ts.Node): void => {
        if (v === null && ts.isPropertyAssignment(n) && n.name.getText() === key) v = n.initializer.getText();
        ts.forEachChild(n, visit);
      };
      visit(call);
      if (v !== null) return v;
    }
    throw new Error(`${file} ${inFn}: no ${name} call with a property ${key}`);
  },
});

const isLiteral = (t: string): boolean => /^(?:\(\)\s*=>\s*)?(?:-?[\d.]+|true|false|'[^']*'|"[^"]*")(?:\s+as\s+const)?$/.test(t.trim());

const ROOM = join(MATCH, 'room.ts');
const ROWS: Row[] = [
  {
    what: 'roundPath: each surface\'s PENETRATION (the page\'s `Fire.penetrationOf` is set by `setMaterials`)',
    page: arg(join(VIEWER, 'matchFirearm.ts'), 'mountFirearm', 'setMaterials', 0),
    room: arg(ROOM, 'fireAt', 'roundPath', 4),
    kind: (t) => (t === null ? 'none' : /surfaceMaterial|SOIL_MATERIAL|SOIL_TABLE|materialTable/.test(t) ? 'the SOILS table by the byte'
      : isLiteral(t) ? 'a literal' : `other: ${t}`),
  },
  {
    what: 'blastLine: each surface\'s PENETRATION on a blast\'s line to a scene object',
    page: arg(join(VIEWER, 'grenade.ts'), 'explode', 'blastLine', 5),
    room: arg(ROOM, 'sceneBlast', 'blastLine', 5),
    kind: (t) => (t === null ? 'none' : /surfaceMaterial|SOIL_MATERIAL|SOIL_TABLE|materialTable/.test(t) ? 'the SOILS table by the byte'
      : isLiteral(t) ? 'a literal' : `other: ${t}`),
  },
  {
    what: 'the flashbang\'s white-out: the line of sight its level is gated by (`blastSeen`, FUN_005a0e70)',
    page: body(join(VIEWER, 'grenade.ts'), 'explode'),
    room: body(ROOM, 'blastPlayers'),
    kind: (t) => (t !== null && /\bblast(?:Seen|Exposed)\(|\.flash\b[^\n]*\bblast\b/.test(t) ? 'gated by the line of sight' : 'ungated'),
    known: { task: 'P2', why: 'TB-1: the page\'s explode whites out by flashLevel with no line test; the room\'s blast carries no flash' },
  },
  {
    what: 'the mounted gun\'s rate: the fire gate\'s cycle (`./net/fireGate`), as the page\'s hand',
    page: body(join(VIEWER, 'fire.ts'), 'pullRound'),
    room: body(ROOM, 'turretRound'),
    kind: (t) => (t !== null && /\b(?:gapOpen|fireCycleTicks|fastestWait|scheduleOpen|fireScheduleTicks)\(/.test(t) ? 'the fire gate'
      : t !== null && /TICK_HZ\s*-\s*1/.test(t) ? 'a private copy' : 'none'),
  },
  {
    what: 'a launched round\'s rate: the fire gate\'s cycle, as the page\'s hand',
    page: body(join(VIEWER, 'fire.ts'), 'pullRound'),
    room: body(ROOM, 'launchRound'),
    kind: (t) => (t !== null && /\b(?:gapOpen|fireCycleTicks|fastestWait|scheduleOpen|fireScheduleTicks)\(/.test(t) ? 'the fire gate'
      : t !== null && /TICK_HZ\s*-\s*1/.test(t) ? 'a private copy' : 'none'),
  },
  {
    what: 'a launched round judged on the body at the command it names (LATER 501), as the rocket is',
    page: body(ROOM, 'launchRocket'),
    room: body(ROOM, 'launchRound'),
    kind: (t) => (t !== null && /\bcone\.frame\(ev\.seq\)/.test(t) ? 'the command\'s frame' : 'the arrival\'s body'),
  },
  {
    what: 'the round-end primary objective: the rule is handed the game type (FUN_00224d10 has an ESCORT arm, D:L76560-76570)',
    page: { file: join(MATCH, 'extraction.ts'), in: 'of', label: 'the authority, built per mode (ESCORT included)', read: (fn) => fn.getText() },
    room: arg(ROOM, 'endRound', 'hostagePrimaryObjectives', 0),
    kind: (t) => (t !== null && /escort|gameType|mode/i.test(t) ? 'the game type' : 'no game type'),
    known: { task: 'P5', why: 'BO-4: ESCORT rounds take EXTRACTION\'s primary-objective arm (hostagePrimaryObjectives has no mode)' },
  },
  {
    what: 'the mounted gun\'s cone stance row (TURRET_RETICLE_STANCE_READING)',
    page: prop(join(VIEWER, 'matchFirearm.ts'), 'mountFirearm', 'update', 'stance'),
    room: prop(ROOM, 'aim', 'tick', 'coneStance'),
    kind: (t) => (t === null ? 'none' : /TURRET_RETICLE_STANCE_READING/.test(t) ? 'the named reading' : isLiteral(t) ? 'a literal' : `other: ${t}`),
  },
  {
    what: 'claymoreCone: the point the cone is tested at, the victim\'s feet (research 179 s8.11)',
    page: arg(join(VIEWER, 'grenade.ts'), 'damageAt', 'claymoreCone', 0),
    room: arg(ROOM, 'blastPlayers', 'claymoreCone', 0),
    kind: (t) => (t === null ? 'none' : /\+\s*10\b/.test(t) ? 'the feet + 10' : /feet/.test(t) ? 'the feet' : `other: ${t}`),
    known: { task: 'P19', why: 'TB-4: the page\'s damageAt tests the cone at the feet + 10' },
  },
  {
    what: 'claymoreCone: the radius (the record\'s ExplosionRadius, not the baked default)',
    page: arg(join(VIEWER, 'grenade.ts'), 'damageAt', 'claymoreCone', 2),
    room: arg(ROOM, 'blastPlayers', 'claymoreCone', 2),
    kind: (t) => (t === null ? 'the baked default' : /explosionRadius/.test(t) ? 'the record\'s radius' : `other: ${t}`),
    known: { task: 'P19', why: 'TB-4: the page\'s damageAt passes no radius (the baked 250)' },
  },
];

/** A row's two kinds, each site read in its function. */
function kinds(row: Row): { page: string; room: string } {
  const read = (s: Site): string => row.kind(s.read(fnNamed(source(s.file), s.in)));
  return { page: read(row.page), room: read(row.room) };
}

describe('P34 (D): a shared sim function is handed the same kind of input by the page and by the room', () => {
  it('reads an argument through a local const, a property, and a stale row as an error', () => {
    const sf = ts.createSourceFile('x.ts', [
      'function room() { const pen = (m) => surfaceMaterial(m).penetration; roundPath(g, a, d, r, pen); at((x) => line(x, pen)); }',
      'function page() { roundPath(g, a, d, r, () => 0.5); cone.tick({ coneStance: \'stand\' as const }); }',
    ].join('\n'), ts.ScriptTarget.Latest, true);
    expect(argText(callsIn(fnNamed(sf, 'room'), 'roundPath')[0]!, 4)).toBe('(m) => surfaceMaterial(m).penetration');
    expect(argText(callsIn(fnNamed(sf, 'room'), 'line')[0]!, 1)).toBe('(m) => surfaceMaterial(m).penetration');   // out through an arrow
    expect(argText(callsIn(fnNamed(sf, 'page'), 'roundPath')[0]!, 4)).toBe('() => 0.5');
    expect(argText(callsIn(fnNamed(sf, 'page'), 'tick')[0]!, 3)).toBeNull();
    expect(isLiteral('() => 0.5') && isLiteral('\'stand\' as const') && !isLiteral('pen')).toBe(true);
    expect(() => fnNamed(sf, 'gone')).toThrow(/no function gone/);
  });

  for (const row of ROWS) {
    it(`${row.what}${row.known ? ` -- known: ${row.known.task}` : ''}`, () => {
      const k = kinds(row);
      if (row.known) {
        expect(k.page, `${row.known.task} has made the two sites agree: take its known off the row (${row.known.why})`).not.toBe(k.room);
      } else {
        expect(k.room, `the room's ${row.room.in} (${row.room.label}) against the page's ${row.page.in} (${row.page.label})`).toBe(k.page);
      }
    });
  }

  it('names a sweep task for every known disagreement', () => {
    for (const r of ROWS) if (r.known) expect(r.known.task).toMatch(/^P(?:[1-9]|[12]\d|3[0-3])$/);
  });
});
