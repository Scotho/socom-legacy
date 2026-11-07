// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildInspector } from '../../src/forge/panels/inspectorPanel';

/**
 * The Inspector's transform fields (a browser adaptation, FG.R2 -- the game has no editor): position, rotation (pitch,
 * yaw, roll) and scale, each a row of three in the axis order X, Y, Z, so the axis chips' colours mean the axis turned
 * about (pitch about X, yaw about Y, roll about Z). Pitch, roll and scale are UI only for now: the page wires them to a
 * stub until the layout record can keep them (record v3 keeps a piece's yaw alone).
 */
describe('the Inspector transform fields', () => {
  const rows = (dom: ReturnType<typeof buildInspector>, row: string): string[] =>
    [...dom.fields.querySelectorAll<HTMLInputElement>(`.${row} .fx-field > input`)].map((i) => i.dataset['label'] ?? '');

  it('draws position, rotation and scale, each a row of three in X, Y, Z order, under its caption', () => {
    const dom = buildInspector(document);
    expect(rows(dom, 'fx-position-fields')).toEqual(['X', 'Y', 'Z']);
    expect(rows(dom, 'fx-rotation-fields')).toEqual(['Pitch', 'Yaw', 'Roll']);
    expect(rows(dom, 'fx-scale-fields')).toEqual(['Scale X', 'Scale Y', 'Scale Z']);
    expect([...dom.fields.querySelectorAll('.fx-field-caption')].map((c) => c.textContent)).toEqual(['Position', 'Rotation °', 'Scale']);
    // inline: each caption leads its own row, on the line with its three fields
    for (const [row, caption] of [['fx-position-fields', 'Position'], ['fx-rotation-fields', 'Rotation °'], ['fx-scale-fields', 'Scale']]) {
      expect(dom.fields.querySelector(`.${row} > .fx-field-caption:first-child`)?.textContent).toBe(caption);
    }
    expect(dom.yaw.dataset['label']).toBe('Yaw');
    expect([dom.pitch, dom.roll, dom.sx, dom.sy, dom.sz].every((i) => i.classList.contains('fx-stepper') && i.type === 'number')).toBe(true);
  });

  it('ends each row with its reset, hidden until the page shows it; every field scrubs', () => {
    const dom = buildInspector(document);
    for (const [row, button] of [['fx-position-fields', dom.resetPosition], ['fx-rotation-fields', dom.resetRotation], ['fx-scale-fields', dom.resetScale]] as const) {
      expect(dom.fields.querySelector(`.${row} > :last-child`)).toBe(button);
      expect(button.hidden).toBe(true);
      expect(button.type).toBe('button');
      expect(button.getAttribute('aria-label')).toMatch(/^Reset /);
    }
    for (const i of [dom.x, dom.y, dom.z, dom.pitch, dom.yaw, dom.roll, dom.sx, dom.sy, dom.sz]) expect(i.classList.contains('fx-scrub')).toBe(true);
  });

  it('names every field for assistive tech, the short chip beside it', () => {
    const dom = buildInspector(document);
    for (const i of [dom.x, dom.y, dom.z, dom.pitch, dom.yaw, dom.roll, dom.sx, dom.sy, dom.sz]) expect(i.getAttribute('aria-label')).toBeTruthy();
    const chips = [...dom.fields.querySelectorAll('.fx-rotation-fields .fx-field > span')].map((s) => s.textContent);
    expect(chips).toEqual(['P', 'Y', 'R']);
    expect(dom.sx.step).toBe('0.1');
  });
});
