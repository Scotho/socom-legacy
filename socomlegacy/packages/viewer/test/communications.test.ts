import { describe, expect, it } from 'vitest';
import { UiVarManager } from '@s2u/ui';
import { CommunicationRequests, TACTICAL_COMMANDS, tacticalAllowed } from '../src/communications';
import { MESSAGE_VARS, messageTexts } from '../src/messageSettings';
import { cardTauntTexts } from '../src/tauntSettings';

describe('original teammate communications, research 302', () => {
  it('accepts only the seven native tactical commands and five bounded custom slots', () => {
    const r = new CommunicationRequests();
    for (const [i, command] of TACTICAL_COMMANDS.entries()) expect(r.accept(1, { kind: 'tactical', command, request: i + 1 }, 0)).not.toBeNull();
    expect(r.accept(1, { kind: 'tactical', command: 0, request: 8 }, 0)).toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 5, text: 'bad', request: 9 }, 0)).toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 0, text: 'x'.repeat(46), request: 10 }, 0)).toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 0, text: '<b>literal</b>', request: 11 }, 0)).not.toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 0, text: 'again', request: 12 }, 100)).toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 1, text: 'different', request: 13 }, 100)).not.toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 2, text: 'forged', request: 14, target: 2 }, 100)).toBeNull();
    expect(r.accept(1, { kind: 'custom', slot: 2, text: 'replay', request: 13 }, 6000)).toBeNull();
  });

  it('gates DEFUSE to game types 1-2 and PROTECT to 3-4 (FUN_0022fa90); the other five in every type', () => {
    for (const t of [1, 2, 3, 4, 5, undefined]) {
      expect(tacticalAllowed(46, t), `defuse ${t}`).toBe(t === 1 || t === 2);
      expect(tacticalAllowed(47, t), `protect ${t}`).toBe(t === 3 || t === 4);
      for (const c of [6, 3, 23, 45, 48]) expect(tacticalAllowed(c, t)).toBe(true);
    }
    expect(tacticalAllowed(49, 1)).toBe(false);
  });

  it('the five messages are MPLOCALSOP1-5: the session\'s variables, else the card\'s CUIVarManager part -- never a browser key', () => {
    expect(MESSAGE_VARS).toEqual(['MPLOCALSOP1', 'MPLOCALSOP2', 'MPLOCALSOP3', 'MPLOCALSOP4', 'MPLOCALSOP5']);
    const vars = new UiVarManager();
    vars.add('MPLOCALSOP1', { type: 'string', value: 'Cover left' }, 3);
    vars.add('MPTAUNTMSG1', { type: 'string', value: 'a taunt' }, 3);
    expect(messageTexts(vars)).toEqual(['Cover left', null, null, null, null]);
    expect(cardTauntTexts({ MPLOCALSOP2: { type: 'string', value: 'Hold' }, MPTAUNTMSG2: { type: 'string', value: 'x' } }, MESSAGE_VARS))
      .toEqual([null, 'Hold', null, null, null]);
  });
});
