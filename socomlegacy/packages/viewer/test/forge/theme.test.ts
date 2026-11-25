// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CUSTOM_TOKENS, exportCustomTheme, importCustomTheme, tokenValueOk } from '../../src/forge/theme';

/** Preferences > Appearance's custom theme file (`../../src/forge/theme`; the owner, 2026-11-25: import/export as JSON). */
describe('the custom theme file', () => {
  it('exports its base and its own values, and reads them back', () => {
    const text = exportCustomTheme({ base: 'light', vars: { '--fx-gold': '#d63384', '--fx-radius': '10px' } });
    const r = importCustomTheme(text);
    expect(r).toEqual({ ok: true, theme: { base: 'light', vars: { '--fx-gold': '#d63384', '--fx-radius': '10px' } }, dropped: 0 });
  });

  it('drops an unknown token or a bad value, and refuses a file that is not a theme', () => {
    const r = importCustomTheme(JSON.stringify({ kind: 'forge-theme', version: 1, base: 'nope', vars: { '--fx-gold': 'red; x', '--fx-nope': '#fff', '--fx-bg': '#101010' } }));
    expect(r).toEqual({ ok: true, theme: { base: 'dark', vars: { '--fx-bg': '#101010' } }, dropped: 2 });
    expect(importCustomTheme('{').ok).toBe(false);
    expect(importCustomTheme(JSON.stringify({ base: 'dark', vars: {} })).ok).toBe(false);
  });

  it('takes colours and px lengths only, nothing that would close the declaration', () => {
    const colour = CUSTOM_TOKENS.find((t) => t.kind === 'colour')!, length = CUSTOM_TOKENS.find((t) => t.kind === 'length')!;
    for (const v of ['#abc', '#aabbccdd', 'rgb(1, 2, 3)', 'hsl(200 50% 40%)', 'transparent']) expect(tokenValueOk(colour, v)).toBe(true);
    for (const v of ['', 'red;', '#fff}', 'url(x)<', '6px']) expect(tokenValueOk(colour, v)).toBe(false);
    expect([tokenValueOk(length, '6px'), tokenValueOk(length, '6'), tokenValueOk(length, '1em')]).toEqual([true, false, false]);
  });
});
