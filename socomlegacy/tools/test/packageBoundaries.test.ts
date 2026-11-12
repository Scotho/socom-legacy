import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The front end's package boundaries (web sprint 6, ruling W6.R2; PLAT-02; the spec
 * `docs/specs/2026-10-01-web-sprint-6-package-boundaries.md`). Both rules read the TypeScript syntax tree
 * (`ts.createSourceFile`, one file at a time, no program), so a comment, a string, a template literal's text or a
 * regex literal can neither hide a breach nor fake one.
 *
 * - (a) No package below the viewer imports from it: every `.ts`/`.mts`/`.cts`/`.tsx` under `packages/<p>/src` for
 *   the pure packages (archive, gs, mesh, scene, sound and the three new ones, ui, fmv and card) names no module that
 *   reaches `packages/viewer` -- `@s2u/viewer[/...]`, the workspace's deep path `@s2u/socomlegacy/packages/viewer/...`,
 *   or a relative path -- by `import`/`export ... from`, a bare `import`, `import(...)` (a template literal too),
 *   `require(...)`, `import x = require(...)` or an `import('...')` type.
 * - (b) The three new packages are DOM-free and renderer-free: no import of `three`, and no browser global (`BROWSER`
 *   below) reached as a value -- by name, by `typeof` in an expression, through `globalThis`, `self` or `window`
 *   (`.x` or `['x']`, wrappers such as `(globalThis as any)` unwrapped), or by destructuring them; nor the global
 *   object itself held or passed (`const g = globalThis`). An ambient `declare` shadows nothing.
 *   DOM *types* are allowed (the controller's ruling of the fix round): a backend typed `IDBFactory` that takes the
 *   factory as a parameter is how a browser API enters through an interface the package declares and the viewer fills.
 *   A member, a property key, a parameter or binding of the name, and a local that shadows it are not the global.
 *
 * - (c) No package imports from `tools/` (ruling R7, 2026-10-01): every source under `packages/<p>/src` (every package) names no module
 *   that reaches the repository's `tools/` directory -- `@s2u/tools[/...]`, the deep path `@s2u/socomlegacy/tools/...` or
 *   a relative path -- so a dev instrument there (the card file reader `tools/cardFile.ts`, which knows the card's byte
 *   formats the port must not ship) cannot leak back into what ships.
 *
 * The helpers are proved on inline samples here; nothing is planted in the tree.
 */

const root = resolve(import.meta.dirname, '../..');
const PACKAGES_DIR = join(root, 'packages');
const VIEWER_DIR = join(PACKAGES_DIR, 'viewer');
const TOOLS_DIR = join(root, 'tools');
/** The packages that may never import from the viewer. */
export const PURE = ['archive', 'gs', 'mesh', 'scene', 'sound', 'ui', 'fmv', 'card'] as const;
/** The packages W6.R2 made, held to the DOM-free rule as well. */
export const NEW = ['ui', 'fmv', 'card'] as const;
/**
 * The browser globals a new package may not reach as a value: the first round's seven, and (PLAT-02's last round) the
 * ones the coming tasks would reach for -- the frame loop (PLAT-12), input and events (PLAT-11), the compositor's
 * canvases (PLAT-14), the movie player's worker (PLAT-19b/21), storage (PLAT-24/25). Left out on purpose, because
 * Node 22+ has them too and the rule is DOM/browser values, not every global: `fetch`, `performance`, `WebSocket`.
 */
export const BROWSER = new Set([
  'document', 'window', 'indexedDB', 'localStorage', 'sessionStorage', 'AudioContext', 'navigator',
  'requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener', 'location', 'history',
  'Image', 'OffscreenCanvas', 'HTMLCanvasElement', 'Worker', 'XMLHttpRequest', 'caches', 'matchMedia', 'alert',
]);
/** The global objects a browser global hangs off. */
const HOSTS = new Set(['globalThis', 'self', 'window']);

/** A file rules (a) and (b) read: TypeScript in any of its module flavours. */
export function isSource(name: string): boolean {
  return /\.(?:ts|mts|cts|tsx)$/.test(name);
}

function parse(source: string, fileName: string): ts.SourceFile {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
}

/** A string literal or a template literal's text: whole when it has no `${}`, else its head (the prefix it fixes). */
function literalText(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  return null;
}

/**
 * Every module specifier a source names: `import`/`export ... from`, a bare `import '...'`, `import(...)` (a string
 * or a template literal), `require(...)`, `import x = require(...)` and an `import('...')` type.
 */
export function specifiers(source: string, fileName = 'x.ts'): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    let spec: string | null = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      spec = literalText(node.moduleSpecifier);
    } else if (ts.isExternalModuleReference(node)) {
      spec = literalText(node.expression);
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      spec = literalText(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      spec = literalText(node.argument.literal);
    }
    if (spec !== null) out.push(spec);
    ts.forEachChild(node, visit);
  };
  visit(parse(source, fileName));
  return out;
}

/**
 * Whether a specifier written in `file` reaches the viewer: `@s2u/viewer[/...]`, or the workspace's deep path
 * `@s2u/socomlegacy/<path>` or a relative path that resolves into `packages/viewer`.
 */
export function reachesViewer(spec: string, file: string, viewerDir: string = VIEWER_DIR): boolean {
  if (spec === '@s2u/viewer' || spec.startsWith('@s2u/viewer/')) return true;
  let target: string;
  if (spec.startsWith('@s2u/socomlegacy/')) target = resolve(root, spec.slice('@s2u/socomlegacy/'.length));
  else if (spec.startsWith('.')) target = resolve(dirname(file), spec);
  else return false;
  return target === viewerDir || target.startsWith(viewerDir + sep);
}

/**
 * Whether a specifier written in `file` reaches `tools/` (rule (c)): `@s2u/tools[/...]`, or the workspace's deep path
 * `@s2u/socomlegacy/<path>`, a relative path or an absolute one that resolves into `tools/` or through the
 * `node_modules/@s2u/tools` link to it. Compared without case, since Windows resolves `../Tools` to `tools/` (the
 * review's F3).
 */
export function reachesTools(spec: string, file: string, toolsDir: string = TOOLS_DIR): boolean {
  const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase();
  const s = norm(spec);
  if (s === '@s2u/tools' || s.startsWith('@s2u/tools/')) return true;
  let target: string;
  if (s.startsWith('@s2u/socomlegacy/')) target = resolve(root, spec.slice('@s2u/socomlegacy/'.length));
  else if (spec.startsWith('.')) target = resolve(dirname(file), spec);
  else if (isAbsolute(spec) || /^[a-z]:\//.test(s)) target = resolve(spec);
  else return false;
  const t = norm(target), tools = norm(toolsDir);
  return t === tools || t.startsWith(`${tools}/`) || /\/node_modules\/@s2u\/tools(\/|$)/.test(t);
}

/** The names a binding (an identifier or a destructuring pattern) declares. */
function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((e) => (ts.isBindingElement(e) ? bindingNames(e.name) : []));
}

/** Whether a statement carries `declare`: an ambient declaration, which at run time is the global, not a local. */
function ambient(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
}

/**
 * The names a scope node declares directly: parameters, variables, functions, classes, enums, imports, catch. An
 * ambient statement (`declare const indexedDB: IDBFactory`) and the body of an ambient module (`declare global {}`)
 * declare no local (PLAT-02's last round).
 */
function declaredIn(scope: ts.Node): string[] {
  const out: string[] = [];
  if (ts.isModuleBlock(scope) && ambient(scope.parent)) return out;
  if (ts.isFunctionLike(scope)) {
    for (const p of scope.parameters) out.push(...bindingNames(p.name));
    if (ts.isFunctionExpression(scope) && scope.name) out.push(scope.name.text);
  }
  if (ts.isCatchClause(scope) && scope.variableDeclaration) out.push(...bindingNames(scope.variableDeclaration.name));
  if ((ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope))
    && scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
    for (const d of scope.initializer.declarations) out.push(...bindingNames(d.name));
  }
  if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseBlock(scope)) {
    const statements = ts.isCaseBlock(scope) ? scope.clauses.flatMap((c) => [...c.statements]) : scope.statements;
    for (const s of statements) {
      if (ambient(s)) continue;
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) out.push(...bindingNames(d.name));
      } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) && s.name) {
        out.push(s.name.text);
      } else if (ts.isImportDeclaration(s) && s.importClause) {
        const c = s.importClause;
        if (c.name) out.push(c.name.text);
        const b = c.namedBindings;
        if (b && ts.isNamespaceImport(b)) out.push(b.name.text);
        if (b && ts.isNamedImports(b)) for (const e of b.elements) out.push(e.name.text);
      } else if (ts.isImportEqualsDeclaration(s)) {
        out.push(s.name.text);
      }
    }
  }
  return out;
}

/** Whether `id` names a local of the same name in an enclosing scope (a `var` hoisted out of a nested block aside). */
function shadowed(id: ts.Identifier): boolean {
  for (let n: ts.Node | undefined = id.parent; n; n = n.parent) if (declaredIn(n).includes(id.text)) return true;
  return false;
}

/** Whether `node` sits in a type position: inside a type node, other than a class's `extends` expression (a value). */
function inType(node: ts.Node): boolean {
  for (let n: ts.Node = node; n.parent; n = n.parent) {
    if (ts.isExpressionWithTypeArguments(n) && ts.isHeritageClause(n.parent)
      && n.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(n.parent.parent)) return false;
    if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return true;
  }
  return false;
}

/**
 * Whether an identifier is a value reference -- an expression -- rather than a declared name, a member or key, a
 * label or a type. A shorthand property (`{ navigator }`) is a reference; `x.navigator`'s name is not (the host forms,
 * `globalThis.navigator` and `self.navigator`, are caught on the access itself).
 */
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isShorthandPropertyAssignment(p)) return p.name === id;
  const named = p as ts.Node & { name?: ts.Node; propertyName?: ts.Node; label?: ts.Node };
  if (named.name === id || named.propertyName === id || named.label === id) return false;
  if (ts.isQualifiedName(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  return !inType(id);
}

/** A wrapper that leaves its operand's value as it is: parentheses, `as`, `satisfies`, `!`, `<T>`. */
type Wrapper = ts.ParenthesizedExpression | ts.AsExpression | ts.SatisfiesExpression | ts.NonNullExpression
  | ts.TypeAssertion;
function isWrapper(node: ts.Node): node is Wrapper {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node);
}

/** The expression inside any wrappers. */
function unwrap(node: ts.Expression): ts.Expression {
  while (isWrapper(node)) node = node.expression;
  return node;
}

/** The outermost wrapper around `node` (itself when it has none). */
function outermost(node: ts.Node): ts.Node {
  while (isWrapper(node.parent) && node.parent.expression === node) node = node.parent;
  return node;
}

/**
 * The global object (`globalThis` or `self`) an expression is, wrappers unwrapped -- unless a local shadows it.
 * `window` is left to the name rule: it is a browser name itself, so `window.x` is reported once, as `window`.
 */
function hostOf(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  const u = unwrap(node);
  return ts.isIdentifier(u) && HOSTS.has(u.text) && u.text !== 'window' && !shadowed(u) ? u.text : null;
}

/** A destructuring element's key: its property name (an identifier or a quoted key), else its bound name. */
function bindingKey(e: ts.BindingElement): string | null {
  const key = e.propertyName ?? e.name;
  if (ts.isIdentifier(key) || ts.isStringLiteral(key)) return key.text;
  if (ts.isComputedPropertyName(key)) return literalText(key.expression);
  return null;
}

/**
 * What a new package's source breaks of rule (b), in source order: `three` imported, or a browser global reached --
 * by name, through `globalThis`/`self` (`.x`, `['x']`, wrappers unwrapped), by destructuring them (`const { indexedDB }
 * = globalThis`), or by holding the global object itself (`const g = globalThis`, `f(self)`; PLAT-02's last round).
 */
export function browserUses(source: string, fileName = 'x.ts'): string[] {
  const out: string[] = [];
  for (const spec of specifiers(source, fileName)) if (spec === 'three' || spec.startsWith('three/')) out.push(`imports ${spec}`);
  const visit = (node: ts.Node): void => {
    const host = (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && !inType(node)
      ? hostOf(node.expression) : null;
    if (host && ts.isPropertyAccessExpression(node) && BROWSER.has(node.name.text)) {
      out.push(`names ${host}.${node.name.text}`);
    } else if (host && ts.isElementAccessExpression(node)) {
      const key = literalText(node.argumentExpression);
      if (key !== null && BROWSER.has(key)) out.push(`names ${host}['${key}']`);
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      const from = hostOf(node.initializer);
      if (from) {
        for (const e of node.name.elements) {
          const key = bindingKey(e);
          if (key !== null && BROWSER.has(key)) out.push(`names ${from}.${key}`);
        }
      }
    }
    if (ts.isIdentifier(node) && BROWSER.has(node.text) && isValueReference(node) && !shadowed(node)) {
      out.push(`names ${node.text}`);
    }
    // The global object held or passed as a value; reading a member off it (judged above) or `typeof` is not holding it.
    if (ts.isIdentifier(node) && hostOf(node) && isValueReference(node)) {
      const w = outermost(node), p = w.parent;
      const read = ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === w)
        || (ts.isVariableDeclaration(p) && ts.isObjectBindingPattern(p.name) && p.initializer === w)
        || ts.isTypeOfExpression(p);
      if (!read) out.push(`holds ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(source, fileName));
  return out;
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') out.push(...tsFiles(path));
    } else if (isSource(name)) out.push(path);
  }
  return out;
}

function srcOf(pkg: string): string {
  return join(PACKAGES_DIR, pkg, 'src');
}

describe('the helpers, on inline samples', () => {
  // The first round's comment stripper is gone (the syntax tree has no comments in it); its samples stay, on the
  // functions that replaced it.
  it('reads nothing in a comment, and a `//` in a string is no comment', () => {
    expect(browserUses('a // window\nb /* document */ c')).toEqual([]);
    expect(specifiers('const u = "http://x"; // import \'@s2u/viewer\'')).toEqual([]);
    expect(browserUses('const u = "http://x"; window.x;')).toEqual(['names window']);
  });

  it('finds every form of specifier, and none in a comment', () => {
    const src = [
      'import { a } from \'./a\';', 'import type { B } from "@s2u/archive";', 'export * from \'./c\';',
      'import \'./side\';', 'const m = await import(\'./lazy\');', '// import { z } from \'@s2u/viewer\';',
      '/* export * from \'three\'; */',
    ].join('\n');
    expect(specifiers(src)).toEqual(['./a', '@s2u/archive', './c', './side', './lazy']);
  });

  it('sees the viewer by name and by a relative path into its tree', () => {
    const file = join(PACKAGES_DIR, 'ui', 'src', 'x.ts');
    expect(reachesViewer('@s2u/viewer', file)).toBe(true);
    expect(reachesViewer('@s2u/viewer/src/sim', file)).toBe(true);
    expect(reachesViewer('../../viewer/src/sim', file)).toBe(true);
    expect(reachesViewer('../../scene/src/uiLayout', file)).toBe(false);
    expect(reachesViewer('./viewerless', file)).toBe(false);
    expect(reachesViewer('@s2u/viewers', file)).toBe(false);
  });

  it('flags three and a browser global as a value, not a comment, a property or a longer name', () => {
    expect(browserUses('import * as THREE from \'three\';')).toEqual(['imports three']);
    expect(browserUses('import { GLTFLoader } from \'three/examples/jsm/loaders/GLTFLoader.js\';'))
      .toEqual(['imports three/examples/jsm/loaders/GLTFLoader.js']);
    expect(browserUses('const db = indexedDB.open(\'s2u\');')).toEqual(['names indexedDB']);
    expect(browserUses('const w = window.innerWidth;\nconst c = new AudioContext();'))
      .toEqual(['names window', 'names AudioContext']);
    expect(browserUses('localStorage.setItem(\'a\', \'b\'); navigator.getGamepads(); document.body;'))
      .toEqual(['names localStorage', 'names navigator', 'names document']);
    expect(browserUses([
      '// the viewer fills this from window.indexedDB', '/** Not `document`, not `navigator`. */',
      'export interface Storage { open(name: string): Promise<void> }', 'const windowSize = host.window;',
      'const s = \'see document\';',
    ].join('\n'))).toEqual([]);
    expect(browserUses('const t = `${navigator.userAgent}`;')).toEqual(['names navigator']);
  });
});

describe('the review\'s holes, on inline samples (the PLAT-02 fix round)', () => {
  const ui = join(PACKAGES_DIR, 'ui', 'src', 'x.ts');

  it('(b) flags a global reached through globalThis, self or window, by dot or by a quoted key', () => {
    expect(browserUses('const db = globalThis.indexedDB.open(\'s2u\');')).toEqual(['names globalThis.indexedDB']);
    expect(browserUses('const d = self.document;')).toEqual(['names self.document']);
    expect(browserUses('const s = globalThis[\'localStorage\'];')).toEqual(['names globalThis[\'localStorage\']']);
    expect(browserUses('const n = self[\'navigator\'];')).toEqual(['names self[\'navigator\']']);
    expect(browserUses('const s = globalThis.sessionStorage;')).toEqual(['names globalThis.sessionStorage']);
    expect(browserUses('const s = sessionStorage.getItem(\'a\');')).toEqual(['names sessionStorage']);
    expect(browserUses('if (typeof window !== \'undefined\') run();')).toEqual(['names window']);
    // A class's `extends` is a value, not a type; a parameter shadows the name only inside its own function.
    expect(browserUses('class Mixer extends AudioContext {}')).toEqual(['names AudioContext']);
    expect(browserUses('function f(window: W) { return window; }\nconst w = window.innerWidth;')).toEqual(['names window']);
  });

  it('(b) is not blinded by a quote in a template literal or a regex literal', () => {
    expect(browserUses('const t = `can\'t`; const w = window; const s = \'a\';')).toEqual(['names window']);
    expect(browserUses('const r = /\'/; const d = document; const s = \'x\';')).toEqual(['names document']);
  });

  it('(b) passes a member, a key, a binding, a parameter and a type of those names', () => {
    expect(browserUses([
      'interface Host { document: string; window: number }',
      'const o = { window: 3 };',
      'function f(navigator: Nav): Nav { return navigator; }',
      'const { window: win } = host;',
      'let c: HTMLCanvasElement | undefined;',
      'type W = typeof window;',
      'export function openStore(factory: IDBFactory): IDBOpenDBRequest { return factory.open(\'s2u\'); }',
      'class Store { document = 1; localStorage(): void {} }',
    ].join('\n'))).toEqual([]);
    // A destructured local is a local: its later use is not the global.
    expect(browserUses('const { indexedDB } = host;\nindexedDB.open(\'a\');')).toEqual([]);
    // A shorthand property takes the global's value.
    expect(browserUses('const o = { navigator };')).toEqual(['names navigator']);
  });

  it('(a) finds a template-literal import, a quoted export name and both kinds of require', () => {
    expect(specifiers('const v = await import(`@s2u/viewer`);')).toEqual(['@s2u/viewer']);
    expect(specifiers('import { \'a-b\' as c } from \'@s2u/viewer\';')).toEqual(['@s2u/viewer']);
    expect(specifiers('const v = require(\'@s2u/viewer\');')).toEqual(['@s2u/viewer']);
    expect(specifiers('import v = require(\'@s2u/viewer\');')).toEqual(['@s2u/viewer']);
  });

  it('(a) sees the viewer through the workspace\'s deep path, and scans .mts, .cts and .tsx', () => {
    expect(reachesViewer('@s2u/socomlegacy/packages/viewer/src/sim', ui)).toBe(true);
    expect(reachesViewer('@s2u/socomlegacy/packages/scene/src/uiLayout', ui)).toBe(false);
    expect(['a.ts', 'a.mts', 'a.cts', 'a.tsx', 'a.js', 'a.md'].filter(isSource)).toEqual(['a.ts', 'a.mts', 'a.cts', 'a.tsx']);
  });
});

describe('the second review\'s gaps in rule (b), on inline samples (PLAT-02\'s last round)', () => {
  it('flags a destructuring of the global object that binds a browser name', () => {
    expect(browserUses('const { indexedDB } = globalThis; indexedDB.open(\'a\');')).toEqual(['names globalThis.indexedDB']);
    expect(browserUses('const { navigator: n } = self;')).toEqual(['names self.navigator']);
    expect(browserUses('const { \'localStorage\': s } = (globalThis as any);')).toEqual(['names globalThis.localStorage']);
    // Kept from the first round: a destructured local of another object is a local.
    expect(browserUses('const { indexedDB } = host;\nindexedDB.open(\'a\');')).toEqual([]);
    expect(browserUses('const { setTimeout } = globalThis;')).toEqual([]);
  });

  it('flags the global object held or passed as a value', () => {
    expect(browserUses('const g = globalThis; g.indexedDB.open(\'a\');')).toEqual(['holds globalThis']);
    expect(browserUses('f(self);')).toEqual(['holds self']);
    expect(browserUses('const g = (globalThis as any);')).toEqual(['holds globalThis']);
    expect(browserUses('if (typeof globalThis === \'object\') run();')).toEqual([]);
    expect(browserUses('const t = globalThis.setTimeout;')).toEqual([]);
  });

  it('unwraps parentheses, as, satisfies and ! around the host of an access', () => {
    expect(browserUses('(globalThis as any).indexedDB.open(\'a\');')).toEqual(['names globalThis.indexedDB']);
    expect(browserUses('(globalThis).indexedDB;')).toEqual(['names globalThis.indexedDB']);
    expect(browserUses('globalThis!.indexedDB;')).toEqual(['names globalThis.indexedDB']);
    expect(browserUses('(self satisfies object)[\'document\'];')).toEqual(['names self[\'document\']']);
    expect(browserUses('(<any>self).navigator;')).toEqual(['names self.navigator']);
  });

  it('does not take an ambient declaration for a shadowing local', () => {
    expect(browserUses('declare const indexedDB: IDBFactory; indexedDB.open(\'a\');')).toEqual(['names indexedDB']);
    expect(browserUses('declare global { var navigator: Nav }\nnavigator.getGamepads();')).toEqual(['names navigator']);
    expect(browserUses('declare function alert(s: string): void; alert(\'x\');')).toEqual(['names alert']);
  });

  it('bans the browser globals the coming tasks would reach for, and not the ones Node has too', () => {
    const banned = [
      'requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener', 'location', 'history',
      'Image', 'OffscreenCanvas', 'HTMLCanvasElement', 'Worker', 'XMLHttpRequest', 'caches', 'matchMedia', 'alert',
    ];
    for (const name of banned) expect(browserUses(`const v = ${name};`), name).toEqual([`names ${name}`]);
    expect(browserUses('if (x instanceof HTMLCanvasElement) draw(x);')).toEqual(['names HTMLCanvasElement']);
    expect(browserUses('let c: HTMLCanvasElement | OffscreenCanvas; let i: Image;')).toEqual([]);
    // Platform-neutral: Node 22+ has these too (the rule is DOM/browser values, not every global).
    expect(browserUses('const r = await fetch(u); const t = performance.now(); const s = new WebSocket(u);')).toEqual([]);
  });
});

describe('rule (c), no package imports from tools/ (R7), on inline samples', () => {
  const card = join(PACKAGES_DIR, 'card', 'src', 'x.ts');

  it('sees tools/ by package name, by the deep path and by a relative path, in every specifier form', () => {
    expect(reachesTools('@s2u/tools', card)).toBe(true);
    expect(reachesTools('@s2u/tools/cardFile', card)).toBe(true);
    expect(reachesTools('@s2u/socomlegacy/tools/cardFile', card)).toBe(true);
    expect(reachesTools('../../../tools/cardFile', card)).toBe(true);
    expect(reachesTools('../../../tools', card)).toBe(true);
    const src = [
      'import { readSaveFile } from \'../../../tools/cardFile\';', 'export * from "@s2u/tools/cardFile";',
      'const m = await import(`../../../tools/cardFile`);', '// import { unscramble } from \'../../../tools/cardFile\';',
    ].join('\n');
    expect(specifiers(src, card).filter((s) => reachesTools(s, card))).toEqual(['../../../tools/cardFile', '@s2u/tools/cardFile', '../../../tools/cardFile']);
  });

  it('passes the packages\' own paths and names that only look alike', () => {
    expect(reachesTools('./tools', card)).toBe(false);                       // packages/card/src/tools
    expect(reachesTools('../../scene/src/tools', card)).toBe(false);
    expect(reachesTools('@s2u/toolsmith', card)).toBe(false);
    expect(reachesTools('@s2u/archive', card)).toBe(false);
    expect(reachesTools('../../../toolsx/a', card)).toBe(false);
    expect(reachesTools(join(root, 'toolsx', 'a'), card)).toBe(false);
    expect(reachesTools('../../../node_modules/@s2u/toolsmith/a', card)).toBe(false);
  });

  it('sees tools/ by an absolute path, through node_modules/@s2u/tools, and in another case (the review\'s F3)', () => {
    expect(reachesTools(join(root, 'tools', 'cardFile'), card)).toBe(true);
    expect(reachesTools(join(root, 'tools', 'cardFile').replace(/\\/g, '/'), card)).toBe(true);
    expect(reachesTools('../../../../node_modules/@s2u/tools/cardFile', card)).toBe(true);
    expect(reachesTools('../../../node_modules/@s2u/tools', card)).toBe(true);
    expect(reachesTools('@s2u/socomlegacy/node_modules/@s2u/tools/cardFile', card)).toBe(true);
    expect(reachesTools('../../../Tools/cardFile', card)).toBe(true);
    expect(reachesTools('../../../TOOLS', card)).toBe(true);
    expect(reachesTools('@S2U/Tools/cardFile', card)).toBe(true);
    expect(reachesTools('@s2u/SOCOMLEGACY/tools/cardFile', card)).toBe(true);
  });
});

/**
 * The scans below parse every package's sources (rule (c) reads all of packages/*): about 2 s on an idle host, and past
 * vitest's 5 s default on a loaded one (the AWS spares' root-run suites, 2026-11-11; the v0.4.19 plan, "The gate").
 * A wall-clock bound of the instrument, not of the game: product track, no original.
 */
const PACKAGE_SCAN_TIMEOUT_MS = 60_000;

describe('the package boundaries (W6.R2)', () => {
  it('has the three new packages, each with a src/index.ts', () => {
    for (const pkg of NEW) expect(existsSync(join(srcOf(pkg), 'index.ts')), `packages/${pkg}/src/index.ts`).toBe(true);
  });

  it('(a) no pure package imports from the viewer', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const pkg of PURE) {
      if (!existsSync(srcOf(pkg))) {
        offenders.push(`packages/${pkg}/src is missing`);
        continue;
      }
      for (const file of tsFiles(srcOf(pkg))) {
        scanned++;
        for (const spec of specifiers(readFileSync(file, 'utf8'), file)) {
          if (reachesViewer(spec, file)) offenders.push(`${relative(root, file)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(scanned).toBeGreaterThan(50);
  }, PACKAGE_SCAN_TIMEOUT_MS);

  it('(c) no package imports from tools/ (R7: the card file reader is a dev instrument)', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const pkg of readdirSync(PACKAGES_DIR)) {
      if (!existsSync(srcOf(pkg))) continue;
      for (const file of tsFiles(srcOf(pkg))) {
        scanned++;
        for (const spec of specifiers(readFileSync(file, 'utf8'), file)) {
          if (reachesTools(spec, file)) offenders.push(`${relative(root, file)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(scanned).toBeGreaterThan(50);
  }, PACKAGE_SCAN_TIMEOUT_MS);

  it('(b) the new packages import no three and name no browser global', () => {
    const offenders: string[] = [];
    for (const pkg of NEW) {
      if (!existsSync(srcOf(pkg))) {
        offenders.push(`packages/${pkg}/src is missing`);
        continue;
      }
      for (const file of tsFiles(srcOf(pkg))) {
        for (const use of browserUses(readFileSync(file, 'utf8'), file)) offenders.push(`${relative(root, file)}: ${use}`);
      }
    }
    expect(offenders).toEqual([]);
  }, PACKAGE_SCAN_TIMEOUT_MS);
});
