import { describe, expect, it } from 'vitest';
import { ActionSelection, contextPrompt, type ActionContext } from '../src/actionContext';
import { ActionLifecycle } from '../src/actionContext';
import { Hud, type ActionEntry } from '../src/hud';

/**
 * LATER 636 (simulation track; reading, pending review): the HUD's head and the press are one list's head. The original
 * keeps one action list (`DAT_0040d558`, built by `FUN_0021f850`): `FUN_0021f210` draws its head's record
 * (`**(list + 8)`, D:L73945-73950) and `FUN_0021d9d0` fires its head's action (`FUN_00544c80(.., *DAT_0040d558 + 4)`,
 * D:L73398-73401) -- no other source of the prompt. The climb (0x4) is one of the list's bits, after the bomb's (0x80).
 * Was: the HUD's climb feed overrode the list's head, so a bomb carrier at a site with a ledge in reach saw CLIMB while
 * the press planted the bomb.
 */
describe('LATER 636: the prompt shown is the head the press fires', () => {
  /** The list's entries as `./matchActions` `prompt` builds them (the traversal's entry the climb's record). */
  const entries = (list: readonly NonNullable<ActionContext>[]): ActionEntry[] =>
    list.map((c) => ({ prompt: c === 'traversal' ? 'climb' : contextPrompt(c)! }));

  it('a bomb carrier at a site with a ledge in reach: the HUD shows the bomb, the press plants it', () => {
    const selection = new ActionSelection();
    const inputs = { bombPlant: true, traversal: true };
    const pick = (): ActionContext => selection.pick(inputs);
    const hud = new Hud();
    pick();
    hud.setClimbPrompt({ visible: true, kind: 'low' });   // the traversal's own feed, as `main.ts` / `matchMount.ts` give it
    hud.setNearbyAction(entries(selection.list()));
    const life = new ActionLifecycle(pick);
    expect(life.press().heldContext).toBe('bombPlant');   // the press holds the plant (the list's head)
    expect(hud.state().model.action).toBe(contextPrompt('bombPlant'));
    expect(hud.state().model.actionSides).toEqual([{ prompt: 'climb', colour: 'green' }]);
  });

  it('the d-pad turns the climb to the head: the HUD shows CLIMB and the press is the traversal\'s', () => {
    const selection = new ActionSelection();
    const inputs = { bombPlant: true, traversal: true };
    const pick = (): ActionContext => selection.pick(inputs);
    pick();
    selection.rotate('left');
    const hud = new Hud();
    hud.setClimbPrompt({ visible: true, kind: 'low' });
    hud.setNearbyAction(entries(selection.list()));
    expect(pick()).toBe('traversal');
    expect(hud.state().model.action).toBe('climb');
    expect(hud.state().model.actionSides).toEqual([{ prompt: 'bomb', colour: 'green' }]);
  });

  it('the climb feed alone (no list fed, a page without the picker) still shows CLIMB', () => {
    const hud = new Hud();
    hud.setClimbPrompt({ visible: true, kind: 'low' });
    expect(hud.state().model.action).toBe('climb');
    hud.setNearbyAction('door');                          // a single prompt, not the picker's list: the climb keeps the slot
    expect(hud.state().model.action).toBe('climb');
  });
});
