import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type {} from '../src/hook';
import { measureHold, mustSeparate, mustToss, shorterHold, type Hold } from './grenadeHold';
import { holdReleased } from './loadHold';

// A browser playtest instrument: normal R1/Triangle/Square input, observed every rendered frame.
// Fixture setup alone uses dev hooks. No timing or gameplay rules are changed by this spec.
type Source = 'mobile' | 'controller';
type Sample = { t: number; phase: string; power: number; clip: string | null; thrown: boolean;
  stance: string; airborne: boolean; feet: number[] | null };
type Trace = { frames: Sample[]; marks: Record<string, number>; active: boolean };
type ProbeWindow = Window & { __grenadeFlow: Trace };

test.use({ hasTouch: true, isMobile: true, viewport: { width: 915, height: 412 }, storageState: { cookies: [], origins: [] } });

class Inputs {
  private points = new Map<number, { id: number; x: number; y: number }>();
  constructor(private page: Page, private cdp: CDPSession, readonly source: Source) {}
  async button(id: 'r1' | 'triangle' | 'square', down: boolean) {
    if (this.source === 'controller') {
      await this.page.evaluate(({ id, down }) => {
        Object.assign(navigator.getGamepads()[0]!.buttons[{ r1: 5, triangle: 3, square: 2 }[id]]!, { pressed: down, value: down ? 1 : 0 });
      }, { id, down });
      return;
    }
    const key = { r1: 1, triangle: 2, square: 3 }[id];
    if (down) {
      const b = (await this.page.locator(`#tw-${id}`).boundingBox())!;
      this.points.set(key, { id: key, x: b.x + b.width / 2, y: b.y + b.height / 2 });
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...this.points.values()] });
    } else {
      const point = this.points.get(key)!; this.points.delete(key);
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point] });
    }
  }
  async tap(id: 'triangle' | 'square') { await this.button(id, true); await this.page.waitForTimeout(80); await this.button(id, false); }
  async move(on: boolean) {
    if (this.source === 'controller') {
      await this.page.evaluate(on => { (navigator.getGamepads()[0]!.axes as number[])[1] = on ? -1 : 0; }, on);
    } else if (on) {
      const b = (await this.page.locator('#stick-zone').boundingBox())!;
      const p = { id: 4, x: b.x + b.width / 2, y: b.y + b.height / 2 };
      this.points.set(4, p);
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...this.points.values()] });
      p.y -= 70;
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...this.points.values()] });
    } else {
      const point = this.points.get(4)!; this.points.delete(4);
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point] });
    }
  }
}

async function prepare(page: Page, source: Source) {
  await page.addInitScript(source => {
    const pad = { id: 'Grenade flow pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => source === 'controller' ? [pad] : [] });
  }, source);
  await page.goto('/testroom?mode=play&fly&devmode&map=MP2&kit=54,15,121,126,122');
  await expect(page.locator('#status')).toContainText(/triangles|tris/);
  await holdReleased(page);
  await page.evaluate(() => { document.getElementById('mobile-tip-close')?.click(); window.__viewer.setMode('walk'); });
  await page.addStyleTag({ content: '#playtest-overlay { display:none!important }' });
  return new Inputs(page, await page.context().newCDPSession(page), source);
}

async function reset(page: Page, stance: 'stand' | 'crouch' | 'prone') {
  await page.evaluate(stance => {
    const v = window.__viewer;
    v.resetGrenades(); v.setCamera({ x: 796, y: 115.4, z: 614, yaw: 240, pitch: 12 });
    v.setStance(stance); v.selectItem('M67');
  }, stance);
  await expect.poll(() => page.evaluate(() => window.__viewer.stance())).toBe(stance);
  // The setup's stance transition has finished (B112 review F5: a fixed 1300 ms could start the throw mid-transition on a
  // slow renderer): the body's clip settled (its cross-fade weight 1) and no stance transition clip playing.
  // Two frames first: setStance starts the mover's transition at once, the animator switches clips a frame later, so
  // a poll at once could read the old stance's settled clip (the B113 narrow review).
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await expect.poll(() => page.evaluate(() => {
    const a = window.__viewer.stats().anim;
    return a !== null && a.blend >= 1 && !/(stand|crouch|dive)2(crouch|prone)/.test(a.clip);
  }), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().phase)).toBe('ready');
  await page.evaluate(() => {
    const trace: Trace = { frames: [], marks: {}, active: true };
    (window as unknown as ProbeWindow).__grenadeFlow = trace;
    // Registered after the game's frame callback, so it runs after it every frame: `t` is no earlier than the game's
    // clock read this frame and earlier than the next one's -- `./grenadeHold` brackets the counted hold with it.
    const frame = () => {
      if (!trace.active) return;
      const v = window.__viewer, g = v.grenade(), m = v.mover();
      trace.frames.push({ t: performance.now(), phase: g.phase, power: g.power, clip: v.throwClip().clip,
        thrown: g.lastThrow !== null, stance: v.stance(), airborne: m?.airborne ?? false, feet: v.feet() });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  // Two probe samples before any press, so a hold's first raising frame always has a sample two before it and the
  // counted hold an upper bound (`./grenadeHold`; the fresh review's blocker: a press before the second sample left none).
  await page.waitForFunction(() => (window as unknown as ProbeWindow).__grenadeFlow.frames.length >= 2);
}
async function mark(page: Page, key: string) {
  await page.evaluate(key => { (window as unknown as ProbeWindow).__grenadeFlow.marks[key] = performance.now(); }, key);
}
async function release(page: Page, input: Inputs, power: number) {
  await mark(page, 'press'); await input.button('r1', true);
  // The target seen from inside the page, the frame it is reached (marked there), then one round trip to let go: was a
  // 10 ms poll, a mark and the release, each a round trip, which a slow renderer stretched into a longer hold. The
  // hold the game counted is measured from the trace either way (`finish`, `./grenadeHold`).
  // The controller's pad is the page's own stub, so its R1 is let go in the same check, the frame the target is seen;
  // the touch release needs the CDP round trip below.
  const seen = await page.evaluate(({ target, pad }) => new Promise<boolean>(resolve => {
    const until = performance.now() + 5000;
    const check = () => {
      if (window.__viewer.grenade().power >= target) {
        (window as unknown as ProbeWindow).__grenadeFlow.marks.release = performance.now();
        if (pad) Object.assign(navigator.getGamepads()[0]!.buttons[5]!, { pressed: false, value: 0 });
        resolve(true);
      } else if (performance.now() > until) resolve(false);
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), { target: power, pad: input.source === 'controller' });
  expect(seen, `the held power reached ${power} within 5 s`).toBe(true);
  await input.button('r1', false);
  await expect.poll(() => page.evaluate(() => window.__viewer.grenade().lastThrow !== null), { intervals: [10], timeout: 5000 }).toBe(true);
}
async function finish(page: Page, name: string) {
  const data = await page.evaluate(() => {
    const t = (window as unknown as ProbeWindow).__grenadeFlow; t.active = false;
    return { ...t, thrown: window.__viewer.grenade().lastThrow, left: window.__viewer.grenade().left };
  });
  const start = data.frames.find(f => f.phase === 'throwing')!;
  const out = data.frames.find(f => f.thrown)!;
  const ready = data.frames.find(f => f.thrown && f.phase === 'ready');
  const firstJump = data.frames.find(f => f.airborne);
  const maxRise = Math.max(...data.frames.map(f => (f.feet?.[1] ?? 0) - (data.frames[0]!.feet?.[1] ?? 0)));
  // The hold the game counted, in real seconds, and the thrown power it allows (`./grenadeHold`); null without a press.
  const hold: Hold | null = data.marks.press !== undefined ? measureHold(data.frames, data.thrown?.power ?? NaN) : null;
  const result = { name, clip: data.thrown?.clip, power: data.thrown?.power, aimSin: data.thrown?.aimSin, hold,
    inputToFlightMs: out.t - data.marks.release!, animationToFlightMs: out.t - start.t,
    inputToReadyMs: ready ? ready.t - data.marks.release! : null, left: data.left,
    jumped: !!firstJump, maxRise,
    jumpAfterRiseMs: firstJump && data.marks.earlyRise ? firstJump.t - data.marks.earlyRise : null,
    finalStance: data.frames.at(-1)?.stance };
  const path = test.info().outputPath(`${name}.json`);
  writeFileSync(path, JSON.stringify({ result, ...data }, null, 2));
  await test.info().attach(`${name}.json`, { path, contentType: 'application/json' });
  console.log('GRENADE_FLOW', JSON.stringify(result));
  expect(data.left, 'exactly one grenade was spent').toBe(2);
  expect(data.thrown?.fromHand).toBe(true);
  if (hold) expect(hold.matches, `${name}: the thrown power is the held power over the real time the game counted ` +
    `(${JSON.stringify(hold)})`).toBe(true);
  return result;
}

for (const source of ['mobile', 'controller'] as const) {
  test(`${source}: measure standing crouched and prone short and full grenade throws`, async ({ page }) => {
    const input = await prepare(page, source);
    let tosses = 0, tossDemanded = false;
    const unmeasured = (description: string) => test.info().annotations.push({ type: 'not measurable on this host', description });
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const thrown: number[] = [], holds: Hold[] = [];
      for (const power of [0.25, 0.85]) {
        await reset(page, stance);
        await release(page, input, power);
        await page.screenshot({ path: test.info().outputPath(`${stance}-${power}-released.png`) });
        await expect.poll(() => page.evaluate(() => window.__viewer.grenade().phase), { timeout: 5000 }).toBe('ready');
        await page.waitForTimeout(50);
        const r = await finish(page, `${source}-${stance}-${power}`);
        // The clip follows the power actually thrown (`GetThrowAnim`: a toss under `tossPowerThreshold` 0.6, the aim
        // held level here), not the target: the release lands a frame or more after the poll saw the target, so a
        // slow frame can carry a short hold past 0.6 (B113: 0.35 aimed, 0.69 thrown, a full throw -- correct).
        expect(r.clip).toBe(stance === 'crouch' ? 'seal_crouch_throwgrenade' :
          `seal_${stance === 'prone' ? 'prone_' : ''}${(r.power ?? 1) < 0.6 ? 'toss' : 'throw'}grenade`);
        expect(r.aimSin ?? 1, 'the aim held under the toss sine (0.3)').toBeLessThan(0.3);
        if (r.clip?.includes('toss')) tosses++;
        thrown.push(r.power ?? NaN);
        holds.push(r.hold!);
      }
      // The power follows the real time held (each throw checked in `finish`), so the short hold throws weaker only when
      // it was held less long; a slow host can hold the "short" as long as the full one (RC1, SwiftShader: 0.9029 short,
      // 0.8779 full). Compared when the bracket shows the short hold the shorter; otherwise said, never counted a pass.
      // A short hold with no stall in its counted frames (`mustSeparate`: none past FAST_FRAME_MS) must be measured
      // apart: there a short hold as long as the full one is the release's own delay, not the host (the review's F1).
      if (mustSeparate(holds[0]!)) {
        expect(shorterHold(holds[0]!, holds[1]!), `${stance}: the short hold, no counted frame over ` +
          `${holds[0]!.longestFrameMs.toFixed(1)} ms (median ${holds.map(h => h.frameMs.toFixed(1)).join('/')} ms), ` +
          `is measurably the shorter (${JSON.stringify(holds)})`).toBe(true);
      }
      if (shorterHold(holds[0]!, holds[1]!)) {
        expect(thrown[0], `${stance}: the short hold throws with less power than the full hold`).toBeLessThan(thrown[1]!);
      } else {
        unmeasured(`${stance}: short vs full not compared -- the short hold was not measurably the shorter ` +
          `(short ${holds[0]!.heldLowS.toFixed(3)}-${holds[0]!.heldHighS.toFixed(3)} s, ` +
          `full ${holds[1]!.heldLowS.toFixed(3)}-${holds[1]!.heldHighS.toFixed(3)} s; the short hold's longest counted ` +
          `frame ${holds[0]!.longestFrameMs.toFixed(1)} ms, median ${holds.map(h => h.frameMs.toFixed(1)).join('/')} ms)`);
      }
      if (mustToss(holds[0]!)) tossDemanded = true;
    }
    // A toss is owed where a short hold's counted time cannot reach 0.6 (`mustToss`); the clip check above holds each
    // throw's clip to its power either way.
    if (tossDemanded || tosses > 0) {
      expect(tosses, 'at least one short hold threw under 0.6, so a toss clip was played').toBeGreaterThan(0);
    } else {
      unmeasured('no toss clip: every short hold was held long enough to reach 0.6, so none was owed');
    }
  });

  for (const stance of ['crouch', 'prone'] as const) test(`${source}: ${stance} short throw then rise and jump escape`, async ({ page }) => {
    const input = await prepare(page, source);
    await reset(page, stance);
    await release(page, input, 0.35);
    await mark(page, 'earlyRise'); await input.tap('triangle');
    await input.move(true);
    await mark(page, 'earlyJump'); await input.tap('square');
    await page.waitForTimeout(700);
    const early = await page.evaluate(() => ({ stance: window.__viewer.stance(), airborne: window.__viewer.mover()?.airborne,
      jumped: (window as unknown as ProbeWindow).__grenadeFlow.frames.some(f => f.airborne) }));
    console.log('GRENADE_ESCAPE_EARLY', JSON.stringify({ source, initialStance: stance, ...early }));
    await expect.poll(() => page.evaluate(() => window.__viewer.grenade().phase), { timeout: 5000 }).toBe('ready');
    if (await page.evaluate(() => window.__viewer.stance()) !== 'stand') { await mark(page, 'retryRise'); await input.tap('triangle'); }
    await expect.poll(() => page.evaluate(() => window.__viewer.stance()), { timeout: 3000 }).toBe('stand');
    // Probe subsequent presses after recovery; an early rejected press is not claimed to be queued.
    for (let i = 0; i < 12; i++) {
      if (await page.evaluate(() => (window as unknown as ProbeWindow).__grenadeFlow.frames.some(f => f.airborne))) break;
      await mark(page, `retryJump${i}`); await input.tap('square');
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(350);
    await input.move(false);
    const result = await finish(page, `${source}-${stance}-escape`);
    expect(result.jumped, 'the escape eventually includes an actual airborne jump').toBe(true);
    expect(result.maxRise, 'a rising jump, not merely falling off the deck').toBeGreaterThan(2);
    await page.screenshot({ path: test.info().outputPath('escape.png') });
  });
}
