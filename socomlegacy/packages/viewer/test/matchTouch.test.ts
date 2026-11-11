// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeTaps, mountTip, mountTouch, promptDeviceOf, readsPad, TOUCH_LAYER_MARKUP, TOUCH_TIP_MS, type MatchTouchDeps } from '../src/matchTouch';
import { PAD_BUTTON, PAD_FLAGS, padInput, type PadButton, type PadFlag, type PadLike } from '../src/gamepad';
import { GamePad, PAD_SELECTION_KEY } from '../src/setupPad';
import { padButtonsDown } from '../src/weaponExchange';
import { mountExchange } from '../src/matchExchange';
import { PlayerLoadout } from '../src/loadout';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } from '../src/matchCore';
import { TIP_DISMISSED_KEY, type TipStore } from '../src/mobileTip';
import { TIP_MS } from '../src/ui';
import { mountMenuTouch } from '../src/menuTouch';

/**
 * PAR-5 (PARITY-2; web research 222 §11): the touch layer, WEAPON EXCHANGE's touch half and the phone's tip as one part
 * both pages mount (`./matchTouch`), scoped to the root each page hands it. Two roots live in one document here -- a
 * case no page has (the two pages are two documents), which is what proves the part reads nothing outside its root: each
 * root's sticks and buttons drive its own lanes only, and one let go leaves the other working. A browser adaptation (the
 * PS2 has no touch screen); no browser is run.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
/** `/testroom`'s page: the layer and the tip as `index.html` holds them. */
const page = new DOMParser().parseFromString(html, 'text/html');

/** A root holding its own copy of `index.html`'s layer (duplicate ids across the two roots, on purpose). */
function rootWithLayer(): HTMLElement {
  const root = document.createElement('div');
  root.append(page.getElementById('touch')!.cloneNode(true), page.getElementById('mobile-tip')!.cloneNode(true));
  document.body.append(root);
  return root;
}
const ptr = (el: Element, type: string, pointerId: number, x = 0, y = 0, pointerType = 'touch'): void => {
  el.dispatchEvent(new PointerEvent(type, { pointerId, clientX: x, clientY: y, pointerType, bubbles: true, cancelable: true }));
};
/** A page's deps, each call logged; WEAPON EXCHANGE a fake with its gate, its prompt and its open state. */
function deps(extra: Partial<MatchTouchDeps> = {}) {
  const log: string[] = [];
  const ex = { open: false, prompt: false };
  const d: MatchTouchDeps = {
    stance: (e) => { log.push(`stance:${e}`); },
    fire: (down) => { log.push(`fire:${down}`); },
    reload: () => { log.push('reload'); },
    cancelAction: () => { log.push('cancel'); },
    exchange: {
      menu: { touchButton: () => { log.push('inv'); ex.open = !ex.open; return true; } } as never,
      refresh: () => { log.push('refresh'); },
      gate: () => ({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false }),
      isOpen: () => ex.open,
      prompt: () => (ex.prompt ? { ghost: false, device: 'touch', sinceDeath: 0 } : null),
    },
    covered: () => false,
    ...extra,
  };
  return { d, log, ex };
}
const q = (root: Element, id: string): HTMLElement => root.querySelector<HTMLElement>(`[id="${id}"]`)!;   // under the root alone (duplicate ids)
/** The root's touch button for a pad button (MP-1: `data-pad`, the standard mapping's index). */
const b = (root: Element, name: PadButton): HTMLElement => root.querySelector<HTMLElement>(`[id="touch-walk"] button[data-pad="${PAD_BUTTON[name]}"]`)!;   // `[id=]`: jsdom answers `#id` document-wide

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); document.body.className = ''; });

describe('PAR-5: two roots at once -- each owns its sticks and buttons; one let go leaves the other working', () => {
  it('a menu taking window focus immediately cancels held touch input and disposal removes that listener', () => {
    const root = rootWithLayer(), win = new EventTarget();
    const x = deps({ win });
    const touch = mountTouch(root, x.d);
    ptr(b(root, 'R1'), 'pointerdown', 1);
    ptr(b(root, 'Cross'), 'pointerdown', 2);
    ptr(q(root, 'stick-zone'), 'pointerdown', 3, 100, 300);
    ptr(q(root, 'stick-zone'), 'pointermove', 3, 100, 250);
    expect(touch.input.fire).toBe(true);
    expect(touch.input.moveY).not.toBe(0);
    win.dispatchEvent(new Event('blur'));
    expect(touch.input.fire).toBe(false);
    expect(touch.input.action).toBe(false);
    expect(touch.input.moveY).toBe(0);
    expect(x.log).toContain('cancel');
    touch.dispose();
    const calls = x.log.length;
    win.dispatchEvent(new Event('blur'));
    expect(x.log).toHaveLength(calls);
  });
  it('B61 review F1: a blur or a layout refresh lets go only what touch holds -- a pad\'s held fire is never stopped', () => {
    const root = rootWithLayer(), win = new EventTarget();
    const x = deps({ win });
    const touch = mountTouch(root, x.d);
    win.dispatchEvent(new Event('blur'));                     // touch holds no fire: no fire(false)
    expect(x.log).not.toContain('fire:false');
    touch.padConnected(true);                                 // a pad holds R1 and C on the page; the layer is hidden
    x.log.length = 0;
    win.dispatchEvent(new Event('blur'));
    expect(x.log).toEqual([]);                                // nothing of the pad's let go: no fire, no stance, no cancel
    touch.dispose();
  });
  it('no document-wide lookup: every element found under the root it was handed', () => {
    const a = rootWithLayer(), b = rootWithLayer();
    const byId = vi.spyOn(document, 'getElementById'), bySel = vi.spyOn(document, 'querySelector'), byAll = vi.spyOn(document, 'querySelectorAll');
    const ta = mountTouch(a, deps().d), tb = mountTouch(b, deps().d);
    expect(byId).not.toHaveBeenCalled();
    expect(bySel).not.toHaveBeenCalled();
    expect(byAll).not.toHaveBeenCalled();
    ta.dispose(); tb.dispose();
  });

  it("each root's sticks drive its own lanes only, and both are held at once", () => {
    const a = rootWithLayer(), b = rootWithLayer();
    const ta = mountTouch(a, deps().d), tb = mountTouch(b, deps().d);
    ptr(q(a, 'stick-zone'), 'pointerdown', 1, 100, 300);
    ptr(q(a, 'stick-zone'), 'pointermove', 1, 100, 200);                    // A's thumb pushed up: forward
    expect(ta.input.moveY).toBeGreaterThan(0.9);
    expect(tb.input.moveY).toBe(0);
    expect(q(a, 'stick-base').hidden).toBe(false);
    expect(q(b, 'stick-base').hidden).toBe(true);
    ptr(q(b, 'aim-zone'), 'pointerdown', 2, 600, 250);
    ptr(q(b, 'aim-zone'), 'pointermove', 2, 700, 250);                      // B's look pushed right
    expect(tb.input.lookX).toBeGreaterThan(0.9);
    expect(ta.input.lookX).toBe(0);
    expect(ta.input.moveY).toBeGreaterThan(0.9);                             // A's still held
    ta.dispose(); tb.dispose();
  });

  it("each root's buttons hold its own lanes: B's Square is B's, A's R3 and C are A's, B's Cross cancel is B's", () => {
    const a = rootWithLayer(), bRoot = rootWithLayer();
    const da = deps(), db = deps();
    const ta = mountTouch(a, da.d), tb = mountTouch(bRoot, db.d);
    ptr(b(bRoot, 'Square'), 'pointerdown', 3);
    expect([ta.input.jump, tb.input.jump]).toEqual([false, true]);
    ptr(b(a, 'R3'), 'pointerdown', 4);                                      // MP-1: R3 holds the reload lane, as a pad's R3 does
    expect([ta.input.reload, tb.input.reload]).toEqual([true, false]);
    ptr(q(a, 'touch-stance'), 'pointerdown', 5);
    expect(da.log).toEqual(['stance:down']);
    ptr(b(bRoot, 'Cross'), 'pointerdown', 6);
    ptr(b(bRoot, 'Cross'), 'pointercancel', 6);                              // XR-06: the system took the finger
    expect(db.log).toEqual(['cancel']);
    expect(da.log).toEqual(['stance:down']);
    // A lift is kept until the frame's end, so a tap shorter than a frame is still an edge (`main.ts`'s `touchReleased`).
    ptr(b(bRoot, 'Square'), 'pointerup', 3);
    expect(tb.input.jump).toBe(true);
    tb.endFrame();
    expect(tb.input.jump).toBe(false);
    ta.dispose(); tb.dispose();
  });

  it('A disposed: its elements answer nothing, its class and its hybrid listener gone -- B still drives its lanes', () => {
    const a = rootWithLayer(), bRoot = rootWithLayer();
    const da = deps(), db = deps();
    const ta = mountTouch(a, da.d), tb = mountTouch(bRoot, db.d);
    ta.dispose();
    ptr(q(a, 'stick-zone'), 'pointerdown', 1, 100, 300);
    ptr(q(a, 'stick-zone'), 'pointermove', 1, 100, 200);
    ptr(b(a, 'Square'), 'pointerdown', 2);
    ptr(b(a, 'R3'), 'pointerdown', 3);
    ptr(q(a, 'touch-stance'), 'pointerdown', 4);
    expect(ta.input.moveY).toBe(0);
    expect(ta.input.jump).toBe(false);
    expect(ta.input.reload).toBe(false);
    expect(da.log).toEqual([]);
    globalThis.dispatchEvent(new Event('touchstart'));                       // a hybrid's first touch: B's layer shows, A's is gone
    expect(a.classList.contains('touch')).toBe(false);
    expect(bRoot.classList.contains('touch')).toBe(true);
    ptr(q(bRoot, 'stick-zone'), 'pointerdown', 1, 100, 300);
    ptr(q(bRoot, 'stick-zone'), 'pointermove', 1, 100, 200);
    ptr(b(bRoot, 'R3'), 'pointerdown', 3);
    expect(tb.input.moveY).toBeGreaterThan(0.9);
    expect(tb.input.reload).toBe(true);
    tb.dispose();
  });

  it('the layer shows on its root, never on the body: a coarse pointer up front (OT.R29: never a window width)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    const a = rootWithLayer();
    const ta = mountTouch(a, deps().d);
    expect(a.classList.contains('touch')).toBe(true);
    expect(document.body.classList.contains('touch')).toBe(false);
    ta.dispose();
    expect(a.classList.contains('touch')).toBe(false);
  });

  it("a pad connecting: `pad-on` on the root (the layer hidden) and the sticks let go; its leaving brings the layer back", () => {
    const a = rootWithLayer();
    const ta = mountTouch(a, deps().d);
    ptr(q(a, 'stick-zone'), 'pointerdown', 1, 100, 300);
    ptr(q(a, 'stick-zone'), 'pointermove', 1, 100, 200);
    ta.padConnected(true);
      expect(q(a, 'stick-zone').classList.contains('is-held')).toBe(false);
    expect(a.classList.contains('pad-on')).toBe(true);
    expect(q(a, 'touch').hasAttribute('inert')).toBe(true);                                 // FI.R4: it takes no touch while hidden
    expect(ta.input.moveY).toBe(0);
    ta.padConnected(false);
    expect(a.classList.contains('pad-on')).toBe(false);
    expect(q(a, 'touch').hasAttribute('inert')).toBe(false);
    ta.dispose();
  });

  it('release (a screen opening, the loading hold): the sticks, the touch C cancelled, every held lane let go at the frame\'s end', () => {
    const a = rootWithLayer();
    const da = deps();
    const ta = mountTouch(a, da.d);
    ptr(b(a, 'R1'), 'pointerdown', 2);
    ptr(q(a, 'stick-zone'), 'pointerdown', 1, 100, 300);
    ptr(q(a, 'stick-zone'), 'pointermove', 1, 100, 200);
    ta.release();
    expect(ta.input.moveY).toBe(0);
    expect(da.log).toContain('stance:cancel');
    expect(ta.input.fire).toBe(true);                                        // read this frame, as a lift is
    ta.endFrame();
    expect(ta.input.fire).toBe(false);
    ta.dispose();
  });
});

describe("PAR-5: WEAPON EXCHANGE's touch half (research 253 §4) in the part", () => {
  it('INV shown while the prompt is up or the menu open, and no other screen over the match; a press is Inventory', () => {
    const a = rootWithLayer();
    const x = deps();
    let covered = false;
    const ta = mountTouch(a, { ...x.d, covered: () => covered });
    const inv = q(a, 'tw-weapons');
    ta.weaponsFrame();
    expect(inv.hidden).toBe(true);
    expect(ta.weaponsShown()).toBe(false);
    x.ex.prompt = true;
    ta.weaponsFrame();
    expect(inv.hidden).toBe(false);
    covered = true;                                                          // the ARMORY, the loading hold
    ta.weaponsFrame();
    expect(inv.hidden).toBe(true);
    covered = false;
    ta.weaponsFrame();
    ptr(inv, 'pointerdown', 9);
    expect(x.log).toEqual(['refresh', 'inv']);                               // `main.ts`'s: the menu's world refreshed, then Inventory
    expect(x.ex.open).toBe(true);
    ta.dispose();
    ptr(inv, 'pointerdown', 9);
    expect(x.log).toEqual(['refresh', 'inv']);
  });

  it("OT.R120 (the review's F1): dead and watching a teammate, INV shows with no prompt (the fly camera's layer), 'is-inv-shown' on the root; a press is Inventory", () => {
    // Watching, `prompt()` is null (the page is not walking), so INV followed only R2's gate's other half: a touch player
    // had no way in but going back to his own body. INV now shows wherever `canOpen` lets the camera on a teammate open it.
    const a = rootWithLayer();
    let gate = { inMatch: true, alive: false, cameraOnSelf: false, spectator: false };
    let covered = false;
    const x = deps({ covered: () => covered });
    const ta = mountTouch(a, { ...x.d, exchange: { ...x.d.exchange, gate: () => gate } });
    const inv = q(a, 'tw-weapons');
    ta.weaponsFrame();
    expect(inv.hidden).toBe(false);
    expect(a.classList.contains('is-inv-shown')).toBe(true);
    ptr(inv, 'pointerdown', 9);
    expect(x.log).toEqual(['refresh', 'inv']);
    expect(x.ex.open).toBe(true);
    ta.weaponsFrame();
    expect(inv.hidden).toBe(false);                                          // open over the teammate, INV closes the list
    x.ex.open = false;
    covered = true;                                                          // another screen over the match
    ta.weaponsFrame();
    expect(inv.hidden).toBe(true);
    expect(a.classList.contains('is-inv-shown')).toBe(false);
    covered = false;
    for (const shut of [{ alive: true }, { spectator: true }, { inMatch: false }]) {
      gate = { inMatch: true, alive: false, cameraOnSelf: false, spectator: false, ...shut };
      ta.weaponsFrame();
      expect(inv.hidden, JSON.stringify(shut)).toBe(true);                     // alive, a spectator or out of the match: shut
      expect(a.classList.contains('is-inv-shown'), JSON.stringify(shut)).toBe(false);
    }
    gate = { inMatch: true, alive: false, cameraOnSelf: true, spectator: false };
    ta.weaponsFrame();
    expect(inv.hidden).toBe(true);                                           // on his own body, the prompt still decides (as before)
    ta.dispose();
    expect(a.classList.contains('is-inv-shown')).toBe(false);
  });

  it("PAR-5a: the open menu takes the screen -- 'is-exchange-open' on the root each frame, and both stick zones yield their taps to it", () => {
    // The rendered check (PAR-5's review F1, 2026-10-11): walking, the zones lay over every row WEAPON EXCHANGE draws, so
    // a tap on the open menu started a stick and never reached `exchangeTaps` on the canvas. jsdom hit-tests nothing, so
    // the two halves are pinned apart: the part's class from `isOpen()` each frame, and the stylesheet's rule on it.
    const a = rootWithLayer();
    const x = deps();
    const ta = mountTouch(a, x.d);
    ta.weaponsFrame();
    expect(a.classList.contains('is-exchange-open')).toBe(false);
    x.ex.open = true;
    ta.weaponsFrame();
    expect(a.classList.contains('is-exchange-open')).toBe(true);
    x.ex.open = false;
    ta.weaponsFrame();
    expect(a.classList.contains('is-exchange-open')).toBe(false);
    x.ex.open = true;
    ta.weaponsFrame();
    ta.dispose();
    expect(a.classList.contains('is-exchange-open')).toBe(false);              // taken off with the part's other classes
    // The rule: while the menu is open, neither zone takes a pointer (the canvas under them does). One rule, the root's
    // class, on whatever element the root is (MP-1: `main.ts`'s `document.body`, the menu match's `doc.body` or its own root).
    const css = src('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /([^{}]*\.is-exchange-open[^{}]*)\{([^{}]*)\}/.exec(css);
    expect(rule, 'a rule on .is-exchange-open').not.toBeNull();
    const selectors = rule![1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    expect(selectors.sort()).toEqual(['.touch.is-exchange-open #aim-zone', '.touch.is-exchange-open #stick-zone']);
    expect(rule![2]!.replace(/\s+/g, '')).toBe('pointer-events:none;');
  });

  it("the open menu's taps on the canvas: any pointer on /testroom, a touch's or a pen's alone on the menu match (OT.R38: no mouse in a release)", () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 640, height: 448, right: 640, bottom: 448, x: 0, y: 0, toJSON: () => ({}) });
    const taps: [number, number][] = [];
    let open = true;
    const exchange = {
      isOpen: () => open, gate: () => ({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false }),
      menu: { tap: (fx: number, fy: number) => { taps.push([fx, fy]); return true; } } as never,
    };
    const any = new AbortController(), touchOnly = new AbortController();
    exchangeTaps(canvas, exchange, { signal: any.signal });
    ptr(canvas, 'pointerdown', 1, 320, 224, 'mouse');
    expect(taps).toEqual([[320, 224]]);
    any.abort();
    exchangeTaps(canvas, exchange, { touchOnly: true, signal: touchOnly.signal });
    ptr(canvas, 'pointerdown', 1, 320, 224, 'mouse');
    expect(taps).toHaveLength(1);
    ptr(canvas, 'pointerdown', 2, 100, 100, 'touch');
    ptr(canvas, 'pointerdown', 3, 100, 100, 'pen');
    expect(taps).toHaveLength(3);
    open = false;
    ptr(canvas, 'pointerdown', 4, 100, 100, 'touch');
    expect(taps).toHaveLength(3);
    touchOnly.abort();
  });

  it("the prompt's %c: a pad when one is connected, the touch label on a touch screen, else the page's own", () => {
    expect(promptDeviceOf(0, 'keyboard')).toBe('keyboard');
    expect(promptDeviceOf(0, 'pad')).toBe('pad');
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    expect(promptDeviceOf(0, 'keyboard')).toBe('touch');
    expect(promptDeviceOf(0, 'pad')).toBe('touch');
    expect(promptDeviceOf(1, 'pad')).toBe('pad');
  });

  // LATER 132 (OT.R29: a release has no key): `/testroom`'s own fallback is the key in a development build only, the
  // pad in a release -- as the menu match's (`./matchMount` passes 'pad'); a release with no pad drew `[I]`.
  it("LATER 132: /testroom's fallback is the key in a development build only, the pad in a release", () => {
    expect(src('main.ts')).toContain("return promptDeviceOf(pads.count(), import.meta.env.DEV ? 'keyboard' : 'pad');");
    expect(src('main.ts')).not.toContain("promptDeviceOf(pads.count(), 'keyboard')");
    expect(src('matchMount.ts')).toContain("promptDeviceOf(pads.count(), 'pad')");
  });
});

describe('MP-1 (FI.R3): the touch pad is a pad -- each button presses its pad button, and the lanes come from PAD_LAYOUT', () => {
  /** What the controller's own button holds: the pad's lanes with only that button down (`padInput` through `PAD_LAYOUT`). */
  const lanesOf = (index: number): PadFlag[] => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === index, value: i === index ? 1 : 0 }));
    const v = padInput({ axes: [], buttons });
    return PAD_FLAGS.filter((f) => v[f]);
  };
  const held = (i: { [k in PadFlag]: boolean }): PadFlag[] => PAD_FLAGS.filter((f) => i[f]);

  it.each([
    ['R1', 'fire'], ['Square', 'jump'], ['R3', 'reload'], ['Left', 'leanLeft'], ['Select', 'scoreboard'], ['Start', 'mode'],
    ['Cross', 'action'], ['Triangle', 'stance'], ['L1', 'swap1'], ['L2', 'swap2'], ['R2', 'inventory'], ['L3', 'fireMode'],
    ['Up', 'zoom'], ['Down', 'zoomOut'], ['Right', 'leanRight'], ['Circle', 'boost'],
  ] as [PadButton, PadFlag][])("a press on %s holds %s, exactly what the controller's button holds", (name, lane) => {
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    ptr(b(a, name), 'pointerdown', 1);
    expect(held(t.input)).toEqual([lane]);
    expect(held(t.input)).toEqual(lanesOf(PAD_BUTTON[name]));
    ptr(b(a, name), 'pointerup', 1);
    expect(held(t.input)).toEqual([lane]);                                   // read this frame, as a lift is
    t.endFrame();
    expect(held(t.input)).toEqual([]);
    t.dispose();
  });

  it('the virtual pad: the sticks on axes 0-3 and the buttons by index, read through padInput as the lanes are', () => {
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    ptr(q(a, 'stick-zone'), 'pointerdown', 1, 100, 300);
    ptr(q(a, 'stick-zone'), 'pointermove', 1, 100, 200);                    // pushed up: axis 1 at -1
    ptr(b(a, 'R1'), 'pointerdown', 2);
    ptr(b(a, 'Square'), 'pointerdown', 3);
    expect(t.pad.axes[1]).toBeCloseTo(-1, 9);
    expect(t.pad.buttons[PAD_BUTTON.R1]!.pressed).toBe(true);
    expect(t.pad.buttons[PAD_BUTTON.Cross]!.pressed).toBe(false);
    const read = padInput(t.pad);
    expect(held(read)).toEqual(held(t.input));
    expect(read.moveY).toBeCloseTo(t.input.moveY, 9);
    t.dispose();
  });

  it("Triangle is a held lane, its tap and hold read by the lanes as a controller's: held across frames until the lift", () => {
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    ptr(b(a, 'Triangle'), 'pointerdown', 1);
    for (let i = 0; i < 30; i++) { expect(t.input.stance).toBe(true); t.endFrame(); }
    ptr(b(a, 'Triangle'), 'pointerup', 1);
    t.endFrame();
    expect(t.input.stance).toBe(false);
    t.dispose();
  });

  it("the fly camera's lift buttons still hold up and down, merged with the pad buttons", () => {
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    ptr(q(a, 'touch-up'), 'pointerdown', 1);
    ptr(b(a, 'R1'), 'pointerdown', 2);
    expect([t.input.jump, t.input.fire]).toEqual([true, true]);
    ptr(q(a, 'touch-up'), 'pointerup', 1);
    expect(t.input.jump).toBe(false);
    expect(t.input.fire).toBe(true);
    t.dispose();
  });
});

describe('FI.R4: the touch pad hides while the pad the game reads is a connected one -- on any root', () => {
  /** A pad as `navigator.getGamepads()` lists it. */
  const fakePad = (index: number, id: string): PadLike => ({
    index, id, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  });
  /** A fake `navigator`: the pads it lists, changed by the test. */
  const source = (pads: PadLike[]): { pads: PadLike[]; getGamepads(): ArrayLike<PadLike | null> } => ({ pads, getGamepads() { return this.pads; } });
  /** A root that is not the body (the menu match's own root, `matchMount.ts` `own`); the layer is built in it. */
  const ownRoot = (): HTMLElement => {
    const root = document.createElement('div');
    document.body.append(root);
    return root;
  };
  /** One page frame's pad read: `GamePad.poll`, then the layer told what it resolved to (`main.ts` / `matchMount.ts`). */
  const frame = (game: GamePad, src: ReturnType<typeof source>, t: ReturnType<typeof mountTouch>): void => { game.poll(src); t.padConnected(readsPad(game)); };
  afterEach(() => { localStorage.clear(); });

  it('a chosen pad, connected: the layer hidden on a root that is not the body, and a touch then presses nothing', () => {
    localStorage.setItem(PAD_SELECTION_KEY, '1:Chosen pad');
    const root = ownRoot();
    const x = deps();
    const t = mountTouch(root, { ...x.d, build: { zIndex: 1001 } });
    const game = new GamePad({ waitForRest: false });
    const src = source([fakePad(0, 'Other pad'), fakePad(1, 'Chosen pad')]);
    frame(game, src, t);
    expect(game.input.selection).toBe('1:Chosen pad');
    expect(root.classList.contains('pad-on')).toBe(true);
    expect(document.body.classList.contains('pad-on')).toBe(false);          // the root's, never the body's
    expect(q(root, 'touch').hasAttribute('inert')).toBe(true);
    // A touch while hidden: it shows nothing again, reaches no button and starts no stick.
    globalThis.dispatchEvent(new Event('touchstart'));
    expect(root.classList.contains('pad-on')).toBe(true);
    ptr(b(root, 'R1'), 'pointerdown', 1);
    ptr(q(root, 'stick-zone'), 'pointerdown', 2, 100, 300);
    ptr(q(root, 'stick-zone'), 'pointermove', 2, 100, 200);
    ptr(q(root, 'touch-stance'), 'pointerdown', 3);
    expect(t.input.fire).toBe(false);
    expect(t.input.moveY).toBe(0);
    expect(q(root, 'stick-base').hidden).toBe(true);
    expect(b(root, 'R1').classList.contains('is-down')).toBe(false);
    expect(x.log).toEqual([]);
    t.dispose();
  });

  it('a chosen pad not connected gives way to the automatic one: any pad hides it; no pad shows it; the pad going brings it back', () => {
    localStorage.setItem(PAD_SELECTION_KEY, '3:Gone pad');
    const root = ownRoot();
    const t = mountTouch(root, { ...deps().d, build: { zIndex: 1001 } });
    const game = new GamePad({ waitForRest: false });
    const src = source([]);
    frame(game, src, t);
    expect(root.classList.contains('pad-on')).toBe(false);                 // no pad: shown
    src.pads = [fakePad(0, 'Any pad')];
    frame(game, src, t);
    expect(game.input.selection).toBe('auto');
    expect(root.classList.contains('pad-on')).toBe(true);                  // auto, any pad: hidden
    src.pads = [];
    frame(game, src, t);
    expect(root.classList.contains('pad-on')).toBe(false);                 // the pad gone: back
    expect(q(root, 'touch').hasAttribute('inert')).toBe(false);
    ptr(b(root, 'R1'), 'pointerdown', 1);
    expect(t.input.fire).toBe(true);                                        // and it takes touches again
    t.dispose();
  });

  it('auto with no choice stored: any connected pad hides it', () => {
    const root = ownRoot();
    const t = mountTouch(root, { ...deps().d, build: { zIndex: 1001 } });
    const game = new GamePad({ waitForRest: false });
    frame(game, source([fakePad(2, 'Any pad')]), t);
    expect(root.classList.contains('pad-on')).toBe(true);
    t.dispose();
  });

  it('told each frame, it acts on a change only: a tip shown with the pad already in stays up', () => {
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    t.padConnected(true);
    t.showTip('words', () => {});
    t.padConnected(true);                                                   // the next frame: the same pad
    expect(q(a, 'mobile-tip').hidden).toBe(false);
    t.dispose();
  });

  it("hidden, the virtual pad holds nothing at once: a touch START held as a pad is read is gone from the pages' button set that frame", () => {
    const root = ownRoot();
    const x = deps();
    const t = mountTouch(root, { ...x.d, build: { zIndex: 1001 } });
    ptr(b(root, 'Start'), 'pointerdown', 1);
    ptr(b(root, 'Cross'), 'pointerdown', 2);
    expect([...padButtonsDown(t.pad)].sort()).toEqual(['Cross', 'Start']);  // shown, the touch pad's buttons are a pad's
    expect(t.input.mode).toBe(true);
    const game = new GamePad({ waitForRest: false });
    frame(game, source([fakePad(0, 'Any pad')]), t);                       // the pages' order: told, then `down` read
    expect([...padButtonsDown(t.pad)]).toEqual([]);                          // nothing of the touch pad under the real one
    expect(t.input.mode).toBe(false);
    expect(t.input.action).toBe(false);
    expect(x.log).toEqual(['cancel']);                                        // the held Cross goes as a cancel (XR-06)
    t.endFrame();
    expect([...padButtonsDown(t.pad)]).toEqual([]);                          // and stays let go at the frame's end
    t.dispose();
  });

  it("the review's F1: a thumb on R1 as a pad comes in, its lift never delivered -- the pad gone, R1 is drawn up and takes a new press", () => {
    const root = ownRoot();
    const t = mountTouch(root, { ...deps().d, build: { zIndex: 1001 } });
    ptr(b(root, 'R1'), 'pointerdown', 1);
    expect(b(root, 'R1').classList.contains('is-down')).toBe(true);
    t.padConnected(true);                                                     // no pointerup ever reaches the hidden R1
    expect(b(root, 'R1').classList.contains('is-down')).toBe(false);
    t.padConnected(false);
    ptr(b(root, 'R1'), 'pointerdown', 7);                                    // a new finger
    expect(t.input.fire).toBe(true);
    expect(b(root, 'R1').classList.contains('is-down')).toBe(true);
    ptr(b(root, 'R1'), 'pointerup', 1);                                      // the old finger's late lift is nothing
    expect(b(root, 'R1').classList.contains('is-down')).toBe(true);
    t.dispose();
  });

  it("the review's F1 on release (a screen opening): no button keeps its finger, and a new press is taken", () => {
    const root = ownRoot();
    const t = mountTouch(root, { ...deps().d, build: { zIndex: 1001 } });
    ptr(b(root, 'Square'), 'pointerdown', 1);
    t.release();
    t.endFrame();
    expect(b(root, 'Square').classList.contains('is-down')).toBe(false);
    expect(t.input.jump).toBe(false);
    ptr(b(root, 'Square'), 'pointerdown', 2);
    expect(t.input.jump).toBe(true);
    t.dispose();
  });

  it("the review's F6: the fly camera's lift held as a pad comes in is let go with the rest", () => {
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    ptr(q(a, 'touch-up'), 'pointerdown', 1);
    expect(t.input.jump).toBe(true);
    t.padConnected(true);
    expect(t.input.jump).toBe(false);
    t.dispose();
  });

  it("the review's F2: a touch R2 tapped during the loading hold is no press on the first live frame -- the hold's baseline holds the touch pad too", () => {
    const root = ownRoot();
    const t = mountTouch(root, { ...deps().d, build: { zIndex: 1001 } });
    const ex = mountExchange({ net: () => null, map: () => null, side: () => 'seal', loadouts: new PlayerLoadout(), walking: () => true, device: () => 'touch' });
    const joined = (): Set<PadButton> => new Set([...padButtonsDown(null), ...padButtonsDown(t.pad)]);
    // The hold: the page releases the touch lanes, and no frame's end runs while held -- the tap's R2 is still down.
    ptr(b(root, 'R2'), 'pointerdown', 1);
    ptr(b(root, 'R2'), 'pointerup', 1);
    t.release();
    ex.hold(padButtonsDown(null));                                            // before F2: the physical pad's set alone
    expect([...ex.edges(joined())]).toEqual(['R2']);                         // -- the tap a fresh press at the release
    ex.hold(joined());                                                        // F2: main.ts:1135 / matchMount.ts:808
    // The first live frame: `down` read before the frame's end lets the tap go.
    expect([...ex.edges(joined())]).toEqual([]);
    t.endFrame();
    expect([...ex.edges(joined())]).toEqual([]);
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/\.hold\(new Set\(\[\.\.\.padButtonsDown\((held|polled)\), \.\.\.padButtonsDown\(touch\.pad\)\]\)\)/);
    }
    t.dispose();
  });

  it("the pages join the touch pad's buttons to the read pad's set after telling the layer, so a hidden layer adds nothing", () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      const told = s.lastIndexOf('touch.padConnected(readsPad(gamePad))', s.indexOf('padButtonsDown(touch.pad)'));
      expect(s, f).toMatch(/const down = new Set\(\[\.\.\.padButtonsDown\(polled\), \.\.\.padButtonsDown\(touch\.pad\)\]\);/);
      expect(told, f).toBeGreaterThan(-1);                                    // the layer told this frame before the set is read
    }
  });

  it('the stylesheet scopes the layer to its root: no `body.touch` selector, and `.touch.pad-on #touch` hides it', () => {
    const css = src('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/body\.touch\b/);
    expect(css).toMatch(/(^|[\s,}])\.touch\.pad-on #touch\s*{\s*display:\s*none;?\s*}/m);
    expect(css).toMatch(/(^|[\s,}])\.touch #touch\s*{\s*display:\s*block;?\s*}/m);
  });

  it.each(['body', 'match'])('Chat keeps touch navigation reachable on the %s root, while pad and ARMORY still hide it', (kind) => {
    const root = kind === 'body' ? document.body : document.body.appendChild(document.createElement('div'));
    root.innerHTML = TOUCH_LAYER_MARKUP;
    root.className = 'touch is-walking is-taunts-open';
    const style = document.createElement('style'); style.textContent = src('styles.css'); document.body.append(style);
    const visible = (id: string): boolean => {
      let el: Element | null = root.querySelector(`#${id}`);
      if (!el) return false;
      while (el) { if (getComputedStyle(el).display === 'none') return false; el = el.parentElement; }
      return true;
    };
    for (const id of ['tw-up', 'tw-down', 'tw-cross', 'tw-circle', 'tw-triangle']) expect(visible(id), id).toBe(true);
    for (const id of ['stick-zone', 'aim-zone', 'tw-r1', 'tw-r2', 'tw-weapons']) expect(visible(id), id).toBe(false);
    for (const hidden of ['pad-on', 'armory-open']) {
      root.classList.add(hidden);
      expect(visible('tw-cross'), hidden).toBe(false);
      root.classList.remove(hidden);
    }
    root.classList.remove('is-taunts-open');
    expect(visible('tw-r1')).toBe(true);
    expect(visible('aim-zone')).toBe(true);
  });

  it.each(['body', 'match'])("OT.R120 (the review's F1): flying with INV shown on the %s root, INV alone of the walk pad shows", (kind) => {
    const root = kind === 'body' ? document.body : document.body.appendChild(document.createElement('div'));
    root.innerHTML = TOUCH_LAYER_MARKUP;
    const style = document.createElement('style'); style.textContent = src('styles.css'); document.body.append(style);
    const visible = (id: string): boolean => {
      let el: Element | null = root.querySelector(`#${id}`);
      if (!el) return false;
      while (el) { if (getComputedStyle(el).display === 'none') return false; el = el.parentElement; }
      return true;
    };
    const inv = root.querySelector<HTMLElement>('#tw-weapons')!;
    const walkPad = ['tw-up', 'tw-cross', 'tw-triangle', 'tw-l1', 'tw-r1', 'tw-r2', 'tw-select', 'tw-start', 'tw-l3'];
    root.className = 'touch';                                                // flying, INV hidden: the walk pad stays gone
    expect(visible('tw-weapons')).toBe(false);
    inv.hidden = false;
    root.className = 'touch is-inv-shown';                                   // flying (watching a teammate), INV shown
    expect(visible('tw-weapons')).toBe(true);
    for (const id of walkPad) expect(visible(id), id).toBe(false);
    expect(visible('touch-lift')).toBe(true);                                // the fly camera's own layer stays
    for (const over of ['is-taunts-open', 'pad-on', 'armory-open']) {
      root.classList.add(over);
      expect(visible('tw-weapons'), over).toBe(false);
      root.classList.remove(over);
    }
    inv.hidden = true;
    expect(visible('tw-weapons')).toBe(false);                               // hidden INV hides, the class or not
    inv.hidden = false;
    root.className = 'touch is-walking is-inv-shown';                        // walking: the whole pad, as before
    expect(visible('tw-weapons')).toBe(true);
    expect(visible('tw-cross')).toBe(true);
  });
});

describe("PAR-5: the menu match's layer -- built under its root from index.html's markup, gone with it", () => {
  it('a menu-to-match transition keeps the menu pad out of the match lookup and restores it on return', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const menu = mountMenuTouch(canvas, window);
    const menuRoot = document.getElementById('menu-touch')!;
    const menuButton = q(menuRoot, 'tw-cross');
    const menuFullscreen = q(menuRoot, 'fullscreen');
    canvas.hidden = true;
    await Promise.resolve();
    const match = mountTouch(document.body, { ...deps().d, build: { zIndex: 1001 } });
    try {
      match.pageState(true, false);
      expect(document.querySelectorAll('[id="fullscreen"]')).toHaveLength(1);
      expect(q(document.body, 'fullscreen')).not.toBe(menuFullscreen);
      const cross = q(document.body, 'tw-cross');
      expect(cross.closest('#menu-touch')).toBeNull();
      expect(cross.closest('[hidden]')).toBeNull();
      ptr(b(document.body, 'R1'), 'pointerdown', 19);
      expect(match.input.fire).toBe(true);
      expect(menu.read().buttons.some(button => button.pressed)).toBe(false);
    } finally { match.dispose(); }
    canvas.hidden = false;
    await Promise.resolve();
    expect(q(menuRoot, 'tw-cross')).toBe(menuButton);
    expect(q(menuRoot, 'fullscreen')).toBe(menuFullscreen);
    expect(document.querySelectorAll('[id="fullscreen"]')).toHaveLength(1);
    expect(document.querySelectorAll('#tw-cross')).toHaveLength(1);
    ptr(menuButton, 'pointerdown', 20);
    expect(menu.read().buttons[0]!.pressed).toBe(true);
    menu.dispose();
  });
  it("TOUCH_LAYER_MARKUP is index.html's #touch and #mobile-tip, element for element (the one markup, pinned)", () => {
    const norm = (el: Element): string => el.outerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
    const built = document.createElement('div');
    built.innerHTML = TOUCH_LAYER_MARKUP;
    expect(norm(built.querySelector('#touch')!)).toBe(norm(page.getElementById('touch')!));
    expect(norm(built.querySelector('#mobile-tip')!)).toBe(norm(page.getElementById('mobile-tip')!));
  });

  it('a root with no layer gets one, stacked over the canvas it is placed above; dispose takes it and every class it set away', () => {
    const root = document.createElement('div');
    document.body.append(root);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    const t = mountTouch(root, { ...deps().d, build: { zIndex: 1001 } });
    const layer = root.querySelector<HTMLElement>('#touch')!;
    expect(layer).not.toBeNull();
    expect(layer.parentElement!.style.zIndex).toBe('1001');
    expect(layer.parentElement!.style.position).toBe('relative');
    t.pageState(true, false);
    expect([...root.classList].sort()).toEqual(['is-walking', 'touch']);
    t.pageState(true, true);
    expect(root.classList.contains('is-taunts-open')).toBe(true);
    t.padConnected(true);
    t.dispose();
    expect(root.querySelector('#touch')).toBeNull();
    expect(root.querySelector('#mobile-tip')).toBeNull();
    expect([...root.classList]).toEqual([]);
  });

  it('a root that has the layer (/testroom) keeps it: nothing built, nothing removed at dispose', () => {
    const a = rootWithLayer();
    const before = a.children.length;
    const t = mountTouch(a, { ...deps().d, build: { zIndex: 1001 } });
    expect(a.children.length).toBe(before);
    t.dispose();
    expect(a.querySelector('#touch')).not.toBeNull();
  });

  it("the tip in the root: shown with its words, 'tip-on' on the root, gone at the close or after the page's time; a pad hides it", () => {
    vi.useFakeTimers();
    const a = rootWithLayer();
    const t = mountTouch(a, deps().d);
    let dismissed = 0;
    t.showTip('words', () => { dismissed++; });
    expect(q(a, 'mobile-tip').hidden).toBe(false);
    expect(q(a, 'mobile-tip-text').textContent).toBe('words');
    expect(a.classList.contains('tip-on')).toBe(true);
    q(a, 'mobile-tip-close').click();
    expect(q(a, 'mobile-tip').hidden).toBe(true);
    expect(dismissed).toBe(1);
    t.showTip('again', () => {});
    vi.advanceTimersByTime(TOUCH_TIP_MS);
    expect(q(a, 'mobile-tip').hidden).toBe(true);
    t.showTip('again', () => {});
    t.padConnected(true);                                                    // `Ui.setPadConnected`'s: a pad hides it
    expect(q(a, 'mobile-tip').hidden).toBe(true);
    t.dispose();
    vi.useRealTimers();
    expect(TOUCH_TIP_MS).toBe(TIP_MS);                                       // `/testroom`'s `Ui` time, the same
  });

  it("mountTip: ./mobileTip's rule -- shown at the start on a touch screen, the pad's words when one is in, dismissed for good", () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', addEventListener: () => {}, removeEventListener: () => {} }));
    const mem = (): TipStore & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } }; };
    const local = mem(), shown: string[] = [];
    const off = mountTip({ local, session: mem(), pads: () => 1, show: (text, dismiss) => { shown.push(text); dismiss(); } });
    expect(shown).toEqual(['Turn your phone sideways (landscape) to play.']);
    expect(local.data.get(TIP_DISMISSED_KEY)).toBe('1');
    off();
  });
});

describe('PAR-5: the wiring -- both pages mount the one part; no page and no part looks the layer up document-wide', () => {
  const main = src('main.ts'), mount = src('matchMount.ts');
  it('main.ts and matchMount.ts each mount it once, on their root; neither attaches the layer or finds INV itself', () => {
    expect(main.match(/\bmountTouch\(document\.body, \{/g)).toHaveLength(1);
    expect(mount.match(/\bmountTouch\(/g)).toHaveLength(1);
    for (const [name, text] of [['main.ts', main], ['matchMount.ts', mount]] as const) {
      expect(text, name).not.toMatch(/\battach(TouchControls|WalkTouch)\(/);
      expect(text, name).not.toMatch(/getElementById\('tw-weapons'\)/);
      expect(text.match(/\bexchangeTaps\(/g), name).toHaveLength(1);
      expect(text.match(/\bmountTip\(/g), name).toHaveLength(1);
      // LATER 132: never the key in a release -- the pad, or the key in a development build only.
      expect(["promptDeviceOf(pads.count(), 'pad')", "promptDeviceOf(pads.count(), import.meta.env.DEV ? 'keyboard' : 'pad')"].some((s) => text.includes(s)), name).toBe(true);
    }
    expect(mount).toMatch(/exchangeTaps\(canvas, exchange, \{ touchOnly: true/);   // a release's match: no mouse (OT.R38)
    expect(main).not.toMatch(/exchangeTaps\([^)]*touchOnly/);                      // /testroom's: a tap or a click, unchanged
  });

  it('the switch: touch on for both pages (OT.R43: the two matches equivalent)', () => {
    expect(TESTROOM_CAPABILITIES.touch).toBe(true);
    expect(FRONT_END_CAPABILITIES.touch).toBe(true);
  });

  it('touch.ts and matchTouch.ts read no element off the document', () => {
    for (const f of ['touch.ts', 'matchTouch.ts']) expect(src(f), f).not.toMatch(/document\.(getElementById|querySelector)/);
  });
});
