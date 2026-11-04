import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FrameTime } from '../src/frameTime';
import { devClockDt, devClockState } from '../src/devClock';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * cps-frame-hash-2 (CPS.R9 (e)'s frame identity gate; product track, a dev instrument): `window.__viewer.holdFrame(true)`
 * holds the page's frame clock (`./frameTime` `FrameTime.hold`) so every clock the world reads off the frame -- the
 * clamped step `dt` (the scrolling textures in `world.frame`, the effects' runs and particles in `effects.update`, the
 * scene programs in `pageWorld.step`, the fly camera, the bodies) and the frame's real seconds (`frameTime.real()`: the
 * spectator's look, the throws' timed rules, the body's lowering, the turret's cadence) -- reads 0 while the gate hashes.
 * The game's paths are not forked: the one clock they read is held, in the frame loop. A development build's only.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

describe('cps-frame-hash-2: FrameTime.hold, the frame clock held at 0', () => {
  it('held, every frame reads 0 seconds and real() 0, however far the clock runs', () => {
    const t = new FrameTime();
    t.frame(1000);
    t.frame(1016);
    t.hold(true);
    expect(t.frame(1500)).toBe(0);
    expect(t.real()).toBe(0);
    expect(t.frame(9000)).toBe(0);
    expect(t.real()).toBe(0);
  });
  it('released, the next frame counts from the last held frame, never the held span (no jump)', () => {
    const t = new FrameTime();
    t.frame(1000);
    t.hold(true);
    t.frame(5000);
    t.hold(false);
    expect(t.frame(5000 + 1000 / 60)).toBeCloseTo(1 / 60, 12);
  });
  it('unheld (every production frame), the clock is the one it was: a 0.2 s frame reads 0.2', () => {
    const t = new FrameTime();
    t.frame(5000);
    expect(t.frame(5200)).toBeCloseTo(0.2, 12);
  });
  it('the frame loop\'s dt held: the clamp of 0 is 0, and the dev panel\'s clock passes 0 at any scale or paused', () => {
    const t = new FrameTime();
    t.frame(0);
    t.hold(true);
    const raw = Math.min(t.frame(250), 0.1);                 // main.ts's `const dt` line
    expect(raw).toBe(0);
    for (const scale of [1, 0.5, 0.25, 0]) expect(devClockDt({ scale, step: false }, raw).dt).toBe(0);
    expect(devClockDt(devClockState(), raw).dt).toBe(0);
  });
});

/** main.ts's frame loop, from `const frame = (): void => {` to its `requestAnimationFrame(frame);`. */
function frameLoop(): string {
  const main = src('main.ts');
  const start = main.indexOf('\n  const frame = (): void => {\n');
  const end = main.indexOf('\n    requestAnimationFrame(frame);\n', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('cps-frame-hash-2: every world clock of the frame loop reads the held frame clock', () => {
  it('the outer dt is FrameTime\'s, the inner one the panel\'s scaling of it -- no other clock feeds the frame', () => {
    const loop = frameLoop();
    expect(loop).toContain('\n    const dt = Math.min(frameTime.frame(performance.now()), 0.1);');
    expect(loop).toContain('\n    const raw = dt;\n    {\n      const dt = scaleDt(raw);');
    expect(loop).not.toMatch(/getDelta\(\)|Clock\(\)/);
  });
  it('the world\'s frame (the scrolls), the effects\' step (the runs, the particles), the scene programs, the camera and the bodies take that dt; the timed rules frameTime.real()', () => {
    const loop = frameLoop();
    const inner = loop.slice(loop.indexOf('const dt = scaleDt(raw);'));
    for (const call of [
      'fly.update(dt);',
      'walk.frame(dt);',
      'pageWorld?.step(dt);',
      'firearm.effectsFrame(dt, fly.camera);',
      'view?.frame(fly.camera, dt, zoom.renderView());',
      'play.frame(dt, walk, fly.camera, frameTime.real(),',
      'net?.frame(dt, fly.camera, fire.triggerHeld() || acts.triggerHeld(), frameTime.real());',
      'created.setGlow(throws.frame(dt, frameTime.real()));',
      'charShadow.frame(created.renderer, scene, body?.group ?? null);',
    ]) expect(inner, call).toContain(call);
    expect(inner.indexOf('view?.frame(fly.camera, dt')).toBeLessThan(inner.indexOf('\n      render(scene, fly.camera);'));
  });
  it('the effects step on the dt they are handed (matchFirearm: `effects.update(dt, camera)`)', () => {
    expect(src('matchFirearm.ts')).toContain('effectsFrame: (dt, camera) => { effects.update(dt, camera); },');
  });
  it('the world\'s scrolls advance by the frame\'s dt alone (world.ts `frame`)', () => {
    const world = src('world.ts');
    expect(world).toContain('v.x = (v.x + s.du * dt * SCROLL_TICKS_PER_SECOND) % 1;');
    expect(world).toContain('v.y = (v.y + s.dv * dt * SCROLL_TICKS_PER_SECOND) % 1;');
  });
});

describe('cps-frame-hash-2: holdFrame is a development build\'s only', () => {
  it('main.ts hangs it under the dev panel\'s gate, beside frameHash, over the page\'s frame clock', () => {
    const main = src('main.ts');
    expect(main).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) window\.__viewer\.holdFrame = \(on\) => \{ frameTime\.hold\(on\); \};/);
    expect(main.match(/holdFrame/g)?.length).toBe(1);
    expect(main.indexOf('window.__viewer.holdFrame')).toBeGreaterThan(main.indexOf('window.__viewer.frameHash'));
  });
  it('the hook declares it optional (absent in a release and without ?devmode)', () => {
    expect(src('hook.ts')).toMatch(/\n {2}holdFrame\?\(on: boolean\): void;/);
  });
});

const dist = readBuiltDist(VIEWER_DIST);
describe.skipIf(!dist.built)(builtTitle('the built viewer has no holdFrame (cps-frame-hash-2; OT.R29\'s rule for dev tools)', dist), () => {
  it('its hook name is absent from dist/viewer/assets/*.js', () => {
    expect(dist.js).not.toContain('holdFrame');
  });
});
