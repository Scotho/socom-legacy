// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { KEYBOARD_SITES } from '../src/keyboardTesting';
import { MenuPageInput } from '../src/menuInput';
import { SoftKeyboardKeys } from '../src/softKeyboardKeys';
import { TauntEditor } from '../src/tauntEditor';
import { FlyCamera } from '../src/camera';
import { WalkMode } from '../src/walk';
import { ScoreboardKeys } from '../src/scoreboardKeys';
import { attachRoundTextKeys, RoundTextLine } from '../src/roundTextLine';
import { bootConsole } from '../src/console/app';
import { sampleAdapters } from '../src/console/sampleAdapters';
import { HOME_CATEGORY } from '../src/console/state';
import { mountShell } from './console/shell';

/**
 * OT.R29 and its clarification (the owner, 2026-10-04, asked "Should the keyboard be removed from release and demo
 * builds everywhere?", chose "Everywhere"): every keyboard input of the game -- the setup page, the front end's menus
 * and soft keyboard, the match's controls and hotkeys -- is attached only under a literal `import.meta.env.DEV`, which
 * every `vite build` folds to false and drops (`test/build_keyboard.test.ts` greps the build for each site's marker).
 * What stays is not game input: the page's own accessibility keys (Escape closing a tooltip, a popover or a binding
 * capture; the Controls tabs' arrows), the audio unlock's gesture, a key clearing the pad's focus ring, and the
 * playtest room's instruments (its Mark key and its input heartbeat). Since OT.R62 (the owner, 2026-10-17) one player's
 * key besides: Escape closing the console's open popup, in every build (`console/input.ts`, MODAL-CLOSE). The launcher's
 * START is Craig's amendment of OT.R29 (2026-10-20: the launcher is excluded): Enter, Space, o and p, which also mark the
 * keyboard, on every build including a release (`console/input.ts`). The keymap, and
 * in-game controls, stay under the gate.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
// `voice/` since SVC-22b (web sprint 20): the talk keys (`voice/headset.ts`, the `s2u-kb-voice` site) live there.
// `forge/` since FG.R9 (OT.R52): the forge's shortcuts (`forge/page.ts`, the `s2u-kb-forge` site).
// `modern/` since LATER 86 (the console batch 2, 2026-10-17): the modern tree -- the overlay, the dialogs, the replay
// viewer the console's Watch mounts -- read with its subfolders (it has them; the three above are flat).
const tree = (d: string): string[] => readdirSync(resolve(SRC, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(`${d}/${e.name}`) : [`${d}/${e.name}`]));
// `console/` since CX-28 (2026-10-18), with its subfolders: MODAL-CLOSE read `console/input.ts` alone, so the adapters'
// key listeners (`adapters/replays.ts`' release stoppers, `adapters/index.ts`' keyboard-seen mark) went unread.
const files = [...readdirSync(SRC), ...['net', 'voice', 'forge'].flatMap((d) => readdirSync(resolve(SRC, d)).map((f) => `${d}/${f}`)), ...tree('modern'), ...tree('console')].filter((f) => f.endsWith('.ts'));
/**
 * A line that attaches a key listener: `addEventListener('keydown' | 'keyup', ...)`; since CX-28 a helper's
 * `name(target, 'keydown' | 'keyup', ...)` too -- the console's `on()` (`console/input.ts`) attaches its keymap and its
 * field keys that way, which the first form never saw; and the audio unlock's gesture list.
 */
const keyListener = (line: string): boolean =>
  /addEventListener\??\.?\(\s*'key(down|up)'/.test(line) || /\b[A-Za-z_$][\w$]*\(\s*[\w$.]+\s*,\s*'key(down|up)'/.test(line) || /'keydown', 'touchend'/.test(line);
/** The keyboard listeners that are not game input, by file and a fragment of their line. */
const NOT_GAME_INPUT: readonly [string, string][] = [
  ['audio.ts', "'keydown', 'touchend'"],                         // the audio unlock: any gesture
  // FUI-23 (browser adaptation): the Forge rules cues' audio-unlock gesture list, the same events `audio.ts` listens to; it
  // asks a held cue's output to run and reads no key as input (OT.R29's exemption, as `audio.ts` has).
  ['forge/rulesCues.ts', "'keydown', 'touchend'"],
  // The Forge's own accessibility keys (browser adaptations): Enter or Space on the axis widget's end, the arrows on a dock's
  // resize handle, Escape closing the asset view's, Play's and Select's popovers, Escape cancelling a scrub's drag.
  ['forge/page.ts', "end.addEventListener('keydown', (event) => {"],
  ['forge/page.ts', "handle.addEventListener('keydown', (event) => {"],
  ['forge/page.ts', "doc.addEventListener('keydown', event => {"],
  ['forge/page.ts', "doc.addEventListener('keydown', (e) => {"],
  ['forge/scrub.ts', "doc.addEventListener('keydown', onKey, true);"],
  ['startupNavigation.ts', 'this.clearFocus()'],                 // a key clears the pad's focus ring
  ['ui.ts', "pop.querySelector('#controls-tabs')?.addEventListener('keydown'"], // the tabs' arrows (twice)
  ['ui.ts', "button.addEventListener('keydown'"],                  // a tab's arrow keys
  ['ui.ts', 'Escape closes the popover'],                          // the Controls popover's Escape
  // The playtest room's instruments (research 241 §1; ?devmode&playtest= only): the Mark key and the input heartbeat
  // to the session service's inactivity clock. Neither reaches the game.
  ['playtestSession.ts', "doc.addEventListener('keydown', onKey)"],   // F8 marks the moment
  ['playtestSession.ts', "doc.addEventListener('keydown', onInput)"], // a key is human input: the heartbeat
  // The test room's bar map dropdown (TR-1, the test room's maps plan TR.R2): a native <select> whose own keys move it;
  // these mark the key's task so a closed select's key-driven change is undone (no reload), and read no key as input.
  ['testroomMapBar.ts', "this.select.addEventListener('keydown'"],  // marks a key that moves the closed select
  ['testroomMapBar.ts', "this.select.addEventListener('keyup'"],    // clears that mark
  // Forge's native Settings range (FDL-1, browser adaptation): releasing a range key activates its selected endpoint
  // when Original's thumb already sits there and the browser emits no change. Writes layout Settings only, no game input.
  ['forge/page.ts', "lightIn.addEventListener('keyup'"],
  // KEYBOARD-WHISPER (OT.R48, the owner 2026-10-12: "keyboard in round is acceptable"; research 266 §3.9): the online
  // round's USB-keyboard text line, the original's own text entry (`FUN_002c6c70`) -- a player's, in every build, as the
  // soft keyboard's text entry is; never a game control (`ROUND_TEXT_KEYS_READING`) and no `keyboardSite`.
  ['roundTextLine.ts', "target.addEventListener('keydown', down, true)"],
  // LATER 86: the modern tree's focus and accessibility keys, one by one (file :line at 2026-10-17, then the reason). A
  // browser adaptation's own controls; none reaches the game.
  ['modern/overlay/index.ts', "root.addEventListener('keydown', onKey)"],        // :329 the overlay's Tab trap (`trapTab`)
  ['modern/report/index.ts', "root.addEventListener('keydown', onKey)"],         // :244 the Report dialog's Tab trap and Escape (close)
  // The touch layout editor (chris/mobile-layout-settings, the plan 2026-10-17-mobile-layout-settings.md; a browser
  // adaptation): its own dialog's arrow keys, which move a touch button's marker; none reaches the game. (Its Escape is
  // OT.R62's, below.)
  ['mobileLayoutEditor.ts', "el.addEventListener('keydown', (e) => {"],         // :112 the arrow keys nudge the focused touch button's marker
  // CX-28 (2026-10-18): the console's key listeners of every build that are not a game control (file :line, then the
  // reason). The real fields -- the sign-in's, Search's and the Profile's -- type natively in every build (CX.R6), as the
  // soft keyboard's text entry does; and the replay viewer's layer, in a release build, takes keys away, reading none.
  ['console/input.ts', "on(doc, 'keydown', onFieldKey, true)"],            // :174 a printable key moves the focus into the open dialog's field
  ['console/input.ts', "on(doc, 'keydown', onFieldEnter)"],                // :194 Enter in the sign-in's fields sends it (CX-24)
  // LR-30 (LR.R24, the owner 2026-10-27: "wasd ... arrow keys for menu nav", "yes keyboard menu nav can reach release builds"):
  // the launcher's menu keys, every build -- the console's menus only (the overlay over a game reads none), never a game key.
  ['console/input.ts', "on(win, 'keydown', onMenuKey)"],
  ['console/input.ts', "on(doc, 'keydown', onAccountKeys, true)"],          // browser account disclosure: native activation/accessibility; underlying keys stand down
  ['console/adapters/replays.ts', "layer.addEventListener('keydown', stopAll, true)"], // :249 a release build's keys stop at the viewer's layer
  ['console/adapters/replays.ts', "layer.addEventListener('keyup', stopAll, true)"],   // :250 the same at keyup (a button's Space clicks there)
  ['console/adapters/replays.ts', "layer.addEventListener('keydown', stopTaken)"],     // :251 a key the viewer took goes no further
  // CX-25 retired `modern/index.ts`'s sign-in panel Escape and `modern/settings/index.ts`'s three (the slider's keys, a
  // category's Escape, the list's roving focus) with the modern shell; CX-26 retired `modern/dialog.ts`'s Tab trap,
  // `modern/logoff.ts`'s and `modern/agreement/agreement.ts`'s two arrow keys, `modern/osk.ts`'s last-input mark and
  // `startupSettingsView.ts`'s binding-listen Escape with their modules' remainder; the case below holds that no entry
  // outlives its line.
];

/**
 * MODAL-CLOSE (the console launcher plan, 2026-10-17): OT.R62's group -- a key a player reads in a release build, not an
 * accessibility key nor an instrument: Escape closing a popup. MISSION OT.R62 (the owner: "esc in release builds: fine
 * to add for players") narrows OT.R29 for this one key and this one act; every other key stays under OT.R29.
 */
const OT_R62_ESCAPE: readonly [string, string][] = [
  ['console/input.ts', "doc.addEventListener('keydown', onEscape, true)"],      // :151 OT.R62: Escape closes a popup in every build
  ['mobileLayoutEditor.ts', "d.addEventListener('keydown', (e) => { if (e.key === 'Escape')"], // :143 OT.R62: Escape closes the touch layout editor, as Cancel
];

/**
 * The launcher's START on every build (OT.R29 amended 2026-10-20 by Craig: the launcher is excluded). The keymap stays
 * folded away; these two listeners are the page's own START, not a game control. `console/input.ts` presses START
 * (Enter, Space, o, p) when the keymap is not attached, and marks the keyboard with it: no other key marks it (the
 * merge controller's call on #400's invite question, 2026-10-20).
 */
const LAUNCHER_START: readonly [string, string][] = [
  ['console/input.ts', "on(win, 'keydown', onLauncherStart)"],
];

/**
 * OT.R68 (the owner, 2026-10-21: keyboard and mouse for everything in the forge's creation UI, not once its matches have
 * started): the forge editor's keys in every build -- its map (`forge/page.ts`, `forge/keys.ts`), its camera's and its
 * Walk's, which attach under `DEV || forgeKbm` (only `forge/page.ts` passes `forgeKbm`, `test/forgeKbm.test.ts`). Every
 * other camera and walk -- /testroom's, the match's -- keeps the literal gate. Their markers stay under it.
 */
const OT_R68_FORGE: readonly [string, string][] = [
  ['forge/page.ts', "globalThis.addEventListener('keydown', (e) => {"],          // the editor's map, every build
  ['forge/page.ts', "globalThis.addEventListener('keydown', onLeaseKey);"],       // R3-A: the focus lease's exit, every build
  // R4 (dot's FCW-S1-ASSETS, b293f72f7) named the asset preview's keys here; FUI-22 (D1) made the preview a tooltip,
  // which takes no keys, so the line went and its entry with it (the page's Escape hides the tooltip, `forge/keys.ts`).
  ['camera.ts', "globalThis.addEventListener('keydown', this.onKeyDown)"],        // under `DEV || this.forgeKbm`
  ['camera.ts', "globalThis.addEventListener('keyup', this.onKeyUp)"],
  ['walk.ts', "target.addEventListener('keydown', this.onKey as EventListener)"], // under `DEV || this.camera.forgeKbm`
  ['walk.ts', "target.addEventListener('keyup', this.onKeyUp as EventListener)"],
];

// LATER 86's two findings (the replay transport's playback keys, `replays/transport.ts`, and the viewer's Escape for Back,
// `replays/view.ts`) were gated only by their caller's `keys` option; the seat's call (the owner's rule, 2026-10-04:
// players use a controller only, the keyboard a local testing option compiled out of release) put a literal
// `import.meta.env.DEV` at both sites, so the gate holds them with no findings list.

describe('every game keyboard listener is a development build\'s only (OT.R29, "Everywhere")', () => {
  it('each addEventListener of a key event sits under import.meta.env.DEV, or is listed as not game input', () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = readFileSync(resolve(SRC, f), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (!keyListener(line)) return;
        if ([...NOT_GAME_INPUT, ...OT_R62_ESCAPE, ...LAUNCHER_START, ...OT_R68_FORGE].some(([file, frag]) => f === file && line.includes(frag))) return;
        if (lines.slice(Math.max(0, i - 14), i + 1).some((l) => l.includes('import.meta.env.DEV'))) return;
        bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it('CX-28: a helper\'s key listener is a listener -- the console\'s on() form is caught, as addEventListener is', () => {
    for (const l of ["if (opts.keymap) on(win, 'keydown', onKey);", "  on(doc, 'keyup', (ev) => {", "layer.addEventListener('keydown', stopAll, true);", "win.addEventListener?.('keyup', f)"]) expect(keyListener(l), l).toBe(true);
    for (const l of ["on(doc, 'pointerdown', f);", "win.addEventListener('focus', onFocus);", "const k = 'keydown';", "emit('keydown')"]) expect(keyListener(l), l).toBe(false);
    for (const f of ['console/input.ts', 'console/adapters/replays.ts', 'console/adapters/index.ts']) expect(files).toContain(f);
  });
  it('LATER 86: the folder list takes src/modern/ with its subfolders, and every modern exemption names one live listener line', () => {
    expect(files).toContain('modern/dialog.ts');
    expect(files).toContain('modern/agreement/agreement.ts');
    expect(files).toContain('modern/overlay/index.ts');
    const modern = NOT_GAME_INPUT.filter(([file]) => file.startsWith('modern/') || file.startsWith('console/'));   // CX-28: the console's too
    expect(modern.length).toBeGreaterThan(0);
    for (const [file, frag] of modern) {
      expect(files, file).toContain(file);
      const hits = readFileSync(resolve(SRC, file), 'utf-8').split('\n').filter((l) => l.includes(frag) && keyListener(l));
      expect(hits.length, `${file}: ${frag}`).toBe(1);   // a removed or moved listener takes its entry with it
    }
  });
  it('MODAL-CLOSE: OT.R62\'s group -- a player\'s Escape closing a popup in every build -- is the console\'s and the touch layout editor\'s, each on its live line', () => {
    expect(OT_R62_ESCAPE.map(([file, frag]) => `${file} ${frag}`)).toEqual([
      "console/input.ts doc.addEventListener('keydown', onEscape, true)",
      "mobileLayoutEditor.ts d.addEventListener('keydown', (e) => { if (e.key === 'Escape')",
    ]);
    for (const [file, frag] of OT_R62_ESCAPE) {
      expect(NOT_GAME_INPUT.some(([f, g]) => f === file && g === frag), `${file}: in OT.R62's group, not the accessibility keys'`).toBe(false);
      const src = readFileSync(resolve(SRC, file), 'utf-8').split('\n');
      const at = src.flatMap((l, i) => (l.includes(frag) ? [i] : []));
      expect(at, file).toHaveLength(1);
      expect(src.slice(Math.max(0, at[0]! - 14), at[0]! + 1).some((l) => l.includes('import.meta.env.DEV')), `${file}: every build's`).toBe(false);
    }
    // The editor's handler reads Escape alone (its arrow nudge is its own listener, the accessibility group's).
    const editor = readFileSync(resolve(SRC, 'mobileLayoutEditor.ts'), 'utf-8').split('\n').find((l) => l.includes(OT_R62_ESCAPE[1]![1]))!;
    expect(editor).toMatch(/\{ if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); finish\(\); \} \}\);$/);
    expect(files).toContain('console/input.ts');
    const named = OT_R62_ESCAPE.filter(([file]) => file.startsWith('console/'));
    expect(named.map(([file, frag]) => `${file} ${frag}`)).toEqual(["console/input.ts doc.addEventListener('keydown', onEscape, true)"]);
    const lines = readFileSync(resolve(SRC, 'console/input.ts'), 'utf-8').split('\n');
    const at = lines.flatMap((l, i) => (l.includes(named[0]![1]) ? [i] : []));
    expect(at).toHaveLength(1);
    // Outside the keymap's gate (it is every build's), and its handler reads Escape alone, then only while a popup is open.
    expect(lines.slice(Math.max(0, at[0]! - 14), at[0]! + 1).some((l) => l.includes('import.meta.env.DEV'))).toBe(false);
    const handler = lines.slice(lines.findIndex((l) => l.includes('const onEscape = ')), at[0]!).join('\n');
    expect(handler).toMatch(/if \(e\.key !== 'Escape' \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey \|\| e\.isComposing\) return;/);
    expect(handler).toMatch(/if \(!ctl\.popupOpen\(\)\) return;/);
    expect(handler).not.toMatch(/keyboardSite\(|KEYMAP/);
  });
  it('OT.R68: the forge editor\'s group names live lines; the camera\'s and the walk\'s sit under the gate or the forge\'s opt-in', () => {
    const devFold = 'import.meta.en' + 'v.DEV';                       // split: see the launcher's case below
    for (const [file, frag] of OT_R68_FORGE) {
      const lines = readFileSync(resolve(SRC, file), 'utf-8').split('\n');
      const at = lines.flatMap((l, i) => (l.includes(frag) && keyListener(l) ? [i] : []));
      expect(at, `${file}: ${frag}`).toHaveLength(1);
      if (file.startsWith('forge/')) continue;                      // the forge creation UI's own (page, R4 the asset preview)
      const before = lines.slice(Math.max(0, at[0]! - 2), at[0]!);
      expect(before.some((l) => l.includes(`${devFold} || this.forgeKbm`) || l.includes(`${devFold} || this.camera.forgeKbm`)), `${file}: ${frag}`).toBe(true);
    }
  });
  it('the launcher START listeners are live on every build', () => {
    // The registration sits outside the development-build fold. The token is split so this file does not carry the
    // leak check's key-file name (a backslash before it is not a word character, so a regex would be a hit).
    const devFold = 'import.meta.en' + 'v.DEV';
    for (const [file, frag] of LAUNCHER_START) {
      const lines = readFileSync(resolve(SRC, file), 'utf-8').split('\n');
      const at = lines.flatMap((l, i) => (l.includes(frag) && keyListener(l) ? [i] : []));
      expect(at, `${file}: ${frag}`).toHaveLength(1);
      const around = lines.slice(Math.max(0, at[0]! - 3), at[0]!);
      expect(around.some((l) => l.includes(devFold)), file).toBe(false);
    }
  });
  it('each gated site names its marker for the build test', () => {
    const all = files.map((f) => readFileSync(resolve(SRC, f), 'utf-8')).join('\n');
    for (const site of KEYBOARD_SITES) expect(all, site).toContain(`keyboardSite('${site}')`);
  });
  it('the voice talk keys are a gated site of their own (SVC-22b; H87 VOICE-KEY: V in the round, R in the menus)', () => {
    expect(KEYBOARD_SITES).toContain('s2u-kb-voice');
    expect(files).toContain('voice/headset.ts');
  });
});

describe('a release build reads no key (vi.stubEnv DEV false)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const key = (target: EventTarget, code: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  };
  it('the menus: an arrow key reaches the menus in a development build, not in a release', () => {
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev);
      const page = new MenuPageInput();
      const canvas = document.createElement('canvas'); document.body.append(canvas);
      const detach = page.attach({ tap: () => null }, canvas, window);
      key(document, 'ArrowDown');
      expect(page.read().down.size > 0, `DEV ${dev}`).toBe(dev);
      detach(); canvas.remove();
    }
  });
  it('the soft keyboard: physical typing is queued in a development build, not in a release', () => {
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev);
      const keys = new SoftKeyboardKeys();
      const detach = keys.attach(window, { isOpen: true } as never);
      key(window, 'KeyA');
      expect(keys.next() !== null, `DEV ${dev}`).toBe(dev);
      detach();
    }
  });
  it('explicit release text entry only queues USB typing while the original keyboard is open', () => {
    vi.stubEnv('DEV', false);
    const keys = new SoftKeyboardKeys(), state = { isOpen: false };
    const detach = keys.attach(window, state, true);
    key(window, 'KeyA'); expect(keys.next()).toBeNull();
    state.isOpen = true;
    key(window, 'KeyA'); expect(keys.next()).toMatchObject({ hid: 4 });
    key(window, 'ArrowUp'); expect(keys.next()).toBeNull();
    state.isOpen = false;
    key(window, 'KeyA'); expect(keys.next()).toBeNull();
    detach();
  });
  it('KEYBOARD-WHISPER (OT.R48): the online round text line reads keys in a release build only in an online round, and only the keys its USB map acts on', () => {
    vi.stubEnv('DEV', false);
    const shown: string[] = [];
    const line = new RoundTextLine({ hud: { postMessage: () => undefined, setTextLine: (t) => { shown.push(t); }, textLineText: () => shown.at(-1) ?? '', roundStarts: () => 0 }, whisper: () => undefined, actors: () => [], sender: () => null });
    let online = false;
    const detach = attachRoundTextKeys(window, line, () => online);
    key(window, 'KeyA'); expect(line.text).toBe('');
    online = true;
    key(window, 'KeyA'); expect(line.text).toBe('a');
    for (const code of ['ArrowUp', 'Tab', 'F1', 'NumpadEnter']) { key(window, code); expect(line.text, code).toBe('a'); }
    detach();
    key(window, 'KeyB'); expect(line.text).toBe('a');
  });
  it('OT.R62: the console launcher in a release build reads Escape only while a popup is open; the dev keymap stays unread, the menu keys act (MODAL-CLOSE, LR-30)', () => {
    vi.stubEnv('DEV', false);
    mountShell(document);
    const page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const ctl = page.ctl;
    const press = (key: string): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      return e;
    };
    // Enter, Space, o and p press START (`launcherStart.test.ts`); LR-30 (LR.R24) adds the menu keys (arrows, WASD, Escape /
    // Backspace as back: `lr30Keys.test.ts`). The keymap's other keys stay unread -- the game's keys are OT.R29's.
    for (const k of ['t', 'q', 'f', 'z']) {
      expect(press(k).defaultPrevented, k).toBe(false);
      expect([ctl.S.cat, ctl.S.item[HOME_CATEGORY], ctl.S.overlay, ctl.S.start], k).toEqual([HOME_CATEGORY, 0, null, 'idle']);
    }
    for (const k of ['Backspace', 'Escape']) {                       // back on Home: read, nothing to leave
      expect(press(k).defaultPrevented, k).toBe(true);
      expect([ctl.S.cat, ctl.S.item[HOME_CATEGORY], ctl.S.overlay, ctl.S.start], k).toEqual([HOME_CATEGORY, 0, null, 'idle']);
    }
    for (const k of ['ArrowDown', 'ArrowUp']) {
      expect(press(k).defaultPrevented, k).toBe(true);
      expect([ctl.S.cat, ctl.S.overlay, ctl.S.start], k).toEqual([HOME_CATEGORY, null, 'idle']);
    }
    ctl.S.item[HOME_CATEGORY] = 0;
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(ctl.S.cat).toBe(HOME_CATEGORY + 1);
    press('ArrowLeft');
    expect(ctl.S.cat).toBe(HOME_CATEGORY);
    ctl.openSignIn();
    ctl.render();
    for (const k of ['ArrowRight', 'Enter', 'Backspace']) { press(k); expect([ctl.S.overlay, ctl.S.si.persona], k).toEqual(['signin', 0]); }
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(ctl.S.overlay).toBeNull();
    page.dispose();
    document.body.replaceChildren();
  });
  it('the standalone taunt adapter cannot queue keys outside the text field or use modified gameplay chords', () => {
    const editor = new TauntEditor(), state = { isOpen: false };
    editor.session = { keyboard: { keyboard: state } } as never;
    const queue = (editor as unknown as { keys: unknown[] }).keys;
    editor.key(new KeyboardEvent('keydown', { code: 'KeyA' })); expect(queue).toEqual([]);
    state.isOpen = true;
    editor.key(new KeyboardEvent('keydown', { code: 'ArrowUp' })); expect(queue).toEqual([]);
    editor.key(new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true })); expect(queue).toEqual([]);
    editor.key(new KeyboardEvent('keydown', { code: 'KeyA' })); expect(queue).toEqual([{ hid: 4, shift: false, capsLamp: false }]);
  });
  it('a release build\'s only key listener is the soft keyboard\'s text entry (beside the online round text line, OT.R48): the match\'s keys add none, and a key the original USB path does not take is not queued there (research 301 §6; the padFrame case: test/matchMount.test.ts, OT.R29)', () => {
    vi.stubEnv('DEV', false);
    const added: string[] = [];
    const target = new EventTarget();
    const spy = vi.spyOn(target, 'addEventListener').mockImplementation(((type: string) => { added.push(type); }) as typeof target.addEventListener);
    const walk = new WalkMode(new FlyCamera(document.createElement('canvas')));
    walk.bindKey(target);
    new ScoreboardKeys(() => true).bindKey(target);
    expect(added.filter((t) => t.startsWith('key'))).toEqual([]);   // the match's keys: none in a release
    spy.mockRestore();
    const keys = new SoftKeyboardKeys(), state = { isOpen: true };
    const detach = keys.attach(window, state, true);
    for (const code of ['ArrowUp', 'ArrowDown', 'F1', 'PageDown']) { key(window, code); expect(keys.next(), code).toBeNull(); }
    detach();
    walk.unbindKey();
  });
});
