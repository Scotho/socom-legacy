import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkPrepared, keyActions } from '../eph/padIni';
import { actMoments, pageEvents } from '../eph/pageMap';
import { parseScript, type ScriptEvent } from '../eph/script';

/**
 * The EPH movement campaign (tools/eph/scripts/movement-campaign.sh and its case scripts): every case the runner names
 * exists, parses, carries only pressures the PCSX2 [Pad1] prepares, translates for the page, and says in its header
 * what it tests, what to look at and the owner's words it answers. A validation instrument (product track, OT.R53).
 */
const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '../eph/scripts');
const RUNNER = resolve(SCRIPTS, 'movement-campaign.sh');

/** A bash array of the runner, `NAME=( ... )`, possibly over several lines. */
function runnerList(name: string): string[] {
  const text = readFileSync(RUNNER, 'utf8');
  const m = new RegExp(`^${name}=\\(([^)]*)\\)`, 'm').exec(text);
  if (!m) throw new Error(`movement-campaign.sh has no ${name}=( ... ) list`);
  return m[1]!.trim().split(/\s+/);
}
const campaignCases = (): string[] => runnerList('CASES');
const matrixCases = (): string[] => runnerList('MATRIX');

const read = (name: string): string => readFileSync(resolve(SCRIPTS, `${name}.txt`), 'utf8');
const events = (name: string): ScriptEvent[] => parseScript(read(name));
const strip = (es: readonly ScriptEvent[]) => es.map(({ t, input, pressure }) => ({ t, input, pressure }));

describe('the movement campaign', () => {
  it('names the cases of the brief, each once', () => {
    const cases = campaignCases();
    expect(new Set(cases).size).toBe(cases.length);
    expect(cases).toEqual([
      'qpd-drop-a', 'qpd-drop-b', 'qpd-pop-a', 'qpd-pop-b', 'prone-from-stand', 'prone-from-crouch',
      'incline-prone', 'incline-qpd', 'light-from-crouch', 'light-from-prone',
    ]);
  });

  it('names the parity matrix cases mx-<group>-..., each once, in the groups the owner asked for (2026-10-31)', () => {
    const cases = matrixCases();
    expect(new Set(cases).size).toBe(cases.length);
    expect(cases.length).toBeGreaterThanOrEqual(50);
    const groups = new Set(cases.map((c) => /^mx-([a-z]+)-/.exec(c)?.[1]));
    expect([...groups].sort()).toEqual(['crawl', 'crouch', 'crouchwalk', 'incline', 'jump', 'long', 'prone', 'run', 'stand',
      'startstop', 'strafe', 'tap', 'turn'].sort());
    expect(cases.filter((c) => campaignCases().includes(c))).toEqual([]);
  });

  it('every standing push is released and the push pressures cover the analog curve: 0.2, 0.35, 0.5, 0.65, 0.8, 1', () => {
    const pushes = new Set(matrixCases().filter((c) => c.startsWith('mx-stand-')).flatMap((c) =>
      events(c).filter((e) => e.input.startsWith('l') && e.pressure > 0).map((e) => e.pressure)));
    expect([...pushes].sort()).toEqual([0.2, 0.35, 0.5, 0.65, 0.8, 1]);
  });

  for (const name of [...campaignCases(), ...matrixCases()]) {
    describe(name, () => {
      it('exists, parses, and every pressure is prepared on the PCSX2 side', () => {
        expect(existsSync(resolve(SCRIPTS, `${name}.txt`))).toBe(true);
        const es = events(name);
        expect(es.length).toBeGreaterThan(0);
        expect(es[0]!.t).toBeGreaterThan(0);
        expect(() => checkPrepared(es)).not.toThrow();
        expect(keyActions(es).length).toBeGreaterThan(0);
        expect(pageEvents(es).length).toBeGreaterThan(0);
      });

      it('releases every input it presses by its end', () => {
        const held = new Map<string, number>();
        for (const e of events(name)) held.set(e.input, e.pressure);
        expect([...held].filter(([, p]) => p !== 0)).toEqual([]);
      });

      it('says what it tests, what to look at and the owner words it answers', () => {
        const head = read(name).split(/\r?\n/).filter((l) => l.startsWith('#')).join('\n');
        expect(head).toMatch(/^# Tests: /m);
        expect(head).toMatch(/^# Look: /m);
        expect(head).toMatch(/^# Owner \(2026-10-31\): /m);
        expect(head).toMatch(/standing state/);
      });
    });
  }

  it('drops with the stick held in both quick drops: 0.2 (inside the dead zone) and 0.5 (past it)', () => {
    for (const [name, push] of [['qpd-drop-a', 0.2], ['qpd-drop-b', 0.5]] as const) {
      const es = events(name);
      const acts = actMoments(es);
      expect(acts.map((a) => a.kind)).toEqual(['light', 'full']);
      const on = es.find((e) => e.input === 'lleft' && e.pressure > 0)!;
      const off = es.find((e) => e.input === 'lleft' && e.pressure === 0)!;
      expect(on.pressure).toBe(push);
      expect(on.t).toBeLessThan(acts[1]!.t);
      expect(off.t).toBeGreaterThan(acts[1]!.releaseT!);
    }
  });

  it('pops from the quick drop: the quick drop first, then a full Triangle tap with the stick held', () => {
    for (const [name, drop, push] of [['qpd-pop-a', 'qpd-drop-a', 0.2], ['qpd-pop-b', 'qpd-drop-a', 0.5]] as const) {
      const es = events(name);
      const d = events(drop);
      expect(strip(es.slice(0, d.length))).toEqual(strip(d));
      const rest = es.slice(d.length);
      const tap = rest.find((e) => e.input === 'triangle' && e.pressure === 1)!;
      const on = rest.find((e) => e.input === 'lleft' && e.pressure > 0)!;
      expect(on.pressure).toBe(push);
      expect(on.t).toBeLessThanOrEqual(tap.t);
    }
  });

  it('the incline quick drop replays the incline prone walk unchanged up to the walk end', () => {
    const prone = events('incline-prone');
    const qpd = events('incline-qpd');
    let lastProne = -1;
    prone.forEach((e, i) => { if (e.input === 'triangle' && e.pressure === 1) lastProne = i; });
    const walk = prone.slice(0, lastProne);
    expect(strip(qpd.slice(0, walk.length))).toEqual(strip(walk));
    expect(actMoments(qpd.slice(walk.length)).map((a) => a.kind)).toEqual(['light', 'full']);
  });
});
