import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The viewport's toast (a browser adaptation, FG.R2): at the bottom centre, over the legend strip (`--fx-legend-h`, the
 * page's measure of it) and narrow enough to stay clear of the axis widget in the corner -- never under the camera's
 * chips at the top right, where it sat before.
 */
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/forge.css'), 'utf8');
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('the viewport toast', () => {
  it('sits at the bottom centre, over the legend strip, clear of the axis widget; not at the top', () => {
    const toast = rule('.fx-toast');
    expect(toast).toMatch(/left:\s*50%/);
    expect(toast).toMatch(/bottom:\s*calc\(var\(--fx-legend-h\) \+/);   // the variable declared on .fx-root (0px), no fallback
    expect(toast).toMatch(/max-width:/);
    expect(toast).not.toMatch(/\btop:/);
    expect(toast).not.toMatch(/\bright:/);
    expect(rule('.fx-toast.is-on')).toMatch(/translateX\(-50%\)/);
  });
});
