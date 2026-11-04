import { describe, expect, it } from 'vitest';
import {
  MENU_HISTORY_BUFFERS, MENU_HISTORY_OVERFLOW_READING, MENU_NAME_LENGTH_READING, MENU_QUEUE_OVERFLOW_READING,
  MENU_QUEUE_SLOTS, MENU_RECORD, MenuQueue, NO_ARG, PREVIOUS_SCREEN,
} from '../../src/screens/menuQueue';

/**
 * PLAT-10's menu command object M (0x414ed0; web research 115 §1.1, §2): the 40 queued 0x34-byte records, the history
 * stack, the flushes, and SwitchMenu's four cases -- transcribed from `FUN_0027e720` (D:L126556-126639), `FUN_0027f460`
 * (D:L127000-127037), `FUN_0027f3f0` (D:L126984-126997), `FUN_0027c7f0` (D:L125492-125512), `FUN_0027edf0`
 * (D:L126747-126779) and the queueing commands `FUN_0027c160/260/360` (D:L125335-125393).
 */

describe('M, the records (research 115 §1.1)', () => {
  it('starts with 40 records of type -1 named NO_ARG, count 0, top 0, an empty history', () => {
    const m = new MenuQueue();
    expect(m.records).toHaveLength(MENU_QUEUE_SLOTS);
    expect(MENU_QUEUE_SLOTS).toBe(40);
    expect(m.records.every((r) => r.type === -1 && r.name === NO_ARG)).toBe(true);
    expect([m.count, m.top, m.depth]).toEqual([0, 0, 0]);
    expect(MENU_HISTORY_BUFFERS).toBe(32);
  });

  it('a push pre-increments top (slot 0 is never written) and counts', () => {
    const m = new MenuQueue();
    m.push(MENU_RECORD.DISABLE, 'a');
    m.push(MENU_RECORD.ENABLE, 'b');
    expect([m.top, m.count]).toEqual([2, 2]);
    expect(m.records[0]).toEqual({ type: -1, name: NO_ARG });
    expect(m.records[1]).toEqual({ type: 8, name: 'a' });
    expect(m.records[2]).toEqual({ type: 7, name: 'b' });
    expect(m.peek()).toEqual({ type: 7, name: 'b' });          // the consumer reads the top: newest first
  });

  it('consuming the top: name NO_ARG, type -1, top - 1, count - 1 for every queued type (FUN_0027f460)', () => {
    for (const t of [2, 3, 5, 6, 7, 8]) {
      const m = new MenuQueue();
      m.push(t, 'x');
      m.consume();
      expect([m.records[1]!.type, m.records[1]!.name, m.top, m.count]).toEqual([-1, NO_ARG, 0, 0]);
    }
  });

  it('consuming types 0 and 1 and an idle slot as read (never queued on the disc)', () => {
    const m = new MenuQueue();
    m.records[0] = { type: 0, name: 'z' };
    m.count = 1;
    m.consume();                                            // 0: type -1, top unchanged
    expect([m.records[0]!.type, m.records[0]!.name, m.top, m.count]).toEqual([-1, NO_ARG, 0, 0]);
    m.top = 1; m.records[1] = { type: 1, name: 'y' }; m.count = 1;
    m.consume();                                            // 1: top - 1, type unchanged
    expect([m.records[1]!.type, m.top, m.count]).toEqual([1, 0, 0]);
    m.count = 1;
    m.consume();                                            // -1: nothing but the name and the count
    expect([m.records[0]!.type, m.top, m.count]).toEqual([-1, 0, 0]);
  });

  it('MENU_QUEUE_OVERFLOW_READING: a 40th pending record is refused, nothing changed', () => {
    expect(MENU_QUEUE_OVERFLOW_READING).toBe(39);
    const m = new MenuQueue();
    for (let i = 0; i < 39; i++) expect(m.push(MENU_RECORD.ACTIVATE, `b${i}`)).toBe(true);
    expect(m.push(MENU_RECORD.ACTIVATE, 'one too many')).toBe(false);
    expect([m.top, m.count]).toEqual([39, 39]);
  });

  it('MENU_NAME_LENGTH_READING: a name is cut at 47 characters (strcpy into 0x30 bytes)', () => {
    expect(MENU_NAME_LENGTH_READING).toBe(47);
    const m = new MenuQueue();
    m.push(MENU_RECORD.SWITCH, 'd'.repeat(60));
    expect(m.peek()!.name).toBe('d'.repeat(47));
  });
});

describe('M, the history (research 115 §1.1, R115.4)', () => {
  it('a push appends the name; a pop takes the newest back', () => {
    const m = new MenuQueue();
    m.pushHistory('dlgIntroScreen.rdr');
    m.pushHistory('dlgMenu.rdr');
    expect(m.depth).toBe(2);
    expect(m.historyTop()).toBe('dlgMenu.rdr');
    expect(m.popHistory()).toBe('dlgMenu.rdr');
    expect(m.history).toEqual(['dlgIntroScreen.rdr']);
  });

  it('MENU_HISTORY_OVERFLOW_READING: past the 32 pooled buffers the newest 32 are kept', () => {
    expect(MENU_HISTORY_OVERFLOW_READING).toBe(32);
    const m = new MenuQueue();
    for (let i = 0; i < 34; i++) m.pushHistory(`d${i}`);
    expect(m.depth).toBe(32);
    expect(m.history[0]).toBe('d2');
    expect(m.historyTop()).toBe('d33');
  });

  it('FlushMenuHistory blanks all 40 names and empties the history; types, count and top stay (FUN_0027c7f0)', () => {
    const m = new MenuQueue();
    m.push(MENU_RECORD.SWITCH, 'dlgOptions_Menu.rdr');
    m.pushHistory('dlgMenu.rdr');
    m.popupObject = { tick: () => {} };
    m.flushHistory();
    expect(m.records[1]).toEqual({ type: 2, name: NO_ARG });   // the pending record survives, named NO_ARG
    expect([m.top, m.count, m.depth]).toEqual([1, 1, 0]);
    expect(m.popupObject).not.toBeNull();                     // FlushMenuHistory keeps the popup
  });

  it('FUN_0027edf0(M, 1) does the same and destroys the popup object (the menu state\'s UnInit)', () => {
    const m = new MenuQueue();
    m.pushHistory('a');
    m.popupObject = { tick: () => {} };
    m.flush(true);
    expect([m.depth, m.popupObject]).toEqual([0, null]);
    m.popupObject = { tick: () => {} };
    m.flush(false);
    expect(m.popupObject).not.toBeNull();
  });
});

describe('SwitchMenu (FUN_0027e720, research 115 §2.1)', () => {
  const run = (history: string[], target: string) => {
    const m = new MenuQueue();
    for (const h of history) m.pushHistory(h);
    const sounds: string[] = [];
    const answer = m.switchMenu(target, () => sounds.push('BACK'));
    return { m, sounds, answer };
  };

  it('S1: PREVIOUS_SCREEN with a history -- a type-5 record naming the top, the history popped at once, BACK played', () => {
    const { m, sounds, answer } = run(['dlgIntroScreen.rdr', 'dlgMenu.rdr'], PREVIOUS_SCREEN);
    expect(answer).toBe(true);
    expect(m.peek()).toEqual({ type: MENU_RECORD.BACK, name: 'dlgMenu.rdr' });
    expect([m.count, m.top]).toEqual([1, 1]);
    expect(m.history).toEqual(['dlgIntroScreen.rdr']);
    expect(sounds).toEqual(['BACK']);
  });

  it('S2: PREVIOUS_SCREEN with an empty history -- nothing queued, BACK still played', () => {
    const { m, sounds } = run([], PREVIOUS_SCREEN);
    expect([m.count, m.top]).toEqual([0, 0]);
    expect(sounds).toEqual(['BACK']);
  });

  it('S3: a target equal to the history\'s top, case-insensitively, is the same back with no sound', () => {
    const { m, sounds } = run(['dlgIntroScreen.rdr', 'dlgMenu.rdr'], 'DLGMENU.RDR');
    expect(m.peek()).toEqual({ type: MENU_RECORD.BACK, name: 'dlgMenu.rdr' });
    expect(m.history).toEqual(['dlgIntroScreen.rdr']);
    expect(sounds).toEqual([]);
  });

  it('S4: any other target -- a type-2 record, the history untouched, no sound', () => {
    const { m, sounds } = run(['dlgIntroScreen.rdr'], 'dlgOptions_Menu.rdr');
    expect(m.peek()).toEqual({ type: MENU_RECORD.SWITCH, name: 'dlgOptions_Menu.rdr' });
    expect(m.history).toEqual(['dlgIntroScreen.rdr']);
    expect(sounds).toEqual([]);
  });

  it('PREVIOUS_SCREEN is matched case-sensitively (strcmp): previous_screen is a forward switch', () => {
    const { m, sounds } = run(['dlgMenu.rdr'], 'previous_screen');
    expect(m.peek()).toEqual({ type: MENU_RECORD.SWITCH, name: 'previous_screen' });
    expect(sounds).toEqual([]);
  });
});

describe('the other queueing commands (research 115 §2.2)', () => {
  it('DisableButton 8, EnableButton 7, ActivateButton 6, PopUpDialog 3', () => {
    const m = new MenuQueue();
    m.disableButton('a'); m.enableButton('b'); m.activateButton('c'); m.queuePopup('d');
    expect(m.records.slice(1, 5)).toEqual([
      { type: 8, name: 'a' }, { type: 7, name: 'b' }, { type: 6, name: 'c' }, { type: 3, name: 'd' },
    ]);
    expect(MENU_RECORD).toEqual({ SWITCH: 2, POPUP: 3, BACK: 5, ACTIVATE: 6, ENABLE: 7, DISABLE: 8 });
  });
});
