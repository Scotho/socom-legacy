import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { KEYBOARD_SITES } from '../src/keyboardTesting';
import { MOUSE_SITES } from '../src/mouseTesting';
import { KBM_POINTER_LOCK_SITE } from '../src/camera';
import { VOICE_COUNTERS_MARKER } from '../src/voice/voiceCounters';
import { VOICE_REPORT_MARKER, VOICE_REPORT_PATH } from '../src/voice/voiceReport';
import { CLOSE_REPORT_MARKER, CLOSE_REPORT_PATH } from '../src/net/closeReport';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * OT.R29 (the owner, 2026-10-04: "keyboard has been made a full testing local only release excluded (and demo excluded)
 * option. controller support only"): every keyboard path (`src/keyboardTesting.ts` `KEYBOARD_SITES`, each behind a
 * literal `import.meta.env.DEV`; the setup page's own, `src/startup.ts`, until CX-9b removed that page) is folded away
 * by every `vite build`, so a built page -- the release, a demo -- holds no trace of it: neither its marker nor its
 * note. A build of this tree is told from a stale one by the setup page's markers (`./builtDist.ts`
 * `SETUP_PAGE_MARKERS`, both in every build) and by the revision the build carries, this tree's HEAD, clean.
 *
 * Reads `dist/viewer` when a build of this tree is present and skips, the two revisions in the skip's name, when it is
 * not (the unit suite runs without a build); `npm run build` makes it real.
 */
const here = dirname(fileURLToPath(import.meta.url));
// A build without the setup page's markers is not read; and since web sprint 37's close review pass 2 a build of another
// revision is not read either (`./builtDist.ts`).
const dist = readBuiltDist(VIEWER_DIST);
const js = dist.js;
// OV-2's scan reads the bundle's .css beside its .js (`./builtDist.ts` reads the .js alone); read only on a build of this tree.
const assets = resolve(VIEWER_DIST, 'assets');
/** Each `assets/*.js` on its own (OT.R68: the forge's pointer lock is held to its chunk). */
const jsFiles = dist.built && existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(resolve(assets, f), 'utf-8')) : [];
const css = dist.built && existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.css')).map((f) => readFileSync(resolve(assets, f), 'utf-8')).join('\n') : '';
/**
 * The front end's match hook for the browser spec (`src/matchMount.ts` `MATCH_WINDOW_HOOK`, the sprint 17 close review's
 * finding 3): a development build's alone, like the keyboard -- its name, read off the source, must not be in a release.
 */
const hookLine = readFileSync(resolve(here, '../src/matchMount.ts'), 'utf-8').split(/\r?\n/).find((l) => l.startsWith('export const MATCH_WINDOW_HOOK: string = import.meta')) ?? '';
const matchHook = /DEV \? '([^']+)'/.exec(hookLine)?.[1] ?? '';

describe('the voice talk keys are scanned for (SVC-22b; constraint 8, OT.R29)', () => {
  it('their site is in the list the built bundle is scanned for, by its marker', () => {
    expect(KEYBOARD_SITES).toContain('s2u-kb-voice');
  });
});

/**
 * MODAL-CLOSE's exemption, in this scan's own form (MISSION OT.R62, the owner, 2026-10-17: "esc in release builds: fine to
 * add for players"). The built bundle is scanned for the gated sites' markers (`keyboardSite`) and finds none; the
 * console's Escape -- closing an open popup -- ships in every build, so it is no gated site: it sits outside the literal
 * `import.meta.env.DEV`, writes no marker, and reads Escape alone, while a popup is open. The console's keymap (every other
 * key) stays under the literal gate, so a build folds it away as before. Read off the source: no build needed.
 */
describe("OT.R62: the console's Escape ships in a release build, and the keymap does not", () => {
  const input = readFileSync(resolve(here, '../src/console/input.ts'), 'utf-8').split(/\r?\n/);
  const at = input.findIndex((l) => l.includes("doc.addEventListener('keydown', onEscape, true)"));
  const handler = input.slice(input.findIndex((l) => l.includes('const onEscape = ')), at + 1).join('\n');

  it('the Escape listener sits outside the gate, marks no keyboard site, and reads Escape alone while a popup is open', () => {
    expect(at).toBeGreaterThan(0);
    const gate = input.findIndex((l) => /^\s*if \(import\.meta\.en[v]\.DEV\) \{/.test(l));
    const gateEnd = input.findIndex((l, i) => i > gate && /^\s*\}\s*$/.test(l));
    expect(gate).toBeGreaterThan(0);
    expect(at < gate || at > gateEnd, 'outside the keymap\'s gate').toBe(true);
    expect(handler).not.toMatch(/import\.meta\.en[v]\.DEV|keyboardSite\(|KEYMAP/);
    expect(handler).toMatch(/if \(e\.key !== 'Escape' \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey \|\| e\.isComposing\) return;/);
    expect(handler).toMatch(/if \(!ctl\.popupOpen\(\)\) return;/);
  });

  it('the keymap (every other key) is still attached only under the literal gate, which a build folds away', () => {
    expect(input.join('\n')).toMatch(/if \(import\.meta\.en[v]\.DEV\) \{[^\n]*\n\s+if \(opts\.keymap\) on\(win, 'keydown', onKey\);\n\s+\}/);
    const attached = input.filter((l) => /on\(win, 'keydown'/.test(l));
    expect(attached.map((l) => l.trim())).toEqual(["if (opts.keymap) on(win, 'keydown', onKey);", "on(win, 'keydown', onMenuKey);", "on(win, 'keydown', onLauncherStart);"]);   // LR-30: the menu keys, every build
  });

  it('the launcher START keys are attached outside that gate (Enter, Space, o, p -- every build; OT.R29 amended 2026-10-20)', () => {
    const at = input.findIndex((l) => l.includes("on(win, 'keydown', onLauncherStart)"));
    const gate = input.findIndex((l) => l.includes("if (opts.keymap) on(win, 'keydown', onKey);"));
    expect(at).toBeGreaterThan(gate);
    const handler = input.slice(input.findIndex((l) => l.includes('const onLauncherStart = ')), at).join('\n');
    expect(handler).toMatch(/if \(import\.meta\.en[v]\.DEV && opts\.keymap\) return;/);
    expect(handler).toMatch(/launcherStartKey\(e\)/);
    expect(handler).toMatch(/ctl\.press\('options'\)/);   // START through the controller, its cue with it (#400's fold)
    expect(handler).toMatch(/if \(S\.mode === 'overlay'\) return;/);
    expect(handler).not.toMatch(/KEYMAP/);
  });
});

/**
 * MODAL-CLOSE, the touch layout editor (B61's review, the merge controller's ruling): its Escape -- closing the editor
 * as Cancel -- is OT.R62's too (`test/keyboardGate.test.ts`'s OT.R62 group), so it ships in every build in the same form
 * as the console's: no keyboard site in the module (the bundle's marker scan above, refusing every site, holds with it),
 * outside any literal gate, Escape alone.
 */
describe("OT.R62: the touch layout editor's Escape ships in a release build in the console's form", () => {
  const src = readFileSync(resolve(here, '../src/mobileLayoutEditor.ts'), 'utf-8');
  const line = src.split(/\r?\n/).find((l) => l.includes("d.addEventListener('keydown', (e) => { if (e.key === 'Escape')")) ?? '';

  it('no keyboard site and no literal gate in the module; the listener reads Escape alone and closes as Cancel does', () => {
    expect(src).not.toMatch(/keyboardSite\(|import\.meta\.en[v]\.DEV/);
    expect(line).toMatch(/\{ if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); finish\(\); \} \}\);$/);
  });
});

/**
 * RB-8 (OT.R114, RB.R4): the build's pointer lock allow-list widens by name only -- the camera's kbm lock writes its
 * name (`KBM_POINTER_LOCK_SITE`) where it asks, outside the literal gate, so the chunk that asks carries it; the mouse
 * sites' markers stay under the gate (the built case below). Read off the source: no build needed.
 */
describe("RB-8: the camera's kbm pointer lock names itself where it asks, outside the literal gate", () => {
  it('the name, and its use beside the ask', () => {
    expect(KBM_POINTER_LOCK_SITE).toBe('s2u-kbm-pointer-lock');
    expect(MOUSE_SITES as readonly string[]).not.toContain(KBM_POINTER_LOCK_SITE);
    const cam = readFileSync(resolve(here, '../src/camera.ts'), 'utf-8').split(/\r?\n/);
    const ask = cam.findIndex((l) => l.includes('requestLock(this.canvas)'));
    expect(ask).toBeGreaterThan(0);
    expect(cam.slice(ask - 3, ask + 1).some((l) => l.includes('kbmLockAsked = KBM_POINTER_LOCK_SITE')), 'the name beside the ask').toBe(true);
  });
});

describe('the match hook is a development build only', () => {
  it('its name is folded by import.meta.env.DEV in the source (what a build drops)', () => {
    expect(matchHook).toBe('__frontEndMatch');
  });
});

/**
 * VOICE-LATE-2's counters and VOICE-LATE-3's post of them (research 226 §3.2.1, §3.3; `VOICE_COUNTERS_ADAPTATION`,
 * `VOICE_REPORT_ADAPTATION`): playtest instruments of a development build with `?devmode` only -- the owner, 2026-10-12:
 * the counters "must be turned off for a release". The voice client makes the panel and the reporter only under a literal
 * `import.meta.env.DEV`, as the match hook is, so a `vite build` folds both away with their page halves; held here on the
 * sources without a build, and below on a build of this tree.
 */
describe('the voice counters and their post are a development build only (VOICE-LATE-2, VOICE-LATE-3)', () => {
  const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(dir, e.name)) : e.name.endsWith('.ts') ? [resolve(dir, e.name)] : []);
  const root = resolve(here, '../src');
  const sources = walk(root).map((f) => ({ f: f.slice(root.length + 1).split(/[\\/]/).join('/'), text: readFileSync(f, 'utf-8') }));
  const holding = (needle: RegExp): string[] => sources.filter((s) => needle.test(s.text)).map((s) => s.f).sort();

  it('the voice client makes the panel and the reporter only under a literal import.meta.env.DEV, and names their page halves nowhere else', () => {
    const client = src('voice/voiceClient.ts');
    expect(client).toMatch(/ = import\.meta\.en[v]\.DEV \? \(d\.countersPanel \?\? pageCountersPanel\) : null;/);
    expect(client).toMatch(/ = import\.meta\.en[v]\.DEV \? \(d\.report \?\? pageVoiceReport\) : null;/);
    expect(client.match(/\bpageCountersPanel\b/g)).toHaveLength(2);   // its import and the gate
    expect(client.match(/\bpageVoiceReport\b/g)).toHaveLength(2);
  });

  it("the markers are written only in their modules' page halves, which no other source reaches", () => {
    expect(VOICE_COUNTERS_MARKER).toBe('s2u-dev-voice-counters');
    expect(VOICE_REPORT_MARKER).toBe('s2u-dev-voice-report');
    expect(holding(/s2u-dev-voice-counters/)).toEqual(['voice/voiceCounters.ts']);
    expect(holding(/s2u-dev-voice-report/)).toEqual(['voice/voiceReport.ts']);
    expect(holding(/\bVOICE_COUNTERS_MARKER\b/)).toEqual(['voice/voiceCounters.ts']);
    expect(holding(/\bVOICE_REPORT_MARKER\b|\bVOICE_REPORT_PATH\b|\bvoiceReportBody\b|\bvoiceReportUrl\b|\bparseVoiceReport\b/)).toEqual(['voice/voiceReport.ts']);
    expect(holding(/\bpageCountersPanel\b/)).toEqual(['voice/voiceClient.ts', 'voice/voiceCounters.ts']);
    expect(holding(/\bpageVoiceReport\b/)).toEqual(['voice/voiceClient.ts', 'voice/voiceReport.ts']);
  });

  /**
   * VOICE-LATE-4 row 1 (research 226 §3.4): the report's new reads under the same gate. The reporter's own (the user
   * agent, the 20 ms tick, the frame loop, the window) are in `pageVoiceReport`'s page half; the decoder's per-packet
   * time is kept inside the codec only when the voice client hands it the timing clock, which it does under the literal
   * gate, and every use of the codec's timing state is under a literal `import.meta.env.DEV` of its own, so a `vite build`
   * folds the record and its class away. No new string marker: the built bundle's check below is unchanged.
   */
  it("VOICE-LATE-4: the decoder's timing handed only under the literal gate, kept only under it, the reporter's new reads in its page half", () => {
    const client = src('voice/voiceClient.ts');
    expect(client).toMatch(/ = import\.meta\.en[v]\.DEV \? \{ now: clock, on: \(\) => reporter !== null \} : undefined;/);
    const codec = src('voice/voiceCodec.ts');
    const uses = codec.split(/\r?\n/).filter((l) => /\bthis\.timed\b/.test(l) && !/^\s*(?:\*|\/\/|\/\*\*|private )/.test(l));
    expect(uses.length).toBeGreaterThanOrEqual(4);                   // made, at the submit, at the output, at the read
    for (const l of uses) expect(l, l.trim()).toMatch(/import\.meta\.en[v]\.DEV/);
    expect(holding(/\bTimedDecode\b/)).toEqual(['voice/voiceCodec.ts']);
    expect(holding(/\bVOICE_REPORT_LAG_TICK_MS\b|\bvoiceReportAgent\b|\bvoiceReportView\b|\bpageFrames\b/)).toEqual(['voice/voiceReport.ts']);
  });
});

/**
 * LATER 62 (`CLOSE_REPORT_ADAPTATION`, the review's F1): the close report is a development build's only -- the front end
 * makes the reporter only under the literal `import.meta.env.DEV`, and nothing else names its page half -- held on the
 * sources here and on a build of this tree below.
 */
describe('the close report is a development build only (LATER 62)', () => {
  const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(dir, e.name)) : e.name.endsWith('.ts') ? [resolve(dir, e.name)] : []);
  const root = resolve(here, '../src');
  const sources = walk(root).map((f) => ({ f: f.slice(root.length + 1).split(/[\\/]/).join('/'), text: readFileSync(f, 'utf-8') }));
  const holding = (needle: RegExp): string[] => sources.filter((s) => needle.test(s.text)).map((s) => s.f).sort();

  it('the front end makes the reporter only under a literal import.meta.env.DEV; nothing else names its page half or its marker', () => {
    const front = src('frontEnd.ts');
    expect(front).toMatch(/ = import\.meta\.en[v]\.DEV \? pageCloseReport\(\) : null;/);
    expect(front.match(/\bpageCloseReport\b/g)).toHaveLength(2);                // its import and the gate
    expect(CLOSE_REPORT_MARKER).toBe('s2u-dev-close-report');
    expect(holding(/s2u-dev-close-report/)).toEqual(['net/closeReport.ts']);
    expect(holding(/\bpageCloseReport\b/)).toEqual(['frontEnd.ts', 'net/closeReport.ts']);
    expect(holding(/\bCLOSE_REPORT_MARKER\b|\bcloseReportBody\b|\bcloseReportUrl\b/)).toEqual(['net/closeReport.ts']);
  });
});

describe.skipIf(!dist.built)(builtTitle('the built viewer has no close report (LATER 62)', dist), () => {
  it("neither its marker nor its route in dist/viewer/assets/*.js", () => {
    expect(js).not.toContain(CLOSE_REPORT_MARKER);
    expect(js).not.toContain(CLOSE_REPORT_PATH);
  });
});

describe.skipIf(!dist.built)(builtTitle('the built viewer has no voice counters and no posted report (VOICE-LATE-2, VOICE-LATE-3)', dist), () => {
  it("neither marker, nor the report's route, in dist/viewer/assets/*.js", () => {
    expect(js).not.toContain(VOICE_COUNTERS_MARKER);
    expect(js).not.toContain(VOICE_REPORT_MARKER);
    expect(js).not.toContain(VOICE_REPORT_PATH);
  });
});

describe.skipIf(!dist.built)(builtTitle('the built viewer has no keyboard path (OT.R29)', dist), () => {
  it('no marker of the local-only keyboard path, and no keyboard note, in dist/viewer/assets/*.js', () => {
    expect(js).not.toContain('keyboard-local-testing-ot-r29');
    expect(js).not.toContain('Keyboard: local testing only');
  });
  it("no keyboard site at all (the owner chose Everywhere): none of the gated sites' markers", () => {
    expect(js).not.toContain('s2u-keyboard-site');
    for (const site of KEYBOARD_SITES) expect(js, site).not.toContain(site);
  });
  it('no voice talk key (V in the round, R in the menus; `src/voice/headset.ts`): its marker absent', () => {
    expect(js).not.toContain('s2u-kb-voice');
  });
  it("no mouse look either (OT.R38 / H115, Controller only): no mouse site's marker (`src/mouseTesting.ts`)", () => {
    expect(js).not.toContain('s2u-mouse-site');
    for (const site of MOUSE_SITES) expect(js, site).not.toContain(site);
    // OT.R68 (the owner, 2026-10-21): the forge editor asks the pointer lock in every build (`src/forge/page.ts`
    // `lockMouse`, on a right-click and at the Walk) -- the forge's chunk is the one with its docks' class. RB-8 (OT.R114,
    // RB.R4): the test room's camera asks it too, under its `kbm` predicate (`src/camera.ts`), in the chunk that carries
    // the camera's kbm lock name (`KBM_POINTER_LOCK_SITE`); no other chunk asks it. Was: the forge's alone (OT.R68), and
    // before that none at all (OT.R38).
    const asking = jsFiles.filter((t) => t.includes('requestPointerLock'));
    expect(asking.length, 'the pointer lock asked in more than two chunks').toBeLessThanOrEqual(2);
    expect(asking.every((t) => t.includes('fx-docks-off') || t.includes(KBM_POINTER_LOCK_SITE)), 'the pointer lock asked outside the forge editor and the kbm camera').toBe(true);
  });
  it('no match hook for the browser spec (MATCH_WINDOW_HOOK, `src/matchMount.ts`)', () => {
    expect(js).not.toContain(matchHook);
  });
  it("no test room developer panel (#332, a development import): neither its id in the js nor its rules in the css", () => {
    expect(js).not.toContain('dev-panel');                         // `src/devPanel.ts` and its keyboard site, folded away
    expect(css).not.toContain('dev-panel');                        // its rules ship in its own module's stylesheet, folded with it
  });
  it('the overlay ships (MU2-10, MU2.R4: a release feature over every page but the console) without its keyboard (OT.R29)', () => {
    expect(js).toContain('mu-overlay-frame');                     // its frame's class, set by the overlay's own module
    expect(css).toContain('mu-overlay-frame');
    expect(js).not.toContain('s2u-kb-chrome-keys');               // its F9 toggle's keyboard site, folded by import.meta.env.DEV
  });
});

/**
 * PARITY-1's exemptions (PAR-14..PAR-18; the plan's "What the sprint needs from the owner", PAR.R5: visible, never
 * silent), read off the sources so the unit suite holds them without a build. The front end's match (`src/matchMount.ts`)
 * is the release's: it mounts none of `/testroom`'s development tools -- the tactical map (PAR-15: the original's
 * multiplayer has none; `FRONT_END_CAPABILITIES.tacMap` stays off), the walk's teleport and the `?devmode` switch
 * (PAR-16), the playtest overlay and its report (PAR-14), the taunt editor. `/testroom`'s own development paths are a
 * release boundary too (PAR-16's acceptance: no release or demo teleport path): its teleport on the hook and its
 * playtest overlay sit behind the dev-tools switch alone (`src/source.ts` `devSwitches`' `tools`, main.ts's `DEV.tools`),
 * which a built page still reads -- not behind `import.meta.env.DEV`, which a build folds away as it does the keyboard's
 * and the match hook's. Of the words that turn the switch on, `?devtools` (as `?served` and `?flyok` for theirs) counts
 * only on a development build; the bare `?devmode` turns it on in every build, as before the split. That gap is held
 * below as an expected failure, the owner's row's to settle (H152, PAR-16); a green `it.fails` means a built page still
 * reaches them with `?devmode`.
 */
describe("PARITY-1's exemptions: the release's match holds no development tool (PAR-14..PAR-18)", () => {
  const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

  it("the front end's match mounts none of /testroom's development tools: no tactical map, no teleport, no ?devmode switch, no playtest overlay, no taunt editor (PAR-14, PAR-15, PAR-16)", () => {
    const mount = src('matchMount.ts');
    expect(mount).not.toMatch(/\bTacMap\b|from '\.\/tacMap'/);
    expect(mount).not.toMatch(/function teleport|\{ teleport \}|\bteleport[(:]/);       // code, not the comments that say why there is none
    expect(mount).not.toMatch(/\bdevMode\(|DEV_PARAM/);
    expect(mount).not.toMatch(/playtestReport|mountPlaytestOverlay/);
    expect(mount).not.toMatch(/tauntDevEditor/);
    expect(src('matchCore.ts')).toMatch(/export const FRONT_END_CAPABILITIES = Object\.freeze\(\{[^}]*\btacMap: false\b/);
  });

  it("the control: /testroom's taunt editor is folded by import.meta.env.DEV and the dev-tools switch, which ?devmode turns on (the form the gap below is held against)", () => {
    expect(src('main.ts')).toMatch(/const DEV = devSwitches\(SEARCH\)/);
    expect(src('main.ts')).toMatch(/if \(import\.meta\.en[v]\.DEV && DEV\.tools\) void import\('\.\/tauntDevEditor'\)/);
  });

  // The gap alone: the control above is its own test, so a change to the taunt editor's line fails there and cannot keep
  // this expected failure green for the wrong reason.
  it.fails("/testroom's teleport (the hook's) and its playtest overlay are folded by import.meta.env.DEV, as the taunt editor is, so no built page reaches them whatever its URL (PAR-16's acceptance; PAR-14)", () => {
    const main = src('main.ts');
    expect(main).toMatch(/\.\.\.\(import\.meta\.en[v]\.DEV && DEV\.tools \? \{\n\s+teleport,/);
    expect(main).toMatch(/if \(import\.meta\.en[v]\.DEV && DEV\.tools\) \{\n\s+void import\('\.\/playtestReport'\)/);
  });

  // The gap's present form, so the expected failure above fails for the gap and not for a line main.ts no longer has (the
  // PR #333 review: it once matched a `devMode(SEARCH)` the split had replaced). Gating both sites behind
  // import.meta.env.DEV flips the test above and fails this one: the two are settled together.
  it("the gap as main.ts has it today: the teleport and the playtest overlay behind DEV.tools alone (H152, PAR-16)", () => {
    const main = src('main.ts');
    // #427 (B136) put its dev-only kill and action-pick log beside the teleport, behind the same switch
    expect(main).toMatch(/\n\s+\.\.\.\(DEV\.tools \? \{\n\s+teleport,\n\s+kill: /);
    expect(main).toMatch(/\nif \(DEV\.tools\) \{\n\s+void import\('\.\/playtestReport'\)/);
  });
});
