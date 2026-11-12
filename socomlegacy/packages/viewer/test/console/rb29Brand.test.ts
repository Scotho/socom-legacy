// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { BRAND_LOGO_ALT, BRAND_LOGO_URL, headerHtml } from '../../src/console/render/header';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { value } from './cascade';
import { mountShell } from './shell';

/**
 * RB-29 (the replay batch plan; the owner's "S2 Launcher v2" export, its header): the brand is the project's logo PNG,
 * 38 px tall with its drop shadow, in place of the emblem and the SOCOM II / LEGACY words, and it carries an alt text.
 * The logo is `shared/brand/socom-legacy-logo.png`, Phil's wordmark at the design's 480 x 174. A browser adaptation: the
 * launcher's look, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; });

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const LOGO = resolve(repo, 'shared/brand/socom-legacy-logo.png');

function header(): HTMLElement {
  const a = sampleAdapters();
  page = bootConsole(document, window, a, { keymap: false });
  const box = document.createElement('div');
  box.innerHTML = headerHtml(page.ctl.S, a, false, new Date(2026, 10, 8, 21, 7));
  return box;
}

describe('RB-29: the header logo', () => {
  it('draws the logo image with its alt text in place of the emblem and the brand words', () => {
    const brand = header().querySelector('.cx-header__identity .cx-brand')!;
    const img = brand.querySelector<HTMLImageElement>('img.cx-brand__logo')!;
    expect(img).not.toBeNull();
    expect(BRAND_LOGO_ALT).toBe('SOCOM Legacy');
    expect(img.getAttribute('alt')).toBe('SOCOM Legacy');
    expect(img.getAttribute('src')).toBe(BRAND_LOGO_URL);
    expect(BRAND_LOGO_URL).toMatch(/shared\/brand\/socom-legacy-logo\.png$/);
    expect(brand.querySelector('svg:not(.cx-ico)')).toBeNull();                 // the emblem is gone (the server mark's icon stays)
    expect(brand.innerHTML).not.toContain('M21 45');                         // the emblem's bars (`icons.ts` EMBLEM)
    expect(brand.querySelector('.cx-brand__name, .cx-brand__sub')).toBeNull();
    expect(brand.querySelector('.cx-version')).not.toBeNull();
    expect(brand.firstElementChild).toBe(img);
  });

  it('the logo file is the design\'s 480 x 174 PNG with transparency', () => {
    expect(existsSync(LOGO)).toBe(true);
    const png = readFileSync(LOGO);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(480);
    expect(png.readUInt32BE(20)).toBe(174);
    // Transparency: an alpha colour type (4 grey + alpha, 6 RGBA) or a palette / colour image with a tRNS chunk.
    const colourType = png[25];
    const hasTrns = png.includes(Buffer.from('tRNS', 'ascii'));
    expect(colourType === 4 || colourType === 6 || hasTrns).toBe(true);
  });

  it('console.css keeps no rule for the brand words the logo replaced (.cx-brand__name, .cx-brand__sub)', () => {
    const css = readFileSync(resolve(repo, 'socomlegacy/packages/viewer/src/console/console.css'), 'utf8');
    expect(css).not.toMatch(/\.cx-brand__(?:name|sub)\b/);
  });

  it('is 38 design px tall (2.375rem) with the design\'s drop shadow, its width from its aspect', () => {
    expect(value(['.cx-header .cx-brand__logo'], 'height', 1920)).toBe('2.375rem');
    expect(value(['.cx-header .cx-brand__logo'], 'width', 1920)).toBe('auto');
    expect(value(['.cx-header .cx-brand__logo'], 'filter', 1920)).toBe('drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))');
  });
});
