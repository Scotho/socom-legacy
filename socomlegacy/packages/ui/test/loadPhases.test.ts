import { describe, expect, it } from 'vitest';
import { DiscChoice, LOAD_PHASES, PhaseMarks, budgetTable, type LoadPhase } from '../src/loadPhases';

/** A clock the test turns by hand: the package never reads `performance` itself (W6.R2; PLAT-29a). */
function handClock(start = 0): { now: () => number; set: (t: number) => void } {
  let t = start;
  return { now: () => t, set: (v) => { t = v; } };
}

describe('the load phases (PLAT-29a, research 100)', () => {
  it('names every phase of the block, in boot order', () => {
    expect(LOAD_PHASES.map((p) => p.phase)).toEqual([
      'firstByte', 'pageStart', 'discChosen', 'discIndexed', 'sonyFrame', 'mainMenu', 'lobby', 'mapFirstFrame',
    ] satisfies LoadPhase[]);
  });

  it('marks the phases not built yet as owed, each with the sprint and the task that fill it (W6.R4)', () => {
    const owed = LOAD_PHASES.filter((p) => p.owed).map((p) => [p.phase, p.owed!.sprint, p.owed!.task]);
    expect(owed).toEqual([
      ['sonyFrame', 12, 'BOOT-04'],
      ['mainMenu', 11, 'MENU-02'],
      ['lobby', 17, 'ONL-16'],
    ]);
    // The phases that exist today are the viewer's to mark: none of them owed.
    expect(LOAD_PHASES.filter((p) => !p.owed).map((p) => p.phase))
      .toEqual(['firstByte', 'pageStart', 'discChosen', 'discIndexed', 'mapFirstFrame']);
  });
});

describe('PhaseMarks', () => {
  it('reads the clock it is given when a phase is marked', () => {
    const clock = handClock();
    const marks = new PhaseMarks(clock.now);
    clock.set(12.5);
    expect(marks.mark('pageStart')).toBe(true);
    clock.set(800);
    marks.mark('discIndexed');
    expect(marks.at('pageStart')).toBe(12.5);
    expect(marks.at('discIndexed')).toBe(800);
    expect(marks.at('mapFirstFrame')).toBeUndefined();
  });

  it('keeps the first mark of a phase: a second map or a second disc does not move it', () => {
    const clock = handClock(100);
    const marks = new PhaseMarks(clock.now);
    marks.mark('mapFirstFrame');
    clock.set(5000);
    expect(marks.mark('mapFirstFrame')).toBe(false);
    expect(marks.at('mapFirstFrame')).toBe(100);
  });

  it('takes back a mark whose phase came to nothing, so the next one counts (a refused disc image)', () => {
    const clock = handClock(1000);
    const marks = new PhaseMarks(clock.now);
    expect(marks.mark('discChosen')).toBe(true);    // a file that is no ISO, handed to the page at 1000
    expect(marks.retract('discChosen')).toBe(true); // ... and refused
    expect(marks.at('discChosen')).toBeUndefined();
    expect(marks.marks()).toEqual({});
    clock.set(4000);
    expect(marks.mark('discChosen')).toBe(true);    // the good ISO: its own time, not the refused file's
    expect(marks.at('discChosen')).toBe(4000);
    expect(marks.retract('mapFirstFrame')).toBe(false); // nothing to take back
  });

  it('takes a time read elsewhere (the navigation entry\'s responseStart for the first byte)', () => {
    const marks = new PhaseMarks(() => 999);
    marks.mark('firstByte', 41.2);
    expect(marks.at('firstByte')).toBe(41.2);
  });

  it('refuses a time that is not a finite number, and a phase it does not know', () => {
    const marks = new PhaseMarks(() => 0);
    expect(() => marks.mark('firstByte', Number.NaN)).toThrow(/not a finite time/);
    expect(() => marks.mark('bogus' as LoadPhase)).toThrow(/no such load phase/);
  });

  it('hands back a plain copy of its marks, in boot order', () => {
    const clock = handClock();
    const marks = new PhaseMarks(clock.now);
    clock.set(900); marks.mark('mapFirstFrame');
    clock.set(30); marks.mark('pageStart');
    const copy = marks.marks();
    expect(Object.keys(copy)).toEqual(['pageStart', 'mapFirstFrame']);
    copy.pageStart = 1;
    expect(marks.at('pageStart')).toBe(30);
  });
});

describe('DiscChoice: the disc chosen mark, taken back only when it is its own (the PLAT-29a review)', () => {
  function setup(): { clock: ReturnType<typeof handClock>; marks: PhaseMarks; disc: DiscChoice } {
    const clock = handClock();
    const marks = new PhaseMarks(clock.now);
    return { clock, marks, disc: new DiscChoice(marks) };
  }

  it('a refused image takes its own mark back, so the good ISO picked next is timed from its own choosing', () => {
    const { clock, marks, disc } = setup();
    clock.set(1000); disc.chosen();
    disc.refused();
    expect(marks.at('discChosen')).toBeUndefined();
    clock.set(4000); disc.chosen();
    clock.set(4300); disc.indexed();
    expect(marks.marks()).toEqual({ discChosen: 4000, discIndexed: 4300 });
  });

  it('a second disc refused after the first was accepted leaves the first one\'s mark standing', () => {
    const { clock, marks, disc } = setup();
    clock.set(1000); disc.chosen();
    clock.set(1500); disc.indexed();          // disc A open
    clock.set(9000); disc.chosen();           // disc B ...
    disc.refused();                           // ... refused
    expect(marks.marks()).toEqual({ discChosen: 1000, discIndexed: 1500 });
  });

  it('a disc chosen while the one before is still indexing supersedes it: the mark is the later choice\'s', () => {
    const { clock, marks, disc } = setup();
    clock.set(1000); disc.chosen();           // disc A, its index dropped when ...
    clock.set(1080); disc.chosen();           // ... disc B is chosen before A answers
    clock.set(1400); disc.indexed();          // B open
    expect(marks.marks()).toEqual({ discChosen: 1080, discIndexed: 1400 });
  });

  it('a superseding disc refused leaves no chosen mark: the superseded one was never opened either', () => {
    const { clock, marks, disc } = setup();
    clock.set(1000); disc.chosen();
    clock.set(1080); disc.chosen();
    disc.refused();
    expect(marks.at('discChosen')).toBeUndefined();
    clock.set(3000); disc.chosen();
    expect(marks.at('discChosen')).toBe(3000);
  });

  it('a refusal with no disc of its own pending (the served tree\'s index failing) takes nothing back', () => {
    const { clock, marks, disc } = setup();
    clock.set(1000); disc.chosen();
    clock.set(1500); disc.indexed();
    disc.refused();
    expect(marks.at('discChosen')).toBe(1000);
  });
});

describe('budgetTable', () => {
  it('writes one row a phase and one column a run: the time from page start, the step from the phase before', () => {
    const table = budgetTable([
      { label: 'served tree', marks: { firstByte: 4, pageStart: 60.4, discIndexed: 210, mapFirstFrame: 1210.6 } },
      { label: 'ISO', marks: { firstByte: 5, pageStart: 70, discChosen: 300, discIndexed: 450, mapFirstFrame: 2450 } },
    ]);
    expect(table.split('\n')).toEqual([
      '| phase | served tree (ms) | ISO (ms) |',
      '|---|---|---|',
      '| first byte | 4 | 5 |',
      '| page start (the viewer\'s script) | 60 (+56) | 70 (+65) |',
      '| the disc chosen | -- | 300 (+230) |',
      '| the disc indexed | 210 (+150) | 450 (+150) |',
      '| first Sony frame | OWED (sprint 12, BOOT-04) | OWED (sprint 12, BOOT-04) |',
      '| main menu | OWED (sprint 11, MENU-02) | OWED (sprint 11, MENU-02) |',
      '| lobby | OWED (sprint 17, ONL-16) | OWED (sprint 17, ONL-16) |',
      '| the map\'s first frame | 1211 (+1001) | 2450 (+2000) |',
    ]);
  });

  it('writes a built phase a run did not reach as not reached, and an owed phase that was marked as its time', () => {
    const table = budgetTable([{ label: 'a', marks: { pageStart: 10, mainMenu: 400 } }]);
    expect(table).toContain('| first byte | not reached |');
    expect(table).toContain('| main menu | 400 (+390) |');
  });
});
