// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeInput } from '../src/exchangeInput';
import { noInput, PAD_BUTTON, padInput, type Input, type PadButton } from '../src/gamepad';
import { InventoryMenu, type InventoryHost } from '../src/inventoryMenu';
import { GamePad } from '../src/setupPad';
import { STANCE_FULL_PRESS_READING } from '../src/stanceButton';
import { SETUP_KEY, defaultController, setControllerStanceMode, type ControllerConfig } from '../src/startupSettings';
import { padButtonsDown } from '../src/weaponExchange';

/**
 * OT.R107's fold (the owner, 2026-11-06: "everywhere that people have assigned prone when in separate mode should also
 * serve the action of triangle"; the controller b6's call on the seam): in SEPARATE on a pressure pad the Prone bind's
 * press is decided frames after it starts (`./controllerInput` `StancePress`: the full press when its pressure reaches
 * `STANCE_FULL_PRESS_READING`). A menu that takes the press as Triangle and closes on its first frame -- WEAPON
 * EXCHANGE's back, the R2 inventory's close -- is gone by then, so nothing holds the late Prone. Both pages cancel the
 * pending press on each frame a menu holds the pad's Triangle -- the pad's `stance` the game did not get
 * (`gamePad.cancelStancePress()`, beside the XR-06 menu cancel) -- so it waits for the button's rest: the press a menu
 * took is never a Prone, and a press begun after the menu went arms as any (the fold's review F2). The re-review: the
 * cancel reads this poll's raw Prone value (a 60 or 144 Hz poll may step no 30 Hz game frame) and drops only a press as
 * old as the menu's take, so a press begun under a take already held (Triangle's own button) is Prone.
 */

type Pad = { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pad = (): Pad => ({ index: 0, id: 'Pad 0', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: Pad, c: Partial<ControllerConfig>): void => { localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c })); };
const TRIANGLE = PAD_BUTTON.Triangle;
/** The press: light, rising past the full press over the frames after its first, held, let go. */
const RISE = [0.1, 0.2, STANCE_FULL_PRESS_READING + 0.2, 1, 1, 1, 0, 0, 0];

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/**
 * The pages' pad frame in its order (`../src/matchMount` `padFrame`, `../src/main`): the reader, the game's input with the
 * binds, the menu (a WEAPON EXCHANGE stand-in: open, Triangle's press is its back and closes it, `menuInputOfPad`), the
 * consumed lanes (`./exchangeInput`), the R2 inventory, then the XR-06 cancel and the stance press's with it.
 */
function page(o: { exchangeOpen?: boolean; cancel?: boolean; prone?: number; hz?: number; phase?: number }) {
  const p = pad();
  const proneButton = o.prone ?? TRIANGLE;
  saveProfile(p, { prone: proneButton, nativePressure: true });
  setControllerStanceMode('separate');
  const src = { getGamepads: () => [p] };
  // The fold's re-review: the pages' clock (`pressClock`, 30 Hz game frames) polled at the display's rate `hz` -- polls
  // that step no game frame among them; `phase` shifts the press against the frame boundary.
  let now = 0;
  const gp = new GamePad({ waitForRest: false, ...(o.hz ? { pressClock: () => now } : {}) });
  const consume = new ExchangeInput();
  const host: InventoryHost = {
    kit: () => ({ count: 5, current: 0, takeable: () => true }), alive: () => true, canChange: () => true, take: () => true,
    icon: () => null, info: () => null, clock: () => 0,
  };
  const inventory = new InventoryMenu(host);
  let exchangeOpen = o.exchangeOpen ?? false;
  let last = new Set<PadButton>();
  let merged: Input = noInput();
  const prones: boolean[] = [];
  const frame = (value: number, extra: Partial<Input> = {}, closeNow = false, triangle?: number): void => {
    if (o.hz) now += 1000 / o.hz;
    p.buttons[proneButton] = { pressed: value > 0, value };
    if (proneButton !== TRIANGLE) p.buttons[TRIANGLE] = { pressed: (triangle ?? 0) > 0, value: triangle ?? 0 };
    const polled = gp.poll(src);
    const input = { ...padInput(polled), ...extra };
    if (gp.prone) input.prone = true;
    const down = padButtonsDown(polled);
    const edges = new Set([...down].filter((b) => !last.has(b)));
    last = down;
    const was = exchangeOpen;
    if (exchangeOpen && (closeNow || edges.has('Triangle'))) exchangeOpen = false;   // `closeNow`: another button's close
    const menu = was || exchangeOpen;
    const game0 = consume.frame(input, menu);
    const game = menu ? game0 : inventory.frame(merged, game0, 1 / 60);
    merged = game0;
    if (o.cancel !== false && input.stance && !game.stance) gp.cancelStancePress();
    prones.push(game.prone);
  };
  for (let i = 0; i < 5 + (o.phase ?? 0); i++) frame(0);
  return { frame, prones, inventory, exchangeOpen: () => exchangeOpen };
}

describe('OT.R107 fold: a Prone press a menu takes as Triangle is never a late Prone', () => {
  it('the control: with no cancel, the full press decided after WEAPON EXCHANGE closed on its first frame reaches the game as Prone', () => {
    const r = page({ exchangeOpen: true, cancel: false });
    for (const v of RISE) r.frame(v);
    expect(r.exchangeOpen()).toBe(false);
    expect(r.prones).toContain(true);
  });

  it('WEAPON EXCHANGE: the press closes it on its first frame, the pressure rises to full after, and the game sees no Prone', () => {
    const r = page({ exchangeOpen: true });
    r.frame(RISE[0]!);
    expect(r.exchangeOpen(), 'its back on the press').toBe(false);
    for (const v of RISE.slice(1)) r.frame(v);
    expect(r.prones).not.toContain(true);
  });

  it('the R2 inventory: the press closes it as Triangle, the pressure rises to full after, and the game sees no Prone', () => {
    const r = page({});
    r.frame(0, { inventory: true }); r.frame(0);
    for (let i = 0; i < 12; i++) r.frame(0);
    expect(r.inventory.isOpen()).toBe(true);
    r.frame(RISE[0]!);
    expect(r.inventory.isOpen(), 'Triangle\'s close on the press').toBe(false);
    for (const v of RISE.slice(1)) r.frame(v);
    expect(r.prones).not.toContain(true);
  });

  // The fold's review F2: a menu closed by another button with the Prone button at rest, and a fresh press on the very
  // next game frame -- no menu read it, so it arms and decides as any press.
  it('a fresh press on the first frame after a menu closed (the button at rest then) rises to full and is Prone', () => {
    const r = page({ exchangeOpen: true });
    for (let i = 0; i < 4; i++) r.frame(0);
    r.frame(0, {}, true);
    expect(r.exchangeOpen()).toBe(false);
    r.prones.length = 0;
    for (const v of RISE) r.frame(v);
    expect(r.prones).toContain(true);
  });

  // The fold's re-review (blocking): at 60 Hz and 144 Hz a poll can step no game frame, so the press's first poll leaves
  // the stepped rest as it was; the next stepped poll decides the full press after the menu closed on the first.
  for (const hz of [60, 144]) {
    it(`${hz} Hz: WEAPON EXCHANGE closed on the press's first poll (no game frame stepped there at some phase), no Prone after`, () => {
      for (let phase = 0; phase < Math.ceil(hz / 30) + 1; phase++) {
        const r = page({ exchangeOpen: true, hz, phase });
        r.frame(RISE[0]!);
        expect(r.exchangeOpen(), `phase ${phase}`).toBe(false);
        for (const v of [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]) r.frame(v);   // full on the next poll, the first that steps
        expect(r.prones, `phase ${phase}`).not.toContain(true);
      }
    });
    it(`${hz} Hz: a fresh press after the close (the button at rest then) is Prone at every phase`, () => {
      for (let phase = 0; phase < Math.ceil(hz / 30) + 1; phase++) {
        const r = page({ exchangeOpen: true, hz, phase });
        r.frame(0, {}, true);
        r.prones.length = 0;
        for (const v of [0.1, 0.2, 0.5, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]) r.frame(v);
        expect(r.prones, `phase ${phase}`).toContain(true);
      }
    });
  }

  // The re-review's finding 2: Triangle's own button held by WEAPON EXCHANGE past its close (its Triangle owned until let
  // go, `./exchangeInput`), and a press on Prone's own button (R3) begun after the close -- no menu took it: Prone.
  it('Prone on R3: the Triangle button held by a menu after its close does not eat a later Prone press', () => {
    const R3 = PAD_BUTTON.R3;
    const r = page({ exchangeOpen: true, prone: R3 });
    r.frame(0, {}, false, 1);                            // Triangle's own press closes the menu
    expect(r.exchangeOpen()).toBe(false);
    r.frame(0, {}, false, 1); r.frame(0, {}, false, 1);
    r.prones.length = 0;
    for (const v of RISE) r.frame(v, {}, false, 1);      // Triangle still held: its lane still the menu's
    expect(r.prones).toContain(true);
  });

  it('after the rest, a new press with no menu over the game is Prone again', () => {
    const r = page({ exchangeOpen: true });
    for (const v of RISE) r.frame(v);
    r.prones.length = 0;
    for (const v of RISE) r.frame(v);
    expect(r.prones).toContain(true);
  });

  it('both pages cancel the press a menu took beside the XR-06 menu cancel, one call each', () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f).match(/if \(pad\.stance && !game\.stance\) gamePad\.cancelStancePress\(\);/g), f).toHaveLength(1);
    }
  });
});
