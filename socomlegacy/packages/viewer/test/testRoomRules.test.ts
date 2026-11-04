// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Ui } from '../src/ui';
import { readRules, resolveRules, RULES_KEY, writeRules } from '../src/rules';
import { STANDING_ROOM_CLASSIC_LINE } from '../src/connectHost';

/**
 * OT.R71 (the owner, 2026-10-22): respawn is a match option "on live match creation (as well as the test room)". The
 * test room's panel has a Rules setting -- Classic (the original's default, research 163 R163.2) or Respawn -- remembered
 * in this browser (`RULES_KEY`), beaten by a link's `rules=`; a choice opens the next room under it, the offline match's
 * and the server's alike (`main.ts` `connectNet`). The switch is a browser adaptation (the test room's own markup); the
 * rules it picks are the original's. Product track.
 */

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };

describe('the test room\'s Rules setting (OT.R71)', () => {
  beforeEach(load);

  it('the panel has a Rules switch: Classic pressed by default, then Respawn', () => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#rules button[data-rules]'));
    expect(buttons.map((b) => b.dataset['rules'])).toEqual(['classic', 'respawn']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(document.getElementById('rules-label')!.textContent).toBe('Rules');
  });

  it('a click on a button not pressed presses it and tells every handler; setRules puts the switch on a choice', () => {
    const ui = new Ui();
    const heard: string[] = [], also: string[] = [];
    ui.onRules((r) => heard.push(r));
    ui.onRules((r) => also.push(r));
    const respawn = document.querySelector<HTMLButtonElement>('#rules button[data-rules="respawn"]')!;
    respawn.click();
    respawn.click();                                                   // pressed already: nothing
    expect([heard, also]).toEqual([['respawn'], ['respawn']]);
    expect(respawn.getAttribute('aria-pressed')).toBe('true');
    ui.setRules('classic');
    expect(document.querySelector('#rules button[data-rules="classic"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(respawn.getAttribute('aria-pressed')).toBe('false');
  });

  it('the choice is remembered under RULES_KEY and read back; the link\'s rules= beats it', () => {
    const store = new Map<string, string>();
    const settings = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => { store.set(k, v); return { ok: true as const }; } };
    expect(readRules(settings as never)).toBeNull();
    writeRules('respawn', settings as never);
    expect(store.get(RULES_KEY)).toBe('respawn');
    expect(resolveRules('', readRules(settings as never)).rules).toBe('respawn');
    expect(resolveRules('?rules=classic', readRules(settings as never)).rules).toBe('classic');
  });

  // #421 review F6, the merge controller's (b): online, a standing room is classic (LATER 313 is standing respawn rooms).
  // A respawn ask looks up the map's classic standing room, and once seated there the page says plainly that the room
  // plays classic; offline and a single-process central keep respawn (the room path is not taken there).
  it('main.ts: a respawn ask looks up the classic standing room, joins it classic, and says so (F6)', () => {
    expect(STANDING_ROOM_CLASSIC_LINE).toBe('Respawn isn\'t offered in the online test room yet: this room plays classic');
    expect(main).toMatch(/const room = roomBase !== null \? roomKeyOf\(stem, RULES === 'respawn' \? 'classic' : RULES, map\.gameType\) : null;/);
    const seat = main.slice(main.indexOf('seat: (seat, provider) =>'), main.indexOf('seat: (seat, provider) =>') + 400);
    expect(seat).toMatch(/rules: 'classic'/);
    expect(seat).toMatch(/STANDING_ROOM_CLASSIC_LINE/);
  });

  it('main.ts: the match\'s rules follow the setting -- the switch shows them, a choice is written, the link\'s rules= dropped, the room made again', () => {
    expect(main).toMatch(/let RULES: Rules = resolveRules\(SEARCH, readRules\(\)\)\.rules;/);
    expect(main).toMatch(/ui\.setRules\(RULES\);/);
    const wire = main.slice(main.indexOf('ui.onRules('), main.indexOf('ui.onRules(') + 600);
    expect(wire).toMatch(/writeRules\(choice\)/);
    expect(wire).toMatch(/updateAddress\(\{ drop: \['rules'\] \}\)/);
    expect(wire).toMatch(/RULES = choice;/);
    expect(wire).toMatch(/if \(loaded\) connectNet\(loaded\);/);
  });
});
