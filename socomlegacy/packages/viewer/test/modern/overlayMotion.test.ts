// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_POPUP_SOUND } from '@s2u/sound';
import {
  mountOverlay, mountPageOverlay, overlayPageReads, overlayRamp, OVERLAY_BLUR_OUT_DELAY_MS_ADAPTATION, OVERLAY_CLOSE_MS_ADAPTATION, OVERLAY_EASE_IN_ADAPTATION,
  OVERLAY_EASE_OUT_ADAPTATION, OVERLAY_OPEN_MS_ADAPTATION, OVERLAY_PANEL_IN_MS_ADAPTATION, OVERLAY_PANEL_OUT_MS_ADAPTATION, OVERLAY_REDUCED_MS_ADAPTATION,
  OVERLAY_RISE_PX_ADAPTATION, OVERLAY_ROUND_CUE_VOLUME_ADAPTATION, OVERLAY_STAGGER_MS_ADAPTATION, type Overlay, type OverlayCues, type OverlayOptions,
} from '../../src/modern/overlay/index';
import type { UiSoundCues } from '@s2u/ui';
import { FORGE_MATCH_CLASS } from '../../src/modern/overlay/page';
import { setForgeMatchSounds } from '../../src/forge/matchState';
import type { PadLike } from '../../src/gamepad';
import { fakeLauncher, fakeSession } from './lobbies/fixtures';

/**
 * OVERLAY-CONSOLE, MISSION's OT.R60 (e) (the owner, 2026-10-16: "ensure we add a sound effect for the transition. pick
 * one from the base game that seems appropriate. Also that there is a nice, highly polished transition between the
 * states inspired by the PS3 but adjusted to your best judgement"): the overlay's open plays the menus' `PopUpDialog`
 * cue (`.METAL`, `UiSoundCues.popup`) and its close their `SwitchMenu PREVIOUS_SCREEN` cue (`.BACK`, `back`) through the
 * page's game audio, silent with no disc audio loaded; its blur and dim ramp in while the console's panels rise and fade
 * in a stagger, the reverse a little faster on the close with the blur out last. The pad is the console's once the
 * open has completed and the game's once the close has (the game shadowed through it, MU2-11's held buttons kept); a
 * toggle mid-way reverses it. Every duration and easing a named product-track constant (`src/modern/overlay/motion.ts`).
 * A browser adaptation with no original (OT.R28). The completion is a timer at the constants: fake timers drive it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, '../..');
const offline = (async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
const CROSS = 0, DOWN = 13, HOME = 16;
const OPEN_DONE = overlayRamp('open', 0, false).ms;
const CLOSE_DONE = overlayRamp('closed', 1, false).ms;

interface FakePad extends PadLike { buttons: { pressed: boolean; value: number; touched: boolean }[]; axes: number[] }
const fakePad = (): FakePad => ({
  id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
} as FakePad);

let overlay: Overlay | null = null;
let pad: FakePad;
let nav: { getGamepads(): ArrayLike<PadLike | null> };
let t = 1000;
let round = false;
const cues = (): OverlayCues & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    popup: () => { calls.push('popup'); return { kind: 'no-name' }; },
    back: () => { calls.push('back'); return { kind: 'no-name' }; },
    play: (name, args, source) => { calls.push(`play ${name} ${args.volume} ${source}`); return { kind: 'no-name' }; },
  };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', offline);
  document.body.innerHTML = '<canvas id="front-end"></canvas>';
  pad = fakePad();
  nav = { getGamepads: () => [pad] };
  t = 1000;
  round = false;
  localStorage.clear();
});
afterEach(() => { overlay?.dispose(); overlay = null; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; localStorage.clear(); });

const mount = (o: Partial<OverlayOptions> = {}): Overlay =>
  (overlay = mountOverlay(document, { nav, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, now: () => t, roundRunning: () => round, ...o }));
/** One frame: the pad holds `down`, the overlay polls; `ms` of time pass first (the transition's timers with it). */
const step = (down: number[] = [], ms = 16): void => {
  t += ms;
  vi.advanceTimersByTime(ms);
  pad.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; b.touched = b.pressed; });
  overlay!.poll();
};
const gameDown = (): number[] => nav.getGamepads()[0]!.buttons.flatMap((b, i) => (b.pressed ? [i] : []));
const phase = (): string | undefined => overlay!.el?.dataset['phase'];
/** Opens by a Home press and lets go (two frames). */
const openByHome = (): void => { step(); step([HOME]); step(); };

describe('OT.R60 (e): the timings, each a named adaptation in one place', () => {
  it('the shape the merge controller gave: ~220 ms in with a ~25 ms stagger and an 8-16 px rise; the close faster, the blur out last', () => {
    expect(OVERLAY_OPEN_MS_ADAPTATION).toBeGreaterThanOrEqual(200);
    expect(OVERLAY_OPEN_MS_ADAPTATION).toBeLessThanOrEqual(250);
    expect(OVERLAY_PANEL_IN_MS_ADAPTATION).toBe(220);
    expect(OVERLAY_STAGGER_MS_ADAPTATION).toBeGreaterThanOrEqual(20);
    expect(OVERLAY_STAGGER_MS_ADAPTATION).toBeLessThanOrEqual(30);
    expect(OVERLAY_RISE_PX_ADAPTATION).toBeGreaterThanOrEqual(8);
    expect(OVERLAY_RISE_PX_ADAPTATION).toBeLessThanOrEqual(16);
    expect(OVERLAY_CLOSE_MS_ADAPTATION).toBeGreaterThanOrEqual(160);
    expect(OVERLAY_CLOSE_MS_ADAPTATION).toBeLessThanOrEqual(180);
    expect(OVERLAY_REDUCED_MS_ADAPTATION).toBeLessThan(OVERLAY_OPEN_MS_ADAPTATION);
    expect(OVERLAY_EASE_OUT_ADAPTATION).toMatch(/^cubic-bezier\(/);
    expect(OVERLAY_EASE_IN_ADAPTATION).toMatch(/^cubic-bezier\(/);
    expect(OPEN_DONE).toBe(OVERLAY_PANEL_IN_MS_ADAPTATION + 2 * OVERLAY_STAGGER_MS_ADAPTATION);   // the summary's end
    const close = overlayRamp('closed', 1, false);
    expect(close.ms).toBe(OVERLAY_CLOSE_MS_ADAPTATION);
    expect(close.vars['--mu-overlay-ramp-delay']).toBe(`${OVERLAY_BLUR_OUT_DELAY_MS_ADAPTATION}ms`);
    expect(OVERLAY_PANEL_OUT_MS_ADAPTATION + 2 * OVERLAY_STAGGER_MS_ADAPTATION).toBeLessThan(close.ms);   // the panels first, the blur last
    const src = readFileSync(resolve(VIEWER, 'src/modern/overlay/motion.ts'), 'utf8');
    for (const name of src.match(/export const (OVERLAY_[A-Z_]+)/g)!.map((m) => m.slice(13))) {
      if (name === 'OVERLAY_PANELS') continue;
      expect(name, 'a named adaptation').toMatch(/_ADAPTATION$/);
    }
  });

  it('the review\'s F6: the .BACK and .METAL volumes are cited where the note holds them (research 122 section 3, not 9)', () => {
    const src = readFileSync(resolve(VIEWER, 'src/modern/overlay/motion.ts'), 'utf8').replace(/\r?\n\s*\*\s*/g, ' ');   // the comment's lines joined
    expect(src).toContain('Vol 83 against `.METAL`\'s 115, research 122 §3');
    expect(src).not.toContain('research 122 §9');
    const note = readFileSync(resolve(VIEWER, '../../docs/research/122-the-ui-sounds.md'), 'utf8');
    const s3 = note.slice(note.indexOf('## 3. '), note.indexOf('## 4. '));
    expect(s3).toContain('.BACK 83');
    expect(s3).toContain('.METAL 115');
  });

  it('a reversal mid-way is in proportion to the way left: no jump, no lag', () => {
    const half = overlayRamp('closed', 0.5, false);
    expect(half.ms).toBe(Math.round(OVERLAY_CLOSE_MS_ADAPTATION * 0.5));
    expect(overlayRamp('open', 1, false).ms).toBe(0);
    expect(overlayRamp('open', 0.5, false).vars['--mu-ovp-stagger']).toBe(`${Math.round(OVERLAY_STAGGER_MS_ADAPTATION * 0.5)}ms`);
  });
});

describe('OT.R60 (e): the pad handed over at the ends of the transition', () => {
  it('the open: the console reads no press until the open has completed; the game reads the pad untouched throughout', () => {
    mount();
    openByHome();
    expect(overlay!.isOpen()).toBe(true);
    expect(phase()).toBe('opening');
    const S = overlay!.console()!.ctl.S;
    step([DOWN], 60);
    expect(gameDown()).toEqual([]);
    step([], 60);
    expect(S.item[S.cat]).toBe(0);                                   // mid-open: not the console's yet
    step([], OPEN_DONE);
    expect(phase()).toBe('open');
    step([DOWN]); step();
    expect(S.item[S.cat]).toBe(1);                                   // the console's now
    expect(gameDown()).toEqual([]);
  });

  it('the close: the game stays shadowed until the blur is gone; a button held at its end stays released to the game until let go', () => {
    mount();
    openByHome();
    step([], OPEN_DONE);
    step([HOME]);                                                    // closes
    expect(overlay!.isOpen()).toBe(false);
    expect(phase()).toBe('closing');
    step([CROSS], 60);
    expect(gameDown()).toEqual([]);                                  // mid-close: still shadowed
    expect(overlay!.console()).not.toBeNull();                       // still drawn
    step([CROSS], CLOSE_DONE);
    expect(phase()).toBe('closed');
    expect(overlay!.console()).toBeNull();
    expect(gameDown()).toEqual([]);                                  // held through the close's end: released to the game
    step();
    step([CROSS]);
    expect(gameDown()).toEqual([CROSS]);                             // a new press is the game's
  });

  it('a toggle mid-way reverses it from where it is: no remount, one cue for each way, then it completes the new way', () => {
    const c = cues();
    mount({ sounds: () => c });
    openByHome();
    const page = overlay!.console();
    step([], 84);                                                    // about a third of the open
    expect(phase()).toBe('opening');
    step([HOME]);                                                    // reversed: closing from where it was
    expect(phase()).toBe('closing');
    const ramp = parseInt(overlay!.el!.style.getPropertyValue('--mu-overlay-ramp-ms'), 10) + parseInt(overlay!.el!.style.getPropertyValue('--mu-overlay-ramp-delay'), 10);
    expect(ramp).toBeLessThan(OVERLAY_CLOSE_MS_ADAPTATION);           // in proportion: no full close from a third open
    expect(c.calls).toEqual(['popup', 'back']);
    step();
    step([HOME]);                                                    // reversed again, before the close completed
    expect(phase()).toBe('opening');
    expect(overlay!.console()).toBe(page);                           // nothing remounted
    expect(c.calls).toEqual(['popup', 'back', 'popup']);
    step([], OPEN_DONE);
    expect(phase()).toBe('open');
    expect(overlay!.isOpen()).toBe(true);
    expect(c.calls).toEqual(['popup', 'back', 'popup']);              // no cue at a completion
  });

  it('prefers-reduced-motion: an opacity fade only (no rise, no stagger) and a shorter ramp', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: (q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q }) });
    mount();
    openByHome();
    const inner = overlay!.el!.contentDocument!.documentElement.style;
    expect(inner.getPropertyValue('--mu-ovp-rise')).toBe('0px');
    expect(inner.getPropertyValue('--mu-ovp-stagger')).toBe('0ms');
    expect(overlay!.el!.style.getPropertyValue('--mu-overlay-ramp-ms')).toBe(`${OVERLAY_REDUCED_MS_ADAPTATION}ms`);
    step([], OVERLAY_REDUCED_MS_ADAPTATION - 32);
    expect(phase()).toBe('opening');
    step([], 32);
    expect(phase()).toBe('open');
    delete (window as { matchMedia?: unknown }).matchMedia;
  });
});

describe('OT.R60 (e): the cue, from the disc\'s menu sounds through the page\'s game audio', () => {
  it('once per open (PopUpDialog\'s .METAL, `popup`) and once per close (SwitchMenu PREVIOUS_SCREEN\'s .BACK, `back`)', () => {
    const c = cues();
    mount({ sounds: () => c });
    openByHome();
    step([], OPEN_DONE);
    expect(c.calls).toEqual(['popup']);
    step([HOME]); step([], CLOSE_DONE);
    expect(c.calls).toEqual(['popup', 'back']);
    overlay!.open(); overlay!.close();
    expect(c.calls).toEqual(['popup', 'back', 'popup', 'back']);
  });

  it('in a running round the open\'s cue is lighter (.METAL at the round volume); the close\'s .BACK as the menus play it', () => {
    const c = cues();
    round = true;
    mount({ sounds: () => c });
    openByHome();
    step([], OPEN_DONE);
    step([HOME]);
    expect(c.calls).toEqual([`play ${UI_POPUP_SOUND} ${OVERLAY_ROUND_CUE_VOLUME_ADAPTATION} popup`, 'back']);
  });

  it('no disc audio loaded: silent, and that is no error -- the overlay opens and closes as ever', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount({ sounds: () => null });
    openByHome();
    step([], OPEN_DONE);
    expect(phase()).toBe('open');
    step([HOME]); step([], CLOSE_DONE);
    expect(phase()).toBe('closed');
    expect(errors).not.toHaveBeenCalled();
  });

  // F7 sharpened (the merge controller: the owner asked for the cue on the in-game overlay, so a match is the case that
  // matters): the front end's match -- the game the console launched -- keeps the menus' `GameAudio` and its cues (the
  // match plays on a `GameAudio` of its own over the same context, `src/frontEnd.ts` `frontEndMatchSound`), so over its
  // match the page's reads still answer the front end's cues, and the open and the close play them.
  it('over the front end\'s match (the game launched from the console): the round\'s lighter open cue and the close\'s', async () => {
    vi.useRealTimers();
    const own = cues();
    const match = { phase: 'match' };
    const page = { kind: 'front-end' as const, frontEnd: { session: Promise.resolve({ lobby: null, match, sounds: own }) } };
    overlay = mountPageOverlay(document, page, { nav, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, now: () => t, motion: false });
    await new Promise((r) => setTimeout(r, 0));
    overlay!.open();
    overlay!.close();
    expect(own.calls).toEqual([`play ${UI_POPUP_SOUND} ${OVERLAY_ROUND_CUE_VOLUME_ADAPTATION} popup`, 'back']);
    match.phase = 'menu';                                            // back in the menus: the open's cue as the menus play it
    overlay!.open();
    overlay!.close();
    expect(own.calls.slice(2)).toEqual(['popup', 'back']);
  });

  it('the page\'s cues are the front end\'s own (its session\'s `sounds`), none on a page with no front end', async () => {
    vi.useRealTimers();
    const own = cues();
    const reads = overlayPageReads({ kind: 'front-end', frontEnd: { session: Promise.resolve({ lobby: null, match: { phase: 'menu' }, sounds: own }) } }, window);
    expect(reads.sounds()).toBeNull();                               // before the session is made
    await new Promise((r) => setTimeout(r, 0));
    expect(reads.sounds()).toBe(own);
    expect(overlayPageReads({ kind: 'viewer' }, window).sounds()).toBeNull();
    expect(overlayPageReads({ kind: 'forge' }, window).sounds()).toBeNull();
  });

  // F7 (a): the forge's Play match and a forge lobby's match hold the menus' cues they built over the match's own output
  // (`src/forge/match` `forgeMatchCues`, held in `src/forge/matchState`); the overlay over the forge reads them only while
  // the forge's body says a match runs. The forge's editor and walk play no cue: nothing is loaded there.
  it('F7 (a): over the forge, the page\'s cues are the running match\'s own, and none outside a match', () => {
    const own = cues();
    const reads = overlayPageReads({ kind: 'forge' }, window);
    expect(reads.sounds()).toBeNull();                               // the editor: no match, nothing held
    setForgeMatchSounds(own as unknown as UiSoundCues);
    expect(reads.sounds()).toBeNull();                               // held, but the body says no match: none
    document.body.classList.add(FORGE_MATCH_CLASS);
    expect(reads.sounds()).toBe(own);
    setForgeMatchSounds(null);
    expect(reads.sounds()).toBeNull();                               // a match with no disc sound files: silent
    setForgeMatchSounds(own as unknown as UiSoundCues);
    document.body.classList.remove(FORGE_MATCH_CLASS);
    expect(reads.sounds()).toBeNull();                               // the match ended
    setForgeMatchSounds(null);
  });

  it('F7 (a): over a forge match the open plays the round\'s lighter .METAL once and the close .BACK once', () => {
    vi.useRealTimers();
    const own = cues();
    setForgeMatchSounds(own as unknown as UiSoundCues);
    document.body.classList.add(FORGE_MATCH_CLASS);
    try {
      overlay = mountPageOverlay(document, { kind: 'forge' }, { nav, session: fakeSession('signed-out'), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {}, now: () => t, motion: false });
      overlay!.open();
      expect(own.calls).toEqual([`play ${UI_POPUP_SOUND} ${OVERLAY_ROUND_CUE_VOLUME_ADAPTATION} popup`]);
      overlay!.close();
      expect(own.calls).toEqual([`play ${UI_POPUP_SOUND} ${OVERLAY_ROUND_CUE_VOLUME_ADAPTATION} popup`, 'back']);
    } finally {
      setForgeMatchSounds(null);
      document.body.classList.remove(FORGE_MATCH_CLASS);
    }
  });
});

/**
 * The seat's frames over a running forge match (batch B's fold): F-C, the header and the legend stayed whole through the
 * close and vanished with the frame; F-D (the review's F3), about 90 of the console's own CSS transitions -- the
 * crossbar's font-size, padding, letter-spacing, stroke-width -- ran at its first draw in the frame.
 */
describe('the frames\' F-C and F-D: the whole console layer fades with the close; its own transitions wait for the open', () => {
  const css = (): string => readFileSync(resolve(VIEWER, 'src/modern/overlay/overlay.css'), 'utf8').replace(/\r\n/g, '\n');
  /** The declarations of the rule whose selector is exactly `sel`. */
  const rule = (sel: string): string => {
    const text = css();
    const at = text.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThan(-1);
    return text.slice(at + sel.length + 2, text.indexOf('}', at));
  };

  it('F-C: on the close the frame\'s whole body -- header, legend, dialogs and all -- fades out, done before the blur', () => {
    const ramp = overlayRamp('closed', 1, false);
    const ovl = parseInt(ramp.vars['--mu-ovl-ms']!, 10);
    expect(ovl).toBeGreaterThan(0);
    expect(ovl).toBeLessThan(ramp.ms);                                // gone before the blur has ramped out
    expect(ramp.vars['--mu-ovl-ease']).toBe(OVERLAY_EASE_IN_ADAPTATION);
    const half = overlayRamp('closed', 0.5, false);                  // a reversal: in proportion, still before the blur
    expect(Math.abs(parseInt(half.vars['--mu-ovl-ms']!, 10) - ovl * 0.5)).toBeLessThanOrEqual(2);
    expect(parseInt(half.vars['--mu-ovl-ms']!, 10)).toBeLessThan(half.ms);
    expect(rule('html.mu-overlay-doc[data-overlay-phase="closing"] body')).toMatch(/opacity:\s*0\b/);
    const t = rule('html.mu-overlay-doc[data-overlay-phase] body');
    expect(t).toMatch(/transition:\s*opacity var\(--mu-ovl-ms, 0ms\) var\(--mu-ovl-ease, ease\)/);
    mount();
    openByHome();
    step([], OPEN_DONE);
    step([HOME]);
    expect(phase()).toBe('closing');
    expect(overlay!.el!.contentDocument!.documentElement.style.getPropertyValue('--mu-ovl-ms')).toBe(`${ovl}ms`);
  });

  it('F-C: the open leaves the layer whole (no second fade over the panels\' stagger); a reversal mid-close brings it back on the open\'s time', () => {
    const open = overlayRamp('open', 0, false);
    expect(open.vars['--mu-ovl-ms']).toBe(`${OVERLAY_OPEN_MS_ADAPTATION}ms`);
    expect(css()).not.toMatch(/data-overlay-phase="(?:closed|opening|open)"\][^{]*\bbody\b[^{]*\{[^}]*opacity:\s*0/);
  });

  it('F-D: the frame\'s document is marked settling from the console\'s first draw until the open completes', () => {
    mount();
    expect(overlay!.el).toBeNull();                                  // the frame is made at the first open
    openByHome();
    const html = overlay!.el!.contentDocument!.documentElement;
    expect(phase()).toBe('opening');
    expect(html.hasAttribute('data-overlay-settling')).toBe(true);
    step([], OPEN_DONE);
    expect(phase()).toBe('open');
    expect(html.hasAttribute('data-overlay-settling')).toBe(false);
    step([HOME]); step([], CLOSE_DONE);
    openByHome();
    expect(html.hasAttribute('data-overlay-settling')).toBe(true);    // each open draws a new console
    step([HOME]);                                                    // reversed before the open completed
    step([], CLOSE_DONE);
    expect(phase()).toBe('closed');
    expect(html.hasAttribute('data-overlay-settling')).toBe(false);   // taken off with the console at the close's end
  });

  it('F-D: without motion the open completes at once, and so does the mark', () => {
    mount({ motion: false });
    overlay!.open();
    expect(overlay!.el!.contentDocument!.documentElement.hasAttribute('data-overlay-settling')).toBe(false);
  });

  it('F-D: under the mark the console\'s own transitions are off, the open\'s fade of the panels and the body kept; the launcher\'s sheet has no such rule', () => {
    const text = css();
    const at = text.indexOf('html.mu-overlay-doc[data-overlay-settling]');
    expect(at).toBeGreaterThan(-1);
    const sel = text.slice(at, text.indexOf('{', at));
    const body = text.slice(text.indexOf('{', at), text.indexOf('}', at));
    expect(body).toMatch(/transition-property:\s*none !important/);
    // LR-39 (LR.R32): Home's readout is drawn no more, so `.cx-readout` left the panels (was one of them).
    for (const kept of ['.cx-header', '.cx-crossbar', '.cx-list', '.cx-screenhead', '.cx-screen__body', '.cx-legend', 'body']) expect(sel, kept).toContain(kept);
    expect(sel).not.toContain('.cx-readout');
    expect(sel).toContain(':not(');
    const consoleCss = readFileSync(resolve(VIEWER, 'src/console/console.css'), 'utf8');
    expect(consoleCss).not.toContain('data-overlay-settling');
  });

  it('F-D (the review\'s F3, since OVERLAY-CONSOLE\'s landing gate): the sheets are copied as the frame is made, at the first open; never twice, and one added since at the next', () => {
    const sheet = document.createElement('style');
    sheet.textContent = '.page-sheet { color: red; }';
    document.head.append(sheet);
    const later = document.createElement('style');
    later.textContent = '.later-sheet { color: blue; }';
    try {
      mount();
      expect(document.querySelector('iframe')).toBeNull();           // closed: nothing copied, no frame (the closed overlay is inert)
      openByHome();
      const head = overlay!.el!.contentDocument!.head;
      expect(head.querySelectorAll('link[data-overlay-console-sheet]')).toHaveLength(1);
      expect([...head.querySelectorAll('style')].filter((s) => s.textContent?.includes('.page-sheet')).length).toBe(1);   // not copied twice
      step([], OPEN_DONE);
      step([HOME]); step([], CLOSE_DONE);
      document.head.append(later);
      openByHome();
      expect(overlay!.el!.contentDocument!.head).toBe(head);          // the same frame, kept across the opens
      expect(head.querySelectorAll('link[data-overlay-console-sheet]')).toHaveLength(1);
      expect([...head.querySelectorAll('style')].filter((s) => s.textContent?.includes('.page-sheet')).length).toBe(1);
      expect([...head.querySelectorAll('style')].filter((s) => s.textContent?.includes('.later-sheet')).length).toBe(1);
    } finally { sheet.remove(); later.remove(); }
  });
});

describe('OT.R60 (e): the cost -- transform and opacity on the panels, the filter and the background on the one frame', () => {
  const css = readFileSync(resolve(VIEWER, 'src/modern/overlay/overlay.css'), 'utf8').replace(/\r\n/g, '\n');
  /** Every `transition` declaration's properties, with the selector it sits under. */
  const transitions = (): { sel: string; props: string[] }[] => {
    const out: { sel: string; props: string[] }[] = [];
    const re = /([^{}]+)\{([^}]*)\}/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
      const decl = /(?:^|;)\s*transition\s*:([^;]*)/.exec(m[2]!);
      if (!decl) continue;
      out.push({ sel: m[1]!.trim(), props: [...`,${decl[1]!}`.matchAll(/,\s*(-?[a-z][a-z-]*)\s+var\(--mu-/g)].map((x) => x[1]!) });
    }
    return out;
  };

  it('the frame moves backdrop-filter and background-color only; the panels opacity and transform only; no layout property anywhere', () => {
    const all = transitions();
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const { sel, props } of all) {
      expect(props.length, sel).toBeGreaterThan(0);
      const allowed = sel.includes('.mu-overlay-frame') ? ['backdrop-filter', '-webkit-backdrop-filter', 'background-color'] : ['opacity', 'transform'];
      for (const p of props) expect(allowed, `${sel}: ${p}`).toContain(p);
    }
  });

  it('no per-frame style write: the poll writes no style, the ramp writes its custom properties once per ramp', () => {
    const src = readFileSync(resolve(VIEWER, 'src/modern/overlay/index.ts'), 'utf8').replace(/\r\n/g, '\n');
    const poll = src.slice(src.indexOf('  const poll = (): void => {'), src.indexOf('\n  };\n', src.indexOf('  const poll = (): void => {')));
    expect(poll.length).toBeGreaterThan(100);
    expect(poll).not.toMatch(/\.style\b/);
    expect(src).not.toMatch(/requestAnimationFrame\([^)]*style/);
  });
});
