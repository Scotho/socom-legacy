// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAD_HINT_NO_PAD_MS_ADAPTATION, PAD_HINT_TEXT, PadHint, hidePadHint, showPadHint } from '../src/padHint';
import { MatchDiag } from '../src/matchDiag';
import { inputSources } from '../src/inputSources';

/**
 * XBOX-PAD-HINT (`../src/padHint`; product track, a browser adaptation with no original): on an Xbox-marked page, in a
 * match whose pad reader has found no gamepad for 10 s since the mount, a dismissable notice that the controller is in
 * the Xbox browser's browsing controls. b0's field read: Xbox seats ran smooth frames and sent no input until the 240 s
 * idle kick; Edge on Xbox starts with the controller as a cursor. The condition is what keeps a wrong diagnosis harmless:
 * it can never show to a player whose controller the game reads.
 */

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('XBOX-PAD-HINT: when it shows', () => {
  it('an Xbox-marked page, no pad for 10 s from the mount: shown once, at 10 s', () => {
    const h = new PadHint();
    h.begin(1000, true);
    const seen: string[] = [];
    for (let t = 1000; t <= 1000 + 20_000; t += 16) { const c = h.frame(t, 0); if (c) seen.push(`${c}@${t - 1000}`); }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.startsWith('show@')).toBe(true);
    expect(Number(seen[0]!.slice(5))).toBeGreaterThanOrEqual(PAD_HINT_NO_PAD_MS_ADAPTATION);
    expect(h.shown).toBe(true);
  });

  it('never on a page not Xbox-marked; never once a pad was seen, even if it goes again', () => {
    const pc = new PadHint();
    pc.begin(0, false);
    for (let t = 0; t <= 30_000; t += 16) expect(pc.frame(t, 0)).toBeNull();
    const x = new PadHint();
    x.begin(0, true);
    x.frame(0, 0); x.frame(3000, 1);
    for (let t = 3016; t <= 30_000; t += 16) expect(x.frame(t, 0)).toBeNull();
    expect(x.shown).toBe(false);
  });

  it('shown, then a pad found: hidden at once and not shown again this match', () => {
    const h = new PadHint();
    h.begin(0, true);
    for (let t = 0; t <= 11_000; t += 16) h.frame(t, 0);
    expect(h.frame(11_100, 1)).toBe('hide');
    for (let t = 11_116; t <= 40_000; t += 16) expect(h.frame(t, 0)).toBeNull();
  });

  it('dismissed: hidden, not shown again this match; a new match starts afresh', () => {
    const h = new PadHint();
    h.begin(0, true);
    for (let t = 0; t <= 11_000; t += 16) h.frame(t, 0);
    h.dismiss();
    for (let t = 11_016; t <= 40_000; t += 16) expect(h.frame(t, 0)).toBeNull();
    h.begin(50_000, true);
    expect(h.shown).toBe(false);
    let shown = false;
    for (let t = 50_000; t <= 62_000; t += 16) if (h.frame(t, 0) === 'show') shown = true;
    expect(shown).toBe(true);
  });

  it('outside a match (before begin, after end): nothing', () => {
    const h = new PadHint();
    for (let t = 0; t <= 20_000; t += 16) expect(h.frame(t, 0)).toBeNull();
    h.begin(0, true);
    h.end();
    for (let t = 0; t <= 20_000; t += 16) expect(h.frame(t, 0)).toBeNull();
  });
});

describe('XBOX-PAD-HINT: the notice', () => {
  it('the words say only what the sources state; a status, never an alert; a Dismiss button; one at a time', () => {
    expect(PAD_HINT_TEXT).toBe('The game is not receiving controller input. In the Xbox browser the controller starts in browsing controls: hold the Menu button and choose Use game controls.');
    const doc = document;
    let dismissed = 0;
    const el = showPadHint(doc, () => { dismissed++; });
    showPadHint(doc, () => { dismissed++; });
    expect(doc.querySelectorAll('[data-pad-hint]')).toHaveLength(1);
    const n = doc.querySelector('[data-pad-hint]')!;
    expect(n.getAttribute('role')).toBe('status');
    expect(n.className).toBe('s2u-notice');
    expect(n.textContent).toContain(PAD_HINT_TEXT);
    (n.querySelector('[data-pad-hint-dismiss]') as HTMLButtonElement).click();
    expect(dismissed).toBe(1);
    expect(doc.querySelector('[data-pad-hint]')).toBeNull();
    void el;
    showPadHint(doc, () => undefined);
    hidePadHint(doc);
    expect(doc.querySelector('[data-pad-hint]')).toBeNull();
  });
});

describe('XBOX-PAD-HINT review F2: the console\'s own signals only, never a PC with the saved Xbox pick', () => {
  const diag = (marks: { ua: boolean; sraKmd: boolean; cls: boolean }): MatchDiag => {
    const d = new MatchDiag({ marks: () => marks, page: () => ({}), sources: inputSources, backend: () => null, send: () => undefined });
    d.begin(0, { info: () => null, scale: () => null, buffer: () => null });
    return d;
  };
  it('the agent token or the SraKmd driver: a console; the class alone (the pick on a PC): not', () => {
    expect(diag({ ua: true, sraKmd: false, cls: false }).xboxConsole).toBe(true);
    expect(diag({ ua: false, sraKmd: true, cls: true }).xboxConsole).toBe(true);
    expect(diag({ ua: false, sraKmd: false, cls: true }).xboxConsole).toBe(false);
    expect(diag({ ua: false, sraKmd: false, cls: true }).xboxMarked).toBe(true);   // the diagnostic still reports it
  });
});

describe('XBOX-PAD-HINT: wired in the match', () => {
  it('begun at the mount with the page\'s Xbox mark, stepped in the pad frame with the reader\'s pads, ended and hidden at the teardown; inputdiag says whether it showed', () => {
    const m = read('../src/matchMount.ts');
    expect(m).toMatch(/padHint\.begin\(globalThis\.performance\?\.now\(\) \?\? 0, matchDiag\.xboxConsole\);/);
    expect(m).toMatch(/const hintChange = padHint\.frame\(now, gamePad\.input\.devices\.length\);/);
    expect(m).toMatch(/padHint\.end\(\); hidePadHint\(doc\);/);
    expect(read('../src/matchDiag.ts')).toContain('hint: i.hintShown ? 1 : 0');
  });
});
