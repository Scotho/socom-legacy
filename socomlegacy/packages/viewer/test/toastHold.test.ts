import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToastHold } from '../src/toastHold';

/**
 * The sprint-5 finding: the page's toast ("Online: in the match") lay over the ARMORY's title bar. The original's ARMORY
 * shows no such pill (the owner's capture of the lobby, research 95 §2.7), so while the screen is open a toast is held
 * -- the one showing taken down, the newest kept -- and shown when the screen closes.
 */
describe('the toast held while the ARMORY is open', () => {
  function pill() {
    const shown: string[] = [];
    let hidden = 0;
    const t = new ToastHold((text) => { shown.push(text); }, () => { hidden++; });
    return { t, shown, hidden: () => hidden };
  }

  it('shown at once while nothing holds it', () => {
    const p = pill();
    p.t.toast('Online: in the match');
    expect(p.shown).toEqual(['Online: in the match']);
  });

  it('held while open: nothing shown; the newest is shown once on the close', () => {
    const p = pill();
    p.t.hold(true);
    p.t.toast('Online: connecting');
    p.t.toast('Online: in the match');
    expect(p.shown).toEqual([]);
    p.t.hold(false);
    expect(p.shown).toEqual(['Online: in the match']);
    p.t.expired();                                                // its few seconds out
    p.t.hold(true); p.t.hold(false);
    expect(p.shown).toEqual(['Online: in the match']);            // nothing again: it was shown and read
  });

  it('a toast showing when the screen opens is taken down and shown again on the close; one that ran out is not', () => {
    const p = pill();
    p.t.toast('Online: in the match');
    p.t.hold(true);
    expect(p.hidden()).toBe(1);
    p.t.hold(false);
    expect(p.shown).toEqual(['Online: in the match', 'Online: in the match']);
    const q = pill();
    q.t.toast('Controller connected');
    q.t.expired();
    q.t.hold(true); q.t.hold(false);
    expect(q.shown).toEqual(['Controller connected']);
  });

  it('the stylesheet hides the pill under body.armory-open, for the frame before the hold', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/body\.armory-open #toast[^{]*\{[^}]*display:\s*none/);
  });
});
