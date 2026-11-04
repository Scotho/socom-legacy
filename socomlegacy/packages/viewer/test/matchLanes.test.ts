import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noInput, type Input } from '../src/gamepad';
import { ActionLifecycle } from '../src/actionContext';
import { ExchangeInput } from '../src/exchangeInput';
import { FRONT_END_CAPABILITIES } from '../src/matchCore';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { StanceButton } from '../src/stanceButton';
import { applyPadExtras, PadExtrasState, parsePadExtras } from '../src/padExtras';

/**
 * ONE-WIRE (web research 222): the pad's game lanes in the player update's order (`FUN_00594cf0`: the jump D:L453208, the
 * Action D:L453218, the shoulders D:L453288, the zoom D:L453313, then the stance D:L453331), written once for both pages
 * (`./matchLanes`); each page gives what a shoulder takes and, `/testroom`, the action button's lanes.
 */

function rig(mode: 'walk' | 'fly' = 'walk', withAction = true) {
  const calls: string[] = [];
  const l: LaneParts = {
    walk: {
      mode: () => mode, isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand',
      jump: () => { calls.push('jump'); return true; }, crouch: () => { calls.push('crouch'); return true; }, setStance: (s) => { calls.push(`stance:${s}`); return true; },
    },
    firearm: {
      stepZoom: (how) => { calls.push(`zoom:${how}`); return 1; },
      switchFireMode: () => { calls.push('fireMode'); return 'auto'; },
      viewLanes: (walking) => { calls.push(`view:${walking}`); },
      fire: { reload: () => { calls.push('reload'); return true; } },
    },
    stanceButton: new StanceButton(),
    shoulder: (which) => { calls.push(`shoulder:${which}`); },
    ...(withAction ? { action: () => { calls.push('action'); } } : {}),
  };
  return { l, calls };
}
const pressed = (flags: Partial<Input>): Input => ({ ...noInput(), ...flags });

describe('playerLanes: the game lanes in the player update\'s order', () => {
  it('the jump, the action, the shoulders, the zoom, the fire mode, the reload, then the crouch and the view', () => {
    const { l, calls } = rig();
    // ALTERNATE (`DAT_0044d500` 1): the fire mode at its first press, so one frame shows the order (research 254 s3);
    // DEFAULT's double tap and held repeat are the next test's and `fireModeInput.test.ts`'s.
    l.fireModeSetting = () => 'alternate';
    const before = pressed({ crouch: true });
    const after = pressed({ jump: true, swap1: true, swap2: true, zoom: true, zoomOut: true, fireMode: true, reload: true });
    playerLanes(l, before, after, 1 / 60, { walking: true, menu: false });
    expect(calls).toEqual(['jump', 'action', 'shoulder:l1', 'shoulder:l2', 'zoom:in', 'zoom:out', 'fireMode', 'reload', 'crouch', 'view:true']);
  });
  it('DEFAULT (no setting stored): a first press switches nothing, a second inside .25 s switches once, and off the walk nothing is taken (research 254)', () => {
    const { l, calls } = rig();
    const up = noInput(), down = pressed({ fireMode: true });
    for (const [b, a] of [[up, down], [down, up]] as const) playerLanes(l, b, a, 1 / 60, { walking: true, menu: false });
    expect(calls.filter((c) => c === 'fireMode')).toEqual([]);
    playerLanes(l, up, down, 1 / 60, { walking: true, menu: false });
    expect(calls.filter((c) => c === 'fireMode')).toEqual(['fireMode']);
    const fly = rig('fly');
    for (const [b, a] of [[up, down], [down, up], [up, down]] as const) playerLanes(fly.l, b, a, 1 / 60, { walking: false, menu: false });
    expect(fly.calls.filter((c) => c === 'fireMode')).toEqual([]);
  });
  it('RUN AND TALK on: SwapWeapon2 talks, so its swap is suppressed (FUN_00594cf0 D:L453301-453310, research 170 C8); the rest unchanged', () => {
    const { l, calls } = rig();
    const before = pressed({ crouch: true });
    const after = pressed({ jump: true, swap1: true, swap2: true, zoom: true, zoomOut: true, fireMode: true, reload: true });
    l.fireModeSetting = () => 'alternate';   // PAR-22: the fire mode at its first press, as the lane-order case (research 254 s3)
    playerLanes(l, before, after, 1 / 60, { walking: true, menu: false, runAndTalk: true });
    expect(calls).toEqual(['jump', 'action', 'shoulder:l1', 'zoom:in', 'zoom:out', 'fireMode', 'reload', 'crouch', 'view:true']);
  });
  it('a menu over the game takes every lane: nothing reaches the game, not even the view lines', () => {
    const { l, calls } = rig();
    playerLanes(l, noInput(), pressed({ jump: true, swap1: true, zoom: true, reload: true }), 1 / 60, { walking: true, menu: true });
    expect(calls).toEqual([]);
  });
  it('off the walk: no jump and no shoulder; the zoom is still asked (it refuses itself), the view lines told off', () => {
    const { l, calls } = rig('fly');
    playerLanes(l, noInput(), pressed({ jump: true, swap1: true, zoom: true, fireMode: true, reload: true }), 1 / 60, { walking: false, menu: false });
    expect(calls).toEqual(['action', 'zoom:in', 'view:false']);
  });
  it("the front end: the action lanes since ACT-3 (acts.lanes through LaneParts.action), the same line main.ts has", () => {
    // Research 250 s4 (ruling ACT.R3): both pages hand `playerLanes` the action part's lanes, one line written alike.
    const line = /\n\s+action: \(before, after, dt\) => \{ acts\.lanes\(before, after, dt\); \},/;
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).toMatch(line);
    // The lane stays optional (`LaneParts.action`): parts without it run the rest, as before.
    const { l, calls } = rig('walk', false);
    playerLanes(l, noInput(), pressed({ jump: true }), 1 / 60, { walking: true, menu: false });
    expect(calls).toEqual(['jump', 'view:true']);
  });
});

describe('WEAPON EXCHANGE\'s held buttons ahead of the lanes (research 300 §3, Chris\'s fa657438)', () => {
  // The Action lane's edges (`/testroom`'s lifecycle: the press, the hold that a pickup or a plant times, the release).
  function edges(): { l: LaneParts; seen: string[] } {
    const seen: string[] = [];
    const { l } = rig();
    l.action = (before, after) => {
      if (after.action && !before.action) seen.push('press');
      else if (!after.action && before.action) seen.push('release');
      else if (after.action) seen.push('held');
    };
    return { l, seen };
  }
  it('a Cross held in the menu through its close reaches the Action lane as nothing until let go; the next press is a press', () => {
    const { l, seen } = edges();
    const owner = new ExchangeInput();
    const cross = pressed({ action: true });
    let before = noInput();
    const frame = (raw: Input, menu: boolean): void => {
      const after = owner.frame(raw, menu);
      playerLanes(l, before, after, 1 / 60, { walking: true, menu });
      before = after;
    };
    frame(cross, true);                                // Cross confirms in the menu
    frame(cross, true);
    for (let i = 0; i < 200; i++) frame(cross, false); // closed (a round reset or the menu's own close), Cross still held 3.3 s
    expect(seen).toEqual([]);                          // no press, no hold: never a pickup or a plant
    frame(noInput(), false);
    frame(cross, false);
    expect(seen).toEqual(['press']);
  });
  it('PF-34\'s pickup (the real ActionLifecycle, a drop in reach): the menu\'s Cross claims nothing; a fresh press and release does', () => {
    const { l } = rig();
    const life = new ActionLifecycle(() => 'pickup');
    const fired: string[] = [];
    l.action = (before, after, dt) => {                // matchActions' lanes: press, release, hold, the prompt's 3 s
      const step = after.action && !before.action ? life.press() : !after.action && before.action ? life.release() : null;
      if (step?.fire) fired.push(step.fire);
      life.hold(dt);
      life.elapse(dt, true);
    };
    const owner = new ExchangeInput();
    let before = noInput();
    const frame = (raw: Input, menu: boolean): void => {
      const after = owner.frame(raw, menu);
      playerLanes(l, before, after, 1 / 60, { walking: true, menu });
      before = after;
    };
    const cross = pressed({ action: true });
    frame(cross, true);                                // Cross confirms the exchange, the round resets under it
    for (let i = 0; i < 200; i++) frame(cross, false); // respawned beside a drop, Cross still held
    frame(noInput(), false);                           // let go: no release reaches the lifecycle
    expect(fired).toEqual([]);
    expect(life.pickupHeld()).toBe(false);
    frame(cross, false);
    frame(noInput(), false);
    expect(fired).toEqual(['pickup']);
    expect(life.pickupHeld()).toBe(true);              // the prompt's hold after a claim
  });
  it('/testroom applies the ownership before the trigger lane, the R2 inventory and playerLanes; the front end the same since PAR-1', () => {
    const main = src('main.ts');
    const at = (needle: string): number => { const i = main.indexOf(needle, main.indexOf('function padFrame(')); expect(i, needle).toBeGreaterThan(0); return i; };
    const owned = at('input = exchangeInput.frame(input, menu);');
    expect(owned).toBeLessThan(at('trigger(input.fire)'));
    expect(owned).toBeLessThan(at('inventory.frame(padMerged, input, dt, frameTime.real())'));
    expect(owned).toBeLessThan(at('playerLanes(lanes, padGame, game, frameTime.real(), { walking, menu, runAndTalk: startMenu.runAndTalk() })'));
    expect(main).toMatch(/blocked: \(\) => loadingJoin\.blocked \|\| armory\.isOpen\(\) \|\| exchange\.isOpen\(\) \|\| taunts\.isOpen\(\),/);
    // The review's round (2026-10-06): a screen taking the pad lets a held trigger go; the loading hold's flushed
    // baseline is owned too (no release edge after it); the ARMORY's keys are owned as the exchange's; the stance
    // button forgets a tap or a hold as a screen opens.
    expect(main).toMatch(/else if \(menu && padMerged\.fire\) trigger\(false\);/);
    const loading = main.slice(at('if (loadingJoin.blocked) {'), at('pads.poll(navigator);                                // the toasts'));
    expect(loading).toMatch(/flushedPad\(touchInput, heldInput\)\);[^]*padMerged = exchangeInput\.frame\(padMerged, false\);\n\s*padGame = exchangeInput\.frame\(padGame, false\);[^]*return;/);
    expect(main).toMatch(/if \(!e\.repeat\) armory\.key\(e\.code\);\n\s*exchangeInput\.key\(e\.code, true, true, e\.repeat\);/);
    expect(main).toMatch(/if \(over && !menuOver\) \{ cancelAction\(over\); stanceButton\.reset\(\); \}/);
    // PAR-1 (research 253): the front end mounts the one part (`./matchExchange`) and owns the pad in the same place.
    expect(FRONT_END_CAPABILITIES.exchange).toBe(true);
    const mount = src('matchMount.ts');
    expect(mount).not.toMatch(/new ExchangeInput|new WeaponExchange/);
    const m = (needle: string): number => { const i = mount.indexOf(needle, mount.indexOf('const padFrame = ')); expect(i, needle).toBeGreaterThan(0); return i; };
    const mounted = m('const input = exchange.input.frame(chat.input, menu);');
    expect(m('const menu = start.owns || chat.owns || (armory.isOpen() ? armory.pad(edges) : exchange.pad(edges));')).toBeLessThan(mounted);   // PAR-2: the ARMORY's first
    expect(mounted).toBeLessThan(m('firearm.triggerLane(padMerged, input);'));
    expect(mounted).toBeLessThan(m('throws.inventory.frame(padMerged, input, dt, frameTime.real())'));
    expect(mounted).toBeLessThan(m('playerLanes(lanes, padGame, game, frameTime.real(), { walking, menu, runAndTalk: startMenu.runAndTalk() });'));
  });
});

describe('h59U9CLb (a browser adaptation, not wired): an extra adding the stance on the jump\'s press', () => {
  it('the jump and the added stance on one frame: the fresh stance press closes the pop\'s window first, so the jump is no pop', () => {
    const { l, calls } = rig();
    let windowOpen = true;                                   // a drop under way: the pop's window open
    l.walk.stanceMode = () => 'pop';
    l.walk.disarmPop = () => { windowOpen = false; calls.push('disarm'); };
    l.walk.jumpPress = () => { calls.push(windowOpen ? 'pop' : 'jump:native'); return true; };
    const extras = parsePadExtras({ version: 1, doubles: [{ button: 2, action: 'stance' }] }, { overlayButton: 16, heldBinds: [] }).extras;
    const state = new PadExtrasState();
    const square = Array<boolean>(20).fill(false); square[2] = true;
    const before = applyPadExtras(extras, noInput(), Array<boolean>(20).fill(false), state, false);
    const after = applyPadExtras(extras, pressed({ jump: true }), square, state, false);
    expect(after.stance && after.jump).toBe(true);
    playerLanes(l, before, after, 1 / 60, { walking: true, menu: false });
    // The lanes' own disarm (OT.R76) before the jump; the stance button's machine disarms again after it (its own seam).
    expect(calls).not.toContain('pop');
    expect(calls.indexOf('disarm')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('disarm')).toBeLessThan(calls.indexOf('jump:native'));
  });
});

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

describe('one lane order: both pages read the pad through playerLanes', () => {
  it('main.ts and matchMount.ts call playerLanes and read no zoom, fire-mode or reload edge themselves', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/playerLanes\(/);
      expect(src(f), f).not.toMatch(/pressed\.includes\('(zoom|zoomOut|fireMode|reload|swap1|swap2)'\)/);
    }
  });
});

// Phil's (PR #625, himynameisphil), kept by the reconciliation of 2026-11-02 (research 373 §2): a cancelled frame -- the
// WebHID reader's stall (`./pressurePad`, 250 ms) or the overlay's synthetic neutral (`./modern/overlay` `untouched`) --
// is no release, in either Stance mode. PS2P kept the cancel in SEPARATE's pressure reader (`StancePress`) only; in
// COMBINED the neutral read as Triangle let go, and the tap's crouch fired. Browser adaptations, with no original: none
// may make the game act.
describe('a cancelled frame is no release (research 373 §2; Phil\'s, PR #625)', () => {
  const stances = (calls: string[]): string[] => calls.filter((s) => s.startsWith('stance:'));
  it('USB synthetic neutral cancels a light native press without crouching at the timeout', () => {
    const { l, calls } = rig();
    const held = pressed({ stance: true, stancePressure: 0.2 });
    const cancelled = pressed({ stancePressure: 0, stanceCancelled: true });
    playerLanes(l, noInput(), held, 1 / 60, { walking: true, menu: false });
    playerLanes(l, held, cancelled, 1 / 60, { walking: true, menu: false });
    expect(stances(calls)).toEqual([]);
    const released = pressed({ stancePressure: 0 });
    playerLanes(l, cancelled, released, 1 / 60, { walking: true, menu: false });
    playerLanes(l, released, held, 1 / 60, { walking: true, menu: false });
    playerLanes(l, held, released, 1 / 60, { walking: true, menu: false });
    expect(stances(calls)).toEqual(['stance:crouch']);
  });

  it('the overlay\'s synthetic neutral over a digital pad\'s Triangle (COMBINED): no tap, and the pop\'s window closed', () => {
    const { l, calls } = rig();
    l.walk.stanceMode = () => 'pop';
    l.walk.disarmPop = () => { calls.push('disarm'); };
    const held = pressed({ stance: true });
    const opened = pressed({ stanceCancelled: true });
    playerLanes(l, noInput(), held, 1 / 60, { walking: true, menu: false });
    calls.length = 0;
    playerLanes(l, held, opened, 1 / 60, { walking: true, menu: false });
    playerLanes(l, opened, opened, 1 / 60, { walking: true, menu: false });
    playerLanes(l, opened, noInput(), 1 / 60, { walking: true, menu: false });   // the overlay closed, the button at rest
    expect(stances(calls)).toEqual([]);
    expect(calls).toContain('disarm');
  });

  it('the review\'s F1: a Crouch bind held when the frame is cancelled is no release -- no crouch until a real one', () => {
    const { l, calls } = rig();
    const crouch = (c: string[]): string[] => c.filter((s) => s === 'crouch');
    const held = pressed({ crouch: true });
    const cancelled = pressed({ stanceCancelled: true });
    playerLanes(l, noInput(), held, 1 / 60, { walking: true, menu: false });
    playerLanes(l, held, cancelled, 1 / 60, { walking: true, menu: false });
    playerLanes(l, cancelled, cancelled, 1 / 60, { walking: true, menu: false });
    playerLanes(l, cancelled, noInput(), 1 / 60, { walking: true, menu: false });
    expect(crouch(calls)).toEqual([]);
    playerLanes(l, noInput(), held, 1 / 60, { walking: true, menu: false });
    playerLanes(l, held, noInput(), 1 / 60, { walking: true, menu: false });
    expect(crouch(calls)).toEqual(['crouch']);
  });
});
