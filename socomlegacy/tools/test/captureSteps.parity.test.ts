// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseSteps } from '../captureSteps';

/**
 * `parseSteps` on planted lines alone (registry `harness.steps.parse`; web research 108 §6): drive.py's `parse`
 * vocabulary -- `<mode>+<delay>:<BTN>[+<BTN>]`, a `#` comment, a blank line skipped, the buttons upper-cased and
 * `NONE` dropped (desktop@be557831:tools_py/parity/drive.py:237). The desktop's own title script is held by the
 * disc-gated test in `captureScore.test.ts`; this one needs no data.
 */
describe('parseSteps on planted lines', () => {
  it('reads <mode>+<delay>:<BTN>[+<BTN>] with a # comment and a blank line: buttons upper-cased, NONE dropped', () => {
    expect(parseSteps('next+0.5:cross+up # c\n\nstable+1:NONE')).toEqual([
      { mode: 'next', delay: 0.5, buttons: ['CROSS', 'UP'] },
      { mode: 'stable', delay: 1, buttons: [] },
    ]);
    // A comment-only line and CRLF line ends are skipped as blank.
    expect(parseSteps('# only a comment\r\nwait+2:start\r\n')).toEqual([{ mode: 'wait', delay: 2, buttons: ['START'] }]);
  });

  it("refuses a line with no ':', no '+<delay>', or a delay that is not a number", () => {
    expect(() => parseSteps('next+0.5 cross')).toThrow(/no ':'/);
    expect(() => parseSteps('next:cross')).toThrow(/no '\+<delay>'/);
    expect(() => parseSteps('next+soon:cross')).toThrow(/is not a number/);
  });
});
