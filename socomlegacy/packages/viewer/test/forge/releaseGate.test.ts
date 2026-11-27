import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYBOARD_SITES } from '../../src/keyboardTesting';
import { PAGE_LOADERS } from '../../src/pageEntry';

/**
 * FORGE (FG.R9, the owner 2026-10-13: "Ship in release, + controller"): the forge is in every build, and inside it the
 * game's release input rule holds -- OT.R29 (the keyboard a development build's) and OT.R38 (no captured mouse look).
 * `test/keyboardGate.test.ts` and `test/mouseGate.test.ts` scan the source root, not `src/forge/`; this is their scan
 * for the forge. A key or lock site is in a release only when no literal `import.meta.env.DEV` gates it on its own
 * line or the two before.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FORGE = resolve(here, '../../src/forge');
// `lobby/` since FG-27 (FG.R22): the lobby popup's modules, scanned as the forge's own. `shell/` since the FC2 batch
// review's B-5 (2026-11-13): the dock shell's sash keys (`shell/dockShell.ts`, 434a494cbc) went unread. Since PR #5's
// review (crispy's import, OT.R112): every folder under `src/forge/`, walked -- `geometry/` and `panels/` held thirteen key
// listeners a hand list of folders never read, and a folder added later is read without an edit here.
const forgeTree = (d: string): string[] => readdirSync(resolve(FORGE, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? forgeTree(`${d}${e.name}/`) : [`${d}${e.name}`]));
const sources = forgeTree('').filter((f) => f.endsWith('.ts')).map((f) => ({ file: f, lines: readFileSync(resolve(FORGE, f), 'utf-8').split('\n') }));
const gated = (lines: string[], i: number): boolean => lines.slice(Math.max(0, i - 2), i + 1).some((l) => l.includes('import.meta.env.DEV'));
/**
 * OT.R68 (the owner, 2026-10-21: "kb/m support for everything while in the forge creation UI (not once of it's started
 * matches)"): the editor's key map and its captured mouse are every build's -- these lines alone, each live. The
 * matches the forge starts (`../../src/matchMount`) keep OT.R29 / OT.R38.
 */
const OT_R68: readonly [string, string][] = [
  ['page.ts', "globalThis.addEventListener('keydown', (e) => {"],                       // the editor's map (`keys.ts`)
  ['page.ts', "globalThis.addEventListener('keydown', onLeaseKey);"],                    // R3-A: the focus lease's exit (`keys.ts`)
  // FUI-22 (D1): the asset preview's own keys (Escape, the arrows' orbit) went with its panel -- a tooltip takes no keys,
  // so its line left this list with it (the list names live lines only); the page's Escape hides the tooltip (`keys.ts`).
  ['page.ts', 'const r = (el as { requestPointerLock?: () => unknown }).requestPointerLock?.();'],   // `lockMouse`
  // FC2-6 (434a494cbc; B-5): the dock shell's sash -- the arrows along its split resize its two panes, an editor key.
  ['shell/dockShell.ts', "el.addEventListener('keydown', (e) => {"],
  // PR #5 (crispy's rewrite, OT.R112; each an editor key, none a game key, each held by a match -- `keys.ts` and the
  // OT.R68 case below): the Outliner's rename key (`outliner.rename`, typing refused first); Ctrl / Cmd held flipping the
  // snaps for a drag; AI Navigation mode's Shift (the sampler's cursor) and its Escape (Select, then deselect); the
  // shortcut editor's chord capture (Edit > Preferences), which reads every key while it records one.
  ['page.ts', "outliner.addEventListener('keydown', (e) => {"],
  ['page.ts', "doc.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.key === 'Meta') setCtrlSnapFlip(true); }, true);"],
  ['page.ts', "doc.addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') setCtrlSnapFlip(false); }, true);"],
  ['aiPaint.ts', "doc.addEventListener('keydown', (e) => {"],
  ['aiPaint.ts', "doc.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.setShift(false); }, true);"],
  ['shortcutEditor.ts', "win.addEventListener('keydown', onKey, true);"],
  ['shortcutEditor.ts', "win.addEventListener('keyup', onKeyUp, true);"],
  // PR #5's review (the scan walks `geometry/` now): Geometry mode's shortcuts (`geometry/editor.ts` `onKey`, the
  // shortcut table's Geometry commands), an editor key; `onKey` opens on `!this.active || this.deps.matchHeld()` (fbe25ad323),
  // held by the OT.R68 case below, so a Play match reads none of them.
  ['geometry/editor.ts', "doc.addEventListener('keydown', (e) => this.onKey(e), true);"],
];
const listed = (file: string, l: string): boolean => OT_R68.some(([f, frag]) => f === file && l.includes(frag));
/** Native browser field accessibility (FDL-1), separate from OT.R68's editor input map.
 * Key release activates a Settings range endpoint when its thumb has not moved; no key reaches the game.
 */
const NATIVE_FIELD_KEYS: readonly [string, string][] = [['page.ts', "lightIn.addEventListener('keyup'"]];
/**
 * The page's own accessibility keys, no game input (`../keyboardGate.test.ts` lists them too): Enter or Space on the axis
 * widget's end, Escape closing a popover, Escape cancelling a scrub's drag; the shell's (B-5): Escape closing an open
 * workspace, the card stack's Escape (its Back) and its Tab focus trap.
 */
const ACCESSIBILITY_KEYS: readonly [string, string][] = [
  ['page.ts', "end.addEventListener('keydown', (event) => {"],   // (FC2: the old docks' resize handle's arrow keys left with the docks; the shell's sash has them, OT_R68)
  ['page.ts', "doc.addEventListener('keydown', event => {"], ['page.ts', "doc.addEventListener('keydown', (e) => {"],
  ['page.ts', "field.addEventListener('keydown', (e) => {"],   // the outliner's folder rename: Enter keeps, Escape cancels (a text field's own keys)
  // PR #5: the scrub's Escape listens on the field's own document (`keys`), was `doc`; the same Escape-only cancel.
  ['scrub.ts', "keys.addEventListener('keydown', onKey, true);"],
  // PR #5: the asset picker's and the asset preview card's Escape (each `onKey` Escape-only, FP-1b below), and AI
  // Navigation mode's soil menu's Escape (`away`: a key other than Escape does nothing).
  ['page.ts', "doc.addEventListener('keydown', onKey, true);"],
  ['aiPaint.ts', "doc.addEventListener('keydown', away, true);"],
  ['shell/dockShell.ts', "workspace?.root.addEventListener('keydown', onWorkspaceKey);"],
  ['shell/panel.ts', "workspace?.root.addEventListener('keydown', onWorkspaceKey);"],
  ['shell/cards.ts', "host.addEventListener('keydown', onKey);"], ['shell/cards.ts', "doc.addEventListener('keydown', onTab);"],
  // PR #5's review (the scan walks `geometry/` and `panels/` now; crispy's import, OT.R112). On the document, each bound
  // only while its own popup is open (added at its open, removed at its close) and Escape-only (the PR #5 review case
  // below holds each handler's form): Geometry mode's climb menu (`away`), its block-shape menu (`key`), the script
  // graph's step menu (`key`).
  ['geometry/editor.ts', "doc.addEventListener('keydown', away, true);"],
  ['geometry/editor.ts', "doc.addEventListener('keydown', key, true);"],
  ['panels/stepMenu.ts', "doc.addEventListener('keydown', key, true);"],
  // On a field or a control of its own, each a whole line, so a handler taking another key no longer matches: the
  // Inspector's suggestion field and a held-open Data dropdown (Escape, Enter or Tab closes its list), an Inspector field's
  // Enter (commits, by blur); the script graph's sequence rename (Enter keeps, Escape cancels) and a node head's Enter or
  // Space (a button's activation: choose the node); the texture inspector's two number fields' Enter (commits, by blur).
  ['panels/inspectorPanel.ts', "input.addEventListener('keydown', (k) => { if (k.key === 'Escape' || k.key === 'Enter' || k.key === 'Tab') suggestOpen?.close(); });"],
  ['panels/inspectorPanel.ts', "s.addEventListener('keydown', (k) => { if (k.key === 'Escape' || k.key === 'Enter' || k.key === 'Tab') close(); });"],
  ['panels/inspectorPanel.ts', "if (input instanceof HTMLInputElement && e.kind !== 'check') input.addEventListener('keydown', (k) => { if (k.key === 'Enter') input.blur(); });"],
  ['panels/scriptGraph.ts', "input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });"],
  ['panels/scriptGraph.ts', "head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });"],
  ['panels/textureInspector.ts', "i.addEventListener('keydown', (k) => { if (k.key === 'Enter') i.blur(); });"],
  ['panels/textureInspector.ts', "distance.addEventListener('keydown', (k) => { if (k.key === 'Enter') distance.blur(); });"],
];
/**
 * PR #5's review: an OPEN FINDING, not an exemption ruled -- Geometry mode's Shift and Ctrl / Cmd held (the sampler's
 * cursor, the snaps' flip), on the document with no `active` or `matchHeld` guard: under a Play match started in Geometry
 * mode a press still runs `setShiftHeld` (the paint UI and hover redrawn while the mode is active, the Knife's point
 * redrawn) and `setCtrlHeld` (the drag snaps applied, a drag under way moved, the Knife redrawn). Reported to the
 * coordinator; each pinned to its whole line so the scan stays red on any change until it is ruled or guarded.
 */
const OPEN_MATCH_UNGUARDED: readonly [string, string][] = [
  ['geometry/editor.ts', "doc.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.setShiftHeld(true); if (e.key === 'Control' || e.key === 'Meta') this.setCtrlHeld(true); }, true);"],
  ['geometry/editor.ts', "doc.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.setShiftHeld(false); if (e.key === 'Control' || e.key === 'Meta') this.setCtrlHeld(false); }, true);"],
];
/** PR #5's review: a named popup handler's whole body one Escape-guarded close (`const key = ...`, before its listener). */
const ESCAPE_ONLY_KEY = /^\s*const key = \(e: KeyboardEvent\): void => \{ if \(e\.key === 'Escape'\) \{ [^{}]* \} \};$/;
/** PR #5's review: the climb menu's `away` -- its one statement a close on Escape (a key) or a press outside (a pointer). */
const ESCAPE_ONLY_AWAY = /const away = \(e: Event\): void => \{\n\s*if \(e instanceof KeyboardEvent \? e\.key === 'Escape' : [^\n?]*\) \{\n\s*this\.closeClimbMenu\(\);\n\s*if \(e instanceof KeyboardEvent\) e\.stopPropagation\(\);\n\s*\}\n\s*\};\n/;


/**
 * FP-1b (REVIEW-C 18): the Forge page's accessibility exemptions are fragments, and `doc.addEventListener('keydown', ...)`
 * would match any later listener of that form -- a game key slipped past the gate unseen. Each is pinned to its live lines
 * exactly: how many lines it matches, and for the document's two forms the Escape-only guard that opens each handler.
 */
const FORGE_PAGE_EXEMPT_LINES: Readonly<Record<string, number>> = {
  "end.addEventListener('keydown', (event) => {": 1,
  "doc.addEventListener('keydown', event => {": 1,
  // FC2-4: three -- the Play settings popup's and the Select settings popup's Escape (page.ts:11326, 11775), and his menu
  // bar's (page.ts:12202): Escape shuts an open File / Edit / Window menu, no other key, on one line.
  // PR #5: five -- those three (page.ts:15691, 16238, 16715) and his workplane pick's and tile drag's Escape (page.ts:11483,
  // 11906), each an Escape-only guard. His Ctrl snap line opens with the same words but is OT_R68's (listed there, so
  // not counted here).
  "doc.addEventListener('keydown', (e) => {": 5,
  // PR #5: the asset picker's and the asset preview card's (page.ts:8613, 12180), each `onKey` an Escape-only close.
  "doc.addEventListener('keydown', onKey, true);": 2,
  "field.addEventListener('keydown', (e) => {": 1,   // the outliner's folder rename: Enter keeps, Escape cancels (a text field's own keys)
};
const ESCAPE_ONLY = /^\s*if \((?:e|event)\.key !== 'Escape' \|\| \w+\.hidden\) return;$/;
/** PR #5: the guard with its state the other way round -- `!workplanePicking || e.key !== 'Escape'`, `e.key !== 'Escape' || !tileDrag?.started`. */
const ESCAPE_ONLY_STATE = /^\s*if \((?:!\w+ \|\| )?e\.key !== 'Escape'(?: \|\| ![\w?.]+)?\) return;$/;
/** PR #5: a named handler's whole body one Escape-guarded close (`const onKey = ...`, the line before its listener's). */
const ESCAPE_ONLY_ONKEY = /^\s*const onKey = \(e: KeyboardEvent\): void => \{ if \(e\.key === 'Escape'\) \{ [^{}]* \} \};$/;
/** FC2-4: the one-line form -- the handler's whole body one Escape-guarded shut of the menu bar's open menus. */
const ESCAPE_ONLY_INLINE = /=> \{ if \((?:e|event)\.key === 'Escape'\) for \(const m of menus\) if \(m\.d\.open\) shut\(m\); \}\);\s*$/;

describe('FORGE: the release gate', () => {
  it('is loaded in every build (no DEV gate on its loader)', () => {
    expect(Object.keys(PAGE_LOADERS)).toContain('forge');
  });

  it('attaches no key listener, pointer lock or mouse-look outside a DEV gate, and says its key site', () => {
    const bad: string[] = [];
    for (const { file, lines } of sources) {
      lines.forEach((l, i) => {
        if (listed(file, l)) return;
        if (/addEventListener\('key(down|up)'/.test(l) && !gated(lines, i) && ![...NATIVE_FIELD_KEYS, ...ACCESSIBILITY_KEYS, ...OPEN_MATCH_UNGUARDED].some(([f, frag]) => file === f && l.includes(frag))) bad.push(`${file}:${i + 1} key listener`);
        if (/requestLock\(|requestPointerLock|pointerlockchange|\.movementX/.test(l) && !gated(lines, i)) bad.push(`${file}:${i + 1} pointer lock`);
      });
    }
    expect(bad).toEqual([]);
    expect(KEYBOARD_SITES).toContain('s2u-kb-forge');
    expect(sources.some(({ lines }) => lines.some((l) => l.includes("keyboardSite('s2u-kb-forge')")))).toBe(true);
  });

  it('OT.R68: each listed line is live, once; the editor\'s map reads no key while a match runs (`keys.ts`)', () => {
    for (const [file, frag] of OT_R68) {
      const hits = sources.find((s) => s.file === file)!.lines.filter((l) => l.includes(frag));
      expect(hits, frag).toHaveLength(1);
    }
    const keys = readFileSync(resolve(FORGE, 'keys.ts'), 'utf-8');
    // PR #5: the import added the shortcut editor's pause (`keysPaused()`) to the same line; typing and a match still
    // refuse every editor action first (`forgeKeyAction`'s opening line).
    expect(keys).toMatch(/export function forgeKeyAction\([^\n]*\{\n\s*if \(s\.typing \|\| s\.match(?: \|\| keysPaused\(\))?\) return null;/);
    // PR #5's Geometry mode and AI Navigation mode read keys on listeners of their own (`geometry/editor.ts` `onKey`,
    // `aiPaint.ts`), outside `forgeKeyAction`: a match started from either mode holds them too (OT.R68: "not once of
    // it's started matches"). Their typing guard is their own (`onKey`'s field test; aiPaint answers Escape alone).
    const geo = readFileSync(resolve(FORGE, 'geometry/editor.ts'), 'utf-8');
    expect(geo).toMatch(/private onKey\(e: KeyboardEvent\): void \{\n\s*if \(!this\.active \|\| this\.deps\.matchHeld\(\) \|\| /);
    const page = sources.find((s) => s.file === 'page.ts')!.lines;
    expect(page.filter((l) => l.includes('matchHeld: () => match !== null,'))).toHaveLength(1);
    expect(page.filter((l) => l.includes('active: () => navOn && match === null,'))).toHaveLength(1);
  });

  it("PR #5's review: the scan walks every folder of src/forge/; each geometry/ and panels/ entry names one live line, each popup's document handler Escape-only", () => {
    for (const f of ['geometry/editor.ts', 'panels/stepMenu.ts', 'panels/inspectorPanel.ts', 'panels/scriptGraph.ts', 'panels/textureInspector.ts']) {
      expect(sources.some((s) => s.file === f), f).toBe(true);
    }
    const sub = [...OT_R68, ...ACCESSIBILITY_KEYS, ...OPEN_MATCH_UNGUARDED].filter(([f]) => f.startsWith('geometry/') || f.startsWith('panels/'));
    expect(sub).toHaveLength(13);
    for (const [file, frag] of sub) {
      expect(sources.find((s) => s.file === file)!.lines.filter((l) => l.includes(frag)), `${file}: ${frag}`).toHaveLength(1);
    }
    // The document's popup handlers: a `key` one-line Escape close, the climb menu's `away`.
    for (const [file, frag] of ACCESSIBILITY_KEYS.filter(([f, x]) => (f.startsWith('geometry/') || f.startsWith('panels/')) && x.startsWith('doc.'))) {
      const lines = sources.find((s) => s.file === file)!.lines;
      const at = lines.findIndex((l) => l.includes(frag));
      if (frag.includes(', away,')) {
        const from = lines.slice(0, at).map((l) => l.includes('const away = ')).lastIndexOf(true);
        expect(from, `${file}:${at + 1}`).toBeGreaterThanOrEqual(0);
        expect(ESCAPE_ONLY_AWAY.test(`${lines.slice(from, at).join('\n')}\n`), `${file}:${at + 1}`).toBe(true);
      } else {
        const from = lines.slice(0, at).map((l) => l.includes('const key = ')).lastIndexOf(true);
        expect(from, `${file}:${at + 1}`).toBeGreaterThanOrEqual(0);
        expect(ESCAPE_ONLY_KEY.test(lines[from]!), `${file}:${from + 1}`).toBe(true);
      }
    }
  });

  it('FC2 B-5: the scan reads shell/, and each of its accessibility exemptions names one live line', () => {
    expect(sources.some((s) => s.file === 'shell/dockShell.ts')).toBe(true);
    for (const [file, frag] of ACCESSIBILITY_KEYS.filter(([f]) => f.startsWith('shell/'))) {
      expect(sources.find((s) => s.file === file)!.lines.filter((l) => l.includes(frag)), `${file}: ${frag}`).toHaveLength(1);
    }
  });

  it('the native Settings range exemption names exactly one live field listener, not the editor key map', () => {
    for (const [file, frag] of NATIVE_FIELD_KEYS) {
      const hits = sources.find(s => s.file === file)!.lines.filter(l => l.includes(frag));
      expect(hits, frag).toHaveLength(1);
      expect(hits[0]).toContain('activateTime()');
      expect(hits[0]).not.toMatch(/globalThis|keyboardSite|forgeKeyAction/);
    }
  });

  it("FP-1b: each of the Forge page's accessibility exemptions matches exactly its own lines; the document's two open on an Escape-only guard", () => {
    const lines = sources.find((s) => s.file === 'page.ts')!.lines;
    for (const [frag, count] of Object.entries(FORGE_PAGE_EXEMPT_LINES)) {
      expect(ACCESSIBILITY_KEYS.some(([f, x]) => f === 'page.ts' && x === frag), frag).toBe(true);
      const at = lines.flatMap((l, i) => (l.includes(frag) && !listed('page.ts', l) ? [i] : []));
      expect(at, frag).toHaveLength(count);
      if (frag.startsWith('doc.')) {
        for (const i of at) {
          const onKeyAt = frag.includes('onKey') ? lines.slice(0, i).map((l) => l.includes('const onKey = ')).lastIndexOf(true) : -1;
          expect(ESCAPE_ONLY.test(lines[i + 1]!) || ESCAPE_ONLY_STATE.test(lines[i + 1]!) || ESCAPE_ONLY_INLINE.test(lines[i]!)
            || (onKeyAt >= 0 && ESCAPE_ONLY_ONKEY.test(lines[onKeyAt]!)), `page.ts:${i + 1}`).toBe(true);
        }
      }
    }
    expect(ACCESSIBILITY_KEYS.filter(([f]) => f === 'page.ts').map(([, x]) => x).sort()).toEqual(Object.keys(FORGE_PAGE_EXEMPT_LINES).sort());
  });
  it('asks nothing through a browser dialog (confirm, alert, prompt): its own cards answer a pad', () => {
    const bad = sources.flatMap(({ file, lines }) => lines.flatMap((l, i) => (/\b(confirm|alert|prompt)\(/.test(l) && /globalThis\.|window\./.test(l) ? [`${file}:${i + 1}`] : [])));
    expect(bad).toEqual([]);
  });
});
