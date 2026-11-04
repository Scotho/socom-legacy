import { describe, expect, it } from 'vitest';
import { UiVarManager } from '@s2u/ui';
import { TauntRequests, validTauntText } from '../src/taunts';
import { cardTauntTexts, locKeyId, tauntText, tauntTexts, TAUNT_VARS } from '../src/tauntSettings';

describe('taunt requests (original per-node delay and modern request validation)', () => {
  it('bounds plain text by original editor limits without interpreting markup', () => {
    expect(validTauntText('<script>alert(1)</script>')).toBe(true);
    expect(validTauntText('x'.repeat(45))).toBe(true);
    expect(validTauntText('x'.repeat(46))).toBe(false);
    expect(validTauntText('é'.repeat(30))).toBe(false);
    expect(validTauntText('a\nspoofed sender')).toBe(false);
  });
  it('rejects replays, forged destinations, invalid slots and flooding', () => {
    const r = new TauntRequests();
    expect(r.accept(1, { request: 1, kind: 'custom', slot: 0, text: 'hello' }, 0)).not.toBeNull();
    expect(r.accept(1, { request: 1, kind: 'custom', slot: 0, text: 'hello' }, 2000)).toBeNull();
    expect(r.accept(1, { request: 2, kind: 'custom', slot: 0, text: 'again' }, 10)).toBeNull();
    expect(r.accept(1, { request: 2, kind: 'vocal' }, 10)).not.toBeNull();
    expect(r.accept(1, { request: 3, kind: 'vocal', target: 2 }, 2000)).toBeNull();
    expect(r.accept(1, { request: 4, kind: 'custom', slot: 5, text: 'bad' }, 2000)).toBeNull();
    expect(r.accept(1, { request: 5, kind: 'vocal' }, 6000)).not.toBeNull();
  });
});

describe('the five are the card\'s MPTAUNTMSG1-5, separate from teammate messaging (research 301 §6)', () => {
  it('read off a session\'s variables and off a card\'s CUIVarManager part; MPLOCALSOP is not one of them', () => {
    const v = new UiVarManager();
    v.add('MPLOCALSOP1', { type: 'string', value: 'sop' }, 3);
    v.add('MPTAUNTMSG2', { type: 'string', value: '<b>plain</b>' }, 3);
    expect(TAUNT_VARS).toEqual(['MPTAUNTMSG1', 'MPTAUNTMSG2', 'MPTAUNTMSG3', 'MPTAUNTMSG4', 'MPTAUNTMSG5']);
    expect(tauntTexts(v)).toEqual([null, '<b>plain</b>', null, null, null]);
    expect(tauntTexts(null)).toEqual([null, null, null, null, null]);
    expect(cardTauntTexts({ MPTAUNTMSG3: { type: 'string', value: 'CUSTOM TAUNT 03' }, MPLOCALSOP3: { type: 'string', value: 'x' }, MPTAUNTMSG4: { type: 'int', value: 4 } }))
      .toEqual([null, null, 'CUSTOM TAUNT 03', null, null]);
    expect(cardTauntTexts(7)).toEqual([null, null, null, null, null]);
  });
  it('a HudCLOC key (what dlgNetLogin writes and one.bin holds) shows its caption; a text itself; none the disc\'s default', () => {
    expect(locKeyId('_60762_ThisBulletMightSting_MSG')).toBe(60762);
    expect(locKeyId('COME GET SOME!')).toBeNull();
    const captions = { '60762': 'THIS IS THE END FOR YOU' };
    expect(tauntText('_60762_ThisBulletMightSting_MSG', captions, 'fallback')).toBe('THIS IS THE END FOR YOU');
    expect(tauntText('_60799_Unknown_MSG', captions, 'fallback')).toBe('fallback');
    expect(tauntText('MY OWN', captions, 'fallback')).toBe('MY OWN');
    expect(tauntText(null, captions, 'fallback')).toBe('fallback');
  });
});
