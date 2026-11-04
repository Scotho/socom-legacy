import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as glueModule from '../src/armoryGlue';
import { armoryRoundHooks, pressUnlessArmory, syncArmoryTouch, unlessArmory } from '../src/armoryGlue';

/**
 * Repair 2 of the S3 review: an abandon is no round's start (the room waits, a held seat stays held, a change is taken),
 * and the touch layer is captured with the rest of the input while the ARMORY is open.
 */
describe('the round hooks: a round\'s start drops and closes; an abandon flushes and keeps the screen', () => {
  function hooks() {
    const calls: string[] = [];
    const h = armoryRoundHooks({
      clearDecals: () => calls.push('decals'),
      clearAir: () => calls.push('air'),
      send: { drop: () => calls.push('drop'), flush: () => calls.push('flush') },
      closeArmory: () => calls.push('close'),
    });
    return { h, calls };
  }

  it('newRound: the decals, the air (ROUND_START_PROJECTILES_READING), the pending change dropped (ARMORY_ROUND_START_RACE_READING), the screen closed', () => {
    const { h, calls } = hooks();
    h.newRound();
    expect(calls).toEqual(['decals', 'air', 'drop', 'close']);
  });

  it('abandoned: the decals, the pending change sent, the screen left open (ARMORY_ABANDON_READING)', () => {
    const { h, calls } = hooks();
    h.abandoned();
    expect(calls).toEqual(['decals', 'air', 'flush']);
    expect(calls).not.toContain('drop');
    expect(calls).not.toContain('close');
  });
});

describe('the touch layer while the ARMORY is open', () => {
  it('a gated callback does nothing while open, and runs when shut', () => {
    let open = true;
    const got: string[] = [];
    const stance = unlessArmory(() => open, (e: string) => got.push(e));
    stance('down');
    expect(got).toEqual([]);
    open = false;
    stance('down');
    expect(got).toEqual(['down']);
  });

  it('the stance: a press does nothing while open, but its release and cancel always reach the walk', () => {
    const got: string[] = [];
    const stance = pressUnlessArmory<'up' | 'cancel'>(() => true, (e) => got.push(e));
    stance('down'); stance('up'); stance('cancel');
    expect(got).toEqual(['up', 'cancel']);
  });

  it('opening hides the layer (`armory-open`) and lets go of the held controls once; closing shows it again', () => {
    const classes = new Set<string>();
    const body = { classList: { toggle: (n: string, on: boolean) => { if (on) classes.add(n); else classes.delete(n); } } };
    let released = 0;
    let was = false;
    was = syncArmoryTouch(body, true, was, () => released++);
    expect(classes.has('armory-open')).toBe(true);
    was = syncArmoryTouch(body, true, was, () => released++);           // a later frame: nothing again
    expect(released).toBe(1);
    was = syncArmoryTouch(body, false, was, () => released++);
    expect(classes.has('armory-open')).toBe(false);
    expect(released).toBe(1);
    expect(was).toBe(false);
  });

  it('the stylesheet hides the whole touch layer under `body.armory-open`', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles.css'), 'utf8');
    // MP-1 (FI.R4): the layer's rules are its root's (`.touch`), whatever element the root is; `/testroom`'s is the body.
    expect(css).toMatch(/(^|[\s,}])\.touch\.armory-open #touch\s*\{\s*display:\s*none;?\s*\}/m);
  });

  it('the stylesheet hides the site chrome under `body.armory-open` (its top bar lay over the title rows); closing restores it', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles.css'), 'utf8');
    const rule = /((?:body\.armory-open #[a-z-]+\s*,\s*)*body\.armory-open #[a-z-]+)\s*\{\s*display:\s*none\s*!important;?\s*\}/.exec(css);
    expect(rule).not.toBeNull();
    const hidden = [...rule![1]!.matchAll(/#([a-z-]+)/g)].map((m) => m[1]);
    for (const id of ['site-links', 'panel', 'controls', 'fps', 'fullscreen']) expect(hidden, id).toContain(id);
    // The class is the one `syncArmoryTouch` toggles: off when the screen closes, so the chrome's own rules stand again.
    const classes = new Set<string>();
    const body = { classList: { toggle: (n: string, on: boolean) => { if (on) classes.add(n); else classes.delete(n); } } };
    syncArmoryTouch(body, false, syncArmoryTouch(body, true, false, () => {}), () => {});
    expect(classes.has('armory-open')).toBe(false);
  });

  it('main.ts wires them: the touch stance and RELOAD gated, the layer synced; the abandon its own hook (PAR-2: through the one part)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../src/main.ts'), 'utf8');
    // PAR-5: through the one touch part (`./matchTouch` `mountTouch`); both pages hand it the same two gates.
    for (const page of [src, readFileSync(resolve(here, '../src/matchMount.ts'), 'utf8')]) {
      expect(page).toMatch(/stance: pressUnlessArmory<'up' \| 'cancel'>\(\(\) => armory\.isOpen\(\), \(event\) => walk\.stanceTouch\(event\)\),/);
      expect(page).toMatch(/reload: unlessArmory\(\(\) => armory\.isOpen\(\), /);
    }
    expect(src).toMatch(/syncArmoryTouch\(/);
    expect(src).toMatch(/\.\.\.armoryPart\.netDeps\(\),/);
    const part = readFileSync(resolve(here, '../src/matchArmory.ts'), 'utf8');
    expect(part).toMatch(/abandoned: hooks\.abandoned/);
    expect(part).toMatch(/newRound: hooks\.newRound/);
  });
});

/**
 * The owner's ruling of 2026-10-02 (INT.R3; replaces the between-rounds entry of the S3 review and the waiting room's of
 * 2026-10-01): in a match -- a round running, the round-end interval, the waiting before a round -- nothing opens the
 * ARMORY. Dead, the Inventory button (I, R2, the touch INV) is WEAPON EXCHANGE's (research 94 §B2); alive, only the
 * pad's R2 is the swap's (its item cycling; research 94 §4.1). The ARMORY is the lobby's (research 95 §4.1; ONL-16/17); until the lobby exists it
 * opens only on taking a seat (ARMORY_SEAT_READING), the one place the character type changes.
 */
describe('nothing in the match opens the ARMORY; it opens on a seat only (owner, 2026-10-02)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const main = readFileSync(resolve(here, '../src/main.ts'), 'utf8');
  // PAR-2: the opener is the one part the pages mount (`./matchArmory`); its callers on each page are read with it.
  const part = readFileSync(resolve(here, '../src/matchArmory.ts'), 'utf8');
  const mount = readFileSync(resolve(here, '../src/matchMount.ts'), 'utf8');

  it('the Inventory button\'s ARMORY gate is gone from the glue, and the between-rounds reading from the ARMORY', () => {
    // The glue's exports read statically (a dynamic import of `../src/armory` pulled its whole graph into the test body:
    // a timeout risk under load, the fix round's finding 4); the ARMORY's source is read as text.
    expect('inventoryOpensArmory' in glueModule).toBe(false);
    const armorySrc = readFileSync(resolve(here, '../src/armory.ts'), 'utf8');
    expect(armorySrc).not.toMatch(/ARMORY_BETWEEN_ROUNDS_READING/);
  });

  it('the ARMORY opens from an allow-listed few call sites only -- none on I, R2 or the touch INV (PAR-2: the part and its pages)', () => {
    // Every line of the part and the page that calls an opener, whatever its line breaks (the fix round's finding 3: a
    // guard on one line missed an R2 edge split over two). New call sites must be added here deliberately.
    const sites = (text: string, re: RegExp) => text.split('\n').filter((l) => re.test(l)).map((l) => l.trim());
    expect(sites(part, /\barmory\.open\(/)).toEqual([
      'const opened = armory.open({ type: d.loadouts.type(side), kit: d.loadouts.pending(side) ?? d.loadouts.base(side) });',
    ]);
    expect(sites(part, /\bopen\(\)(?!:)/)).toEqual([      // the interface's `open(): boolean;` aside
      'if (armory.isOpen() || open()) return;',               // openOrDone: a seat's or the offline match's
    ]);
    expect(sites(part, /\bopenOrDone\(\)(?!:)/)).toEqual([
      'const seat = (): void => { if (!d.playing()) openOrDone(); else if (ready()) openOrDone(); else wanted = true; };',   // the room's seat, the offline match's entry (off: told done at once, PAR-2's F1)
      'openOrDone();',                                        // setData: the data landed for a seat that waited
    ]);
    expect(sites(part, /\bseat\(\)(?!:)/)).toEqual(['joined: () => { seat(); },']);   // the room's seat (NetPage's `joined`)
    for (const [f, text] of [['main.ts', main], ['matchMount.ts', mount]] as const) {
      expect(text, f).not.toMatch(/\bnew Armory\(|\barmory\.open\(|\bopenOrDone\(|function openArmory\(/);
    }
    // The menu match (PAR-2): only its development hook opens it by hand; its seats through the part's `joined`.
    expect(sites(mount, /armoryPart\.(open|seat)\(/)).toEqual(['openArmory: () => armoryPart.open(),             // PAR-2: `./main`\'s -- opens it as a seat\'s join does (a playtest instrument)']);
    expect(sites(main, /armoryPart\.(open|seat)\(/)).toEqual([
      'if (!armoryPart.open()) { const go = soloAfterArmory; soloAfterArmory = null; go?.(); }',   // a test-room mod reload, once the load has finished (`tryReopenArmory`)
      'if (!reopenArmory) armoryPart.seat();         // now, or once its data lands; none to open: the room made at once',   // the offline match's entry; a mod reload waits
      'openArmory: () => armoryPart.open(),',                 // the __viewer hook (tests)
    ]);
  });

  it('main.ts: I, R2 and the touch INV reach WEAPON EXCHANGE and the swap, never the ARMORY', () => {
    expect(main).not.toMatch(/inventoryOpensArmory|armoryBetween/);
    // The keydown listener: only an open ARMORY takes keys; no key opens it (multi-line: `[\s\S]` within the statement).
    expect(main).not.toMatch(/e\.code === 'KeyI'[^;]*openArmory\(\)/);
    // The pad: no R2 edge opens it.
    expect(main).not.toMatch(/edges\.has\('R2'\)[^;]*openArmory\(\)/);
    // The touch INV is WEAPON EXCHANGE's alone (PAR-5: the part's, `./matchTouch`, handed main.ts's `exchangePart`).
    const touchPart = readFileSync(resolve(here, '../src/matchTouch.ts'), 'utf8');
    const touch = /weapons\?\.addEventListener\('pointerdown', \(e\) => \{([\s\S]*?)\n {2}\}, \{ signal \}\);/.exec(touchPart);
    expect(touch).not.toBeNull();
    expect(touch![1]).not.toMatch(/armory/i);
    expect(touch![1]).toMatch(/d\.exchange\.menu\.touchButton\(d\.exchange\.gate\(\)\)/);
    expect(main).toMatch(/exchange: exchangePart, covered: /);
  });

  it('main.ts: a seat still opens it (ARMORY_SEAT_READING): the welcome\'s `joined`, the hello\'s `armory`, the offline match', () => {
    expect(part).toMatch(/const seat = \(\): void => \{ if \(!d\.playing\(\)\) openOrDone\(\); else if \(ready\(\)\) openOrDone\(\); else wanted = true; \};/);
    expect(part).toMatch(/joined: \(\) => \{ seat\(\); \},/);
    expect(part).toMatch(/armory: d\.playing\(\),/);
    expect(main).toMatch(/playing: \(\) => !NO_ARMORY && playOn,/);
    expect(main).toMatch(/armoryEntry = map;\s*soloAfterArmory = start;/);
  });
});

/**
 * LATER 12 (research 222 §8): `/testroom`'s round start cleared the grenades in the air and the scorches but not the
 * flashbang's wash -- a blind set off in the last round ran on into the next. Its hooks now clear through the
 * throwables' own `roundStart` (the air, the scorches, the wash), as the front end's `roundClear` does.
 */
describe('/testroom\'s round start clears the throwables as the front end does (LATER 12)', () => {
  const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf8');
  const glue = /const armoryPart = mountArmory\(\{([\s\S]*?)\n\}\);/.exec(main)?.[1] ?? '';   // PAR-2: the part's mount, /testroom's clears

  it('the round hooks reach `throws.roundStart()`, and no hook clears a part of it by hand', () => {
    expect(glue).toMatch(/throws\.roundStart\(\)/);
    expect(glue).not.toMatch(/grenade\.clear(Air|Scorches)\(\)/);
  });
});
