// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryNeedsConfirm, gateMatchEntry, MATCH_ENTRY_NO_WEBGL2_TEXT, showMatchEntryConfirm } from '../src/matchEntryGate';

/**
 * LATER 1265 part 2 (the main controller's GO, 2026-11-20; product track, a browser adaptation -- the game's launch and
 * the match are unchanged): a page with no WebGL2 (the boot probe's verdict, or the front's own `no-webgl2`) that will not
 * draw on WebGPU (the adapter's answer, not `navigator.gpu`'s presence) is shown the reason again as its match starts, with
 * a choice -- try anyway, or leave the game through the ABORT return -- never a hard block (v0.4.27's M1 Max went into four
 * matches that died at 3 s).
 */
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });
const here = dirname(fileURLToPath(import.meta.url));

describe('LATER 1265 part 2: the match-entry confirm', () => {
  it('asks only with no WebGL2 (the probe or the front) AND no WebGPU; an unknown probe and a willing front never ask', () => {
    expect(entryNeedsConfirm({ webgl2: false }, false)).toBe(true);
    expect(entryNeedsConfirm({ webgl2: false }, true)).toBe(false);          // WebGPU draws the match
    expect(entryNeedsConfirm({ webgl2: true }, false)).toBe(false);
    expect(entryNeedsConfirm({}, false)).toBe(false);                        // an older or failed probe: no verdict
    expect(entryNeedsConfirm({ webgl2: true }, false, true)).toBe(true);     // review F3: the front's own no-webgl2
  });

  it('shows the reason with two choices: try anyway removes it; leave runs the leave once', () => {
    let left = 0;
    const el = showMatchEntryConfirm(document, { leave: () => { left++; } });
    expect(el.textContent).toContain(MATCH_ENTRY_NO_WEBGL2_TEXT);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Try anyway', 'Leave game']);
    buttons[1]!.click(); buttons[1]!.click();
    expect(left).toBe(1);
    const again = showMatchEntryConfirm(document, { leave: () => { left++; } });
    (again.querySelector('button') as HTMLButtonElement).click();          // try anyway
    expect(document.querySelector('[data-match-entry-confirm]')).toBeNull();
    expect(left).toBe(1);
  });

  it('review F1: the gate waits for WebGPU’s own answer -- navigator.gpu there but no adapter still asks', async () => {
    let left = 0;
    const asked = await gateMatchEntry(document, { leave: () => { left++; }, active: () => true },
      { probe: () => ({ webgl2: false }), front: () => false, webgpu: async () => false });
    expect(asked).toBe(true);
    (document.querySelectorAll('[data-match-entry-confirm] button')[1] as HTMLButtonElement).click();
    expect(left).toBe(1);
    expect(await gateMatchEntry(document, { leave: () => {}, active: () => true }, { probe: () => ({ webgl2: false }), front: () => false, webgpu: async () => true })).toBe(false);
    expect(await gateMatchEntry(document, { leave: () => {}, active: () => true }, { probe: () => ({ webgl2: true }), front: () => false, webgpu: async () => false })).toBe(false);
    expect(await gateMatchEntry(document, { leave: () => {}, active: () => true }, { probe: () => { throw new Error('no'); }, front: () => false, webgpu: async () => false })).toBe(false);
    expect(await gateMatchEntry(undefined, { leave: () => {}, active: () => true })).toBe(false);
  });

  it('review F1: a match already over when WebGPU answers is not asked about', async () => {
    expect(await gateMatchEntry(document, { leave: () => {}, active: () => false }, { probe: () => ({ webgl2: false }), front: () => false, webgpu: async () => false })).toBe(false);
    expect(document.querySelector('[data-match-entry-confirm]')).toBeNull();
  });

  it('review F4: the confirm goes when the match ends another way, and sits below the no-backend notice', async () => {
    vi.useFakeTimers();
    let on = true;
    await gateMatchEntry(document, { leave: () => {}, active: () => on }, { probe: () => ({ webgl2: false }), front: () => false, webgpu: async () => false });
    const el = document.querySelector('[data-match-entry-confirm]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.top).not.toBe('12px');                                  // the no-backend notice's place
    on = false;
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('[data-match-entry-confirm]')).toBeNull();
  });

  it('review F2/F4: the front end gates its match start, its leave the ABORT return (leaveLoading), never stop()', () => {
    const src = readFileSync(resolve(here, '../src/frontEnd.ts'), 'utf8');
    const line = src.split('\n').find((l) => l.includes('this.match.start(h);'));
    expect(line).toMatch(/this\.match\.start\(h\); this\.gateMatchEntry\(\);/);
    // The method's body (its own, so the lobby wiring's calls stay one object each: CLAN-ID-WIRE reads them to `});`).
    const at = src.indexOf('  private gateMatchEntry(): void {');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf('\n  }\n', at));
    expect(body).toMatch(/void gateMatchEntry\(globalThis\.document/);
    expect(body).toMatch(/leaveLoading\(\)/);
    expect(body).not.toMatch(/this\.match\.stop\(\)/);
  });
});
