import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import {
  dialogLookup, OPTIONS_BUILT_ROWS, OPTIONS_CONTROLS, OPTIONS_NOT_OFFERED, optionsBoxesOf, RadioStripWidget, videoSettingsLookup,
  type DialogDesign, type DialogRecord, type OptionsChoiceControl, type OptionsControl, type OptionsSwitchControl, type PadSlotName,
  type VideoRowsSettings,
} from '@s2u/ui';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';

/**
 * SS-1 (the owner, Craig, 2026-11-07: "our in game video settings and game settings added to the launcher have drifted,
 * we need to bring them back in sync"): the one description of the original's settings (`@s2u/ui` `optionsSchema.ts`,
 * which the launcher's Options draw from) held to the in-game OPTIONS screens as the disc draws and runs them. Dev-disc
 * tier on the fixtures (`test-fixtures/RUN/UI/READERC.ZAR`, `RUN/UIZANIM.ZAR`, as `nativeOptionsHost.test.ts` mounts
 * them): the disc's own dialogs and scripts, run by the front end, never a transcription.
 *
 * - Every switch and choice: its page opened, its strip focused and stepped RIGHT through every box -- the values the
 *   boxes' ONCHECK scripts write are exactly the schema's, box for box.
 * - Every slider: the design's SLIDERBAR binds the schema's tuner, at CENTER_VALUE 0.5 (the identity the launcher's
 *   percent assumes, research 117 R117.3).
 * - Every box's caption (the design's string id, `_195_RECRUIT_MSG`, or a literal) is the schema's label, case aside,
 *   or is in `CAPTION_MAP`; a choice lists its boxes as the game draws them, left to right, or is in `LAUNCHER_ORDER`.
 * - Every row the launcher shows is a control the game draws (not `hidden`), or names why it is store-only.
 * - No valve is "not offered" for a reason the built rows have overtaken.
 */

// The fixtures' root as `archive/test/fixtures.ts` reads it (S2U_TEST_FIXTURES, an empty directory, checks the skip).
// Without them -- the public export carries no test-fixtures/, a clone without game data -- the disc-backed tests are
// skipped and said so; the schema's own checks still run.
const fixture = resolve(process.env['S2U_TEST_FIXTURES'] || resolve(import.meta.dirname, '../../../test-fixtures'));
const HAVE_UI = existsSync(resolve(fixture, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(fixture, 'RUN/UIZANIM.ZAR'));
const disc: FrontEndDisc = HAVE_UI ? {
  dialog: dialogLookup([Zar.parse(readFileSync(resolve(fixture, 'RUN/UI/READERC.ZAR')))]),
  sets: parseAnimSets(Zar.parse(readFileSync(resolve(fixture, 'RUN/UIZANIM.ZAR')))).sets,
  faces: [], captions: null, loader: {}, missing: [], globalValves: [],
} : null as unknown as FrontEndDisc;   // never read: every test that reads it is skipped below
const itDisc = it.skipIf(!HAVE_UI);

/** A box caption that is not its row's label (sentence case aside), and the label it reads as: declared, not guessed. */
const CAPTION_MAP: Readonly<Record<string, string>> = {
  INVERT: 'Inverted',                                  // PITCH's `_188_INVERT_MSG`: the launcher's "Pitch: Inverted"
  'Dolby Pro Logic II': 'Dolby',                       // SOUND MODE's third box, a literal caption on the disc
};

/**
 * A choice whose launcher order is not the order the game draws its boxes, left to right, and why. Switches are drawn
 * Off, On on the launcher (the game draws ON left of OFF on every toggle strip of these pages). None today: TEAMMATE
 * NAMES, the one entry while H422 was open, is a switch again (SS-2, H422 answered (a)).
 */
const LAUNCHER_ORDER: Readonly<Record<string, string>> = {};

const strips = OPTIONS_CONTROLS.filter((c): c is OptionsSwitchControl | OptionsChoiceControl => c.kind === 'switch' || c.kind === 'choice');
const pagesOf = (c: OptionsControl): { dialog: string; control: string }[] =>
  [...(c.control === null ? [] : [{ dialog: c.dialog, control: c.control }]), ...(c.alsoOn ?? [])];
const record = (design: DialogDesign | null, name: string): DialogRecord | undefined => design?.controls.find((r) => r.name === name);
const captionWord = (caption: string | null): string => /^_\d+_(.+)_MSG$/i.exec(caption ?? '')?.[1] ?? caption ?? '';
/** The values the original's boxes write: the schema's, every one (SS-2: no launcher-only value is declared). */
const valuesOf = (c: OptionsSwitchControl | OptionsChoiceControl): number[] => (c.kind === 'switch' ? [0, 1] : c.options.map((o) => o.value));

/** One page run by the front end on the fixture: each strip stepped RIGHT once per box, the valve read after each. */
function stepPage(dialog: string, controls: readonly { control: string; valve: string }[]): Map<string, { box: string; value: number | undefined }[]> {
  const s = new FrontEndSession({ disc, startDialog: dialog, loader: false });
  let now = 0;
  let down = new Set<PadSlotName>();
  s.input.source = { read: () => ({ down, stickX: 0, stickY: 0 }) } as unknown as typeof s.input.source;
  const frames = (n: number): void => { for (let i = 0; i < n; i++) s.advance(now += 1000 / 30); };
  const press = (b: PadSlotName): void => { down = new Set([b]); frames(1); down = new Set(); frames(6); };
  frames(120);
  const out = new Map<string, { box: string; value: number | undefined }[]>();
  try {
    for (const { control, valve } of controls) {
      for (let i = 0; i < 24 && s.input.ring()?.focused?.name !== control; i++) press('DOWN');
      expect(s.input.ring()?.focused?.name, `${dialog} ${control} focused`).toBe(control);
      const strip = s.parts.current?.widgets.get(control);
      expect(strip, `${dialog} ${control}`).toBeInstanceOf(RadioStripWidget);
      const w = strip as RadioStripWidget;
      const seen: { box: string; value: number | undefined }[] = [];
      for (let i = 0; i < w.children.length; i++) {
        press('RIGHT');
        seen.push({ box: w.children[w.selection]!.name, value: s.opener.valves.find(valve)?.value });
      }
      out.set(control, seen);
    }
  } finally { s.close(); }
  return out;
}

describe(`SS-1: the options schema is the in-game OPTIONS screens' own description (dev-disc tier, the fixtures)${HAVE_UI ? '' : ` (the disc's tests skipped: ${FIXTURES_ABSENT})`}`, () => {
  const byPage = new Map<string, { control: string; valve: string; c: OptionsSwitchControl | OptionsChoiceControl }[]>();
  for (const c of strips) for (const p of pagesOf(c)) byPage.set(p.dialog, [...(byPage.get(p.dialog) ?? []), { control: p.control, valve: c.valve, c }]);

  itDisc.each([...byPage.keys()])('%s: every strip stepped through every box writes exactly the schema\'s values, box for box', (dialog) => {
    const rows = byPage.get(dialog)!;
    const seen = stepPage(dialog, rows);
    for (const { control, c } of rows) {
      const got = seen.get(control)!;
      expect(new Set(got.map((g) => g.value)), `${dialog} ${control}: the values written`).toEqual(new Set(valuesOf(c)));
      for (const b of optionsBoxesOf(c)) {
        expect(got.find((g) => g.box === b.box)?.value, `${dialog} ${control}: box ${b.box}`).toBe(b.value);
      }
    }
  });

  it('no exception: every value the launcher writes has a box of the original behind it (SS-2, H422 answered (a))', () => {
    for (const s of strips) if (s.kind === 'choice') expect(s.options.every((o) => o.box !== undefined), s.label).toBe(true);
    const names = strips.find((s) => s.id === 'DISPLAY_MP_TEAM_NAMES');
    expect(names).toMatchObject({ kind: 'switch', boxes: { off: 'TeamMateNameOff', on: 'TeamMateNameOn' } });
    expect(Object.keys(LAUNCHER_ORDER)).toEqual([]);
  });

  itDisc('every slider: the design\'s SLIDERBAR binds the schema\'s tuner, at CENTER_VALUE 0.5', () => {
    for (const c of OPTIONS_CONTROLS) {
      if (c.kind !== 'slider') continue;
      const w = record(disc.dialog(c.dialog), c.control!)?.widget;
      expect(w?.type, `${c.dialog} ${c.control}`).toBe('SLIDERBAR');
      if (w?.type !== 'SLIDERBAR') continue;
      expect(w.uivar?.name, `${c.control}'s variable`).toBe(c.tuner);
      expect(w.centerValue, `${c.control}'s CENTER_VALUE`).toBe(0.5);
    }
  });

  itDisc('every box\'s caption is the schema\'s label (case aside) or a declared reading of it', () => {
    for (const c of strips) {
      for (const p of pagesOf(c)) {
        const w = record(disc.dialog(p.dialog), p.control)?.widget;
        expect(w?.type, `${p.dialog} ${p.control}`).toBe('RADIOSTRIP');
        if (w?.type !== 'RADIOSTRIP') continue;
        for (const b of optionsBoxesOf(c)) {
          const sub = w.subordinates.find((s) => s.name === b.box);
          expect(sub, `${p.control}: box ${b.box}`).toBeDefined();
          const word = captionWord(sub?.widget.type === 'CHECKBOX' ? sub.widget.button.caption : null);
          const reads = CAPTION_MAP[word] ?? word;
          expect(reads.toLowerCase(), `${p.control}: box ${b.box}'s caption ${word}`).toBe(b.label.toLowerCase());
        }
      }
    }
  });

  // F1 of REVIEW-1 (the controller's reading): "the disc's order" is the order a player sees, left to right -- the boxes
  // sorted by their x in the design -- not the SUBORDINATES list (the RIGHT step's order). Where a strip's boxes carry no
  // position (every x the same), the list order is the fallback; no strip of these pages needs it today.
  itDisc('a choice lists its boxes in the order the game draws them, left to right, or declares why not', () => {
    for (const c of strips) {
      if (c.kind !== 'choice' || c.id in LAUNCHER_ORDER || c.control === null) continue;
      const w = record(disc.dialog(c.dialog), c.control)?.widget;
      if (w?.type !== 'RADIOSTRIP') continue;
      const boxes = c.options.map((o) => o.box);
      const subs = w.subordinates.filter((s) => boxes.includes(s.name));
      const placed = new Set(subs.map((s) => s.x)).size === subs.length;
      const drawn = (placed ? [...subs].sort((a, b) => a.x - b.x) : subs).map((s) => s.name);
      expect(boxes, `${c.label}: the drawn order${placed ? '' : ' (no positions: the list order)'}`).toEqual(drawn);
    }
  });

  itDisc('every row the launcher shows is a control the game draws, or names why it is store-only', () => {
    const keeper = { get: (): VideoRowsSettings => ({ renderScale: 'balanced', shadows: true, showFps: false }), set: () => {} };
    const drawn = videoSettingsLookup(disc.dialog, keeper);          // the game's own pages: VIDEO with CPS-4b's rows and its hidden one
    for (const c of OPTIONS_CONTROLS) {
      if (c.kind === 'readonly') continue;                            // not shown by the launcher
      expect(drawn(c.dialog), c.dialog).not.toBeNull();
      if (c.control === null) continue;                               // SCREEN ADJUST: the page's own d-pad
      const r = record(drawn(c.dialog), c.control);
      expect(r, `${c.dialog} ${c.control}`).toBeDefined();
      const storeOnly = (c as { storeOnly?: string }).storeOnly;
      if (r?.hidden) expect(storeOnly ?? '(no store-only reason)', `${c.label}: shown by the launcher, hidden in the game`).toMatch(/^(?!\(no ).{10,}/);
    }
  });

  it('no valve is "not offered" for a reason the built rows have overtaken', () => {
    const built = new Set(OPTIONS_BUILT_ROWS.map((r) => r.task));
    for (const n of OPTIONS_NOT_OFFERED) {
      expect(n.why, n.valve).not.toMatch(/not built/i);
      for (const t of built) expect(n.why.includes(t), `${n.valve} names ${t}, a built row's task`).toBe(false);
    }
  });
});
