// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CX-9b (CX.R8, the owner, 2026-10-12: the console layout "becomes the new launcher default disposing of the old layout
 * entirely but keeping the plumbing beneath it where useful"): `setup/index.html` is the plain game page -- what the game
 * and the tools need (the canvas, the loading screen, the plain disc prompt, the test room's chrome) -- and the old
 * launcher's layout is gone from it: the top bar and its badge, Menu, fold, project nav, device chips and account; the
 * shelf; the content region with its sections and the "This browser" panels; the action bar with its START; the
 * backdrop video; the help tips. `src/modern/launcher.ts`, the modules only it imported, and the setup page's own
 * controller (`src/startup.ts` `Startup`) and the modules only that imported are deleted; what the console's adapters,
 * the game's pages (the in-game overlay) or the replay viewer import stays. A source scan, no browser.
 */
const here = dirname(fileURLToPath(import.meta.url));
const viewer = resolve(here, '..');
const html = readFileSync(join(viewer, 'setup/index.html'), 'utf-8');
const doc = new DOMParser().parseFromString(html, 'text/html');

/** The old launcher's markup, by id: none of it is in the page any more. */
const REMOVED_IDS = [
  'launcher-badge', 'launcher-menu', 'launcher-fold', 'launcher-project-nav', 'launcher-pad-chip', 'launcher-mic-chip',
  'launcher-fold-report', 'launcher-account', 'launcher-shelf', 'launcher-content', 'launcher-dialogs',
  'launcher-section-home', 'launcher-home-modern', 'launcher-section-settings', 'launcher-browser',
  'launcher-settings-modern', 'controller-panel', 'microphone-panel', 'setup-pad', 'setup-pad-diagram', 'mic-test',
  'startup-background', 'startup-start', 'startup-launch-status', 'startup-ready', 'startup-blocked', 'launcher-report',
  'startup-disc-badge', 'startup-filename', 'disc-pick-label', 'startup-disclaimer', 'disc-help', 'visuals-help',
  'controller-help', 'pad-zone-note', 'mic-permission-note', 'keyboard-testing-note',
] as const;

/** The old launcher's frame, by the design system's classes and the page's own. */
const REMOVED_CLASSES = ['s2u-launcher', 's2u-topbar', 's2u-shelf', 's2u-actionbar', 'startup-backdrop', 'startup-wrap', 'launcher-section'] as const;

/** What the game and the tools need of the page: these stay. */
const KEPT_IDS = [
  'view', 'disc-page', 'disc-title', 'disc-pick', 'disc-page-file', 'disc-state', 'loading', 'loading-what', 'loading-bar',
  'site-links', 'home', 'panel', 'panel-body', 'maps', 'disc-file', 'status', 'controls', 'touch', 'mobile-tip', 'fps',
  'toast', 'fullscreen',
] as const;

/** Every source file under the package's `src/`, `test/` and `e2e/` (posix, relative to the package). */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|mts|tsx)$/.test(name)) out.push(relative(viewer, p).split('\\').join('/'));
    }
  };
  for (const d of ['src', 'test', 'e2e']) walk(join(viewer, d));
  return out;
}

describe('CX-9b: setup/index.html is the plain game page', () => {
  it('the old launcher\'s markup is gone, by id', () => {
    const left = REMOVED_IDS.filter((id) => doc.getElementById(id));
    expect(left).toEqual([]);
  });

  it('the old launcher\'s frame is gone, by class', () => {
    const left = REMOVED_CLASSES.filter((c) => doc.getElementsByClassName(c).length > 0);
    expect(left).toEqual([]);
  });

  it('what the game and the tools need stays: the canvas, the loading screen, the disc prompt, the test room\'s chrome', () => {
    const missing = KEPT_IDS.filter((id) => !doc.getElementById(id));
    expect(missing).toEqual([]);
    const input = doc.getElementById('disc-page-file') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe(''); // mobile pickers must not depend on native ISO type recognition
    expect(input.closest('#disc-page')).not.toBeNull();
    expect(doc.getElementById('disc-state')!.getAttribute('role')).toBe('status');
    expect(doc.getElementById('disc-state')!.closest('#disc-page')).not.toBeNull();
    expect(doc.getElementById('disc-page')!.hasAttribute('hidden')).toBe(true);   // the entry shows it (`src/pageEntry.ts`, `src/ui.ts`)
  });

  it('one module script, the entry; the design system, the page\'s sheet and the settings views\' sheet', () => {
    expect([...doc.querySelectorAll('script')].map((s) => s.getAttribute('src'))).toEqual(['/src/entry.ts']);
    expect([...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href')))
      .toEqual(['/src/ds/index.css', '/src/styles.css', '/src/startup.css']);
  });
});

describe('CX-9b: the old launcher\'s modules are deleted and nothing imports them', () => {
  const GONE = [
    'src/modern/launcher.ts', 'src/modern/launcher.css', 'src/modern/tablist.ts',
    'src/controllerSetup.ts', 'src/microphoneSetup.ts', 'src/microphone.ts', 'src/startupHelp.ts', 'src/startupMedia.ts',
  ] as const;

  it('the files are gone', () => {
    expect(GONE.filter((f) => existsSync(join(viewer, f)))).toEqual([]);
  });

  it('no source, test or spec imports one of them', () => {
    const names = ['modern/launcher', 'modern/tablist', 'controllerSetup', 'microphoneSetup', 'microphone', 'startupHelp', 'startupMedia'];
    const spec = new RegExp(`(?:from\\s*|import\\(\\s*)['"][./]*(?:[\\w./]*/)?(?:${names.join('|')})(?:\\.ts)?['"]`);
    const importers = sources().filter((f) => spec.test(readFileSync(join(viewer, f), 'utf-8')));
    expect(importers).toEqual([]);
  });

  it('src/startup.ts keeps only the input contract the modern Home reads; the setup page\'s controller is gone', () => {
    const src = readFileSync(join(viewer, 'src/startup.ts'), 'utf-8');
    expect(src).toMatch(/export function supportedInput\(/);
    expect(src).not.toMatch(/class Startup\b/);
  });

  it('the entry makes no setup page: PAGE_LOADERS has no setup loader', () => {
    const src = readFileSync(join(viewer, 'src/pageEntry.ts'), 'utf-8');
    expect(src).not.toMatch(/import\('\.\/startup'\)/);
    expect(src).not.toMatch(/\bsetup\s*:\s*async/);
  });

  it('the walker keeps no launcher frame rule (keepClearOfBars) and no help-tip hop', () => {
    const src = readFileSync(join(viewer, 'src/startupNavigation.ts'), 'utf-8');
    expect(src).not.toMatch(/keepClearOfBars|s2u-launcher|disc-help/);
  });

  it('startup.css keeps no rule for the removed markup', () => {
    const css = readFileSync(join(viewer, 'src/startup.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    const removed = /#launcher-|\.launcher-|\.s2u-launcher|\.s2u-shelf|\.s2u-topbar|\.s2u-actionbar|\.startup-topbar|\.startup-footer|\.startup-cluster|\.startup-backdrop|\.startup-wrap|\.startup-disc|\.startup-tooltip|\.startup-help|\.startup-bottom|#startup-|#disc-pick|#disc-state|#disc-page|#mic-|#setup-pad|#pad-zone|\.startup-devices|\.startup-customize|\.startup-tabs|\.startup-mic-icon|\.startup-readout|\.startup-meter-head|\.pad-control|\.pad-stick-dot|\.pad-deadzone|body\.test-room|body\.no-served|body\.disc-over|#home|#site-links/;
    const hits = css.split('}').map((r) => r.slice(0, r.indexOf('{') < 0 ? r.length : r.indexOf('{')).trim()).filter((sel) => removed.test(sel));
    expect(hits).toEqual([]);
  });
});
