import { describe, expect, it } from 'vitest';
import { buildDialogScreen, findNode, UiVarManager, type UiNode } from '../../src/index';
import { WidgetSet } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

/**
 * LATER 1546 (simulation track; reading, pending review): a dialog's plain widgets (TEXT, SECURETEXT, IMAGE,
 * WRAPPEDTEXT) may share a NAME, and each follows its OWN `UIVAR`. The original makes each item and attaches its UIVAR
 * as that item is set up (`FUN_003792f0` D:L273072-273077: `FUN_00385df0`, then the attachment's vtable +0xc with the
 * var) -- per item, not per name. The disc's PLAYER INFO pages (dlgMPBriefingRoom, dlgLadderLobby, dlgFriendList,
 * dlgManageRoster, dlgManageRosterLeader) each hold a top-level TEXT `bar_title` and then the page's WRAPPEDTEXT
 * `bar_title` on PLAYER_INFO_NAME_VAR; dlgExitState two TEXT `PercentCntr`, the first CHILDOF CPercent on
 * StatObjectivesPct, the second top-level on TimeInGame (read off the disc's dialogs with `loadDialog`). A command's
 * by-name lookup reaches the node the node search finds first, a shallower before a deeper (`findNode`,
 * FUN_00315d00 D:L215253).
 */

const face = textFace();
const build = (objects: ReturnType<typeof rec>[], uiVars: UiVarManager) => {
  const d = design([], objects);
  const screen = buildDialogScreen(d, { face: () => face });
  return { screen, set: WidgetSet.build(d, screen, { face: () => face, uiVars }) };
};
/** Every node named `name`, in the tree's order (children first at each level, as the screen adds them). */
const named = (root: UiNode, name: string): UiNode[] => {
  const out: UiNode[] = [];
  const walk = (n: UiNode): void => { for (const c of n.children) { if (c.name === name) out.push(c); walk(c); } };
  walk(root);
  return out;
};
const textOf = (n: UiNode): string | null => (n.content?.kind === 'text' ? String.fromCharCode(...n.content.text.codes) : null);
const wrappedOf = (n: UiNode): string | null =>
  (n.content?.kind === 'wrapped' ? n.content.lines.map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes))).join(' ').trim() : null);

describe('LATER 1546: plain widgets sharing a name each follow their own UIVAR (FUN_003792f0 D:L273072-273077)', () => {
  it('TEXT then TEXT: the second, on a UIVAR, prints it; the first keeps its caption (dlgExitState\'s PercentCntr)', () => {
    const uiVars = new UiVarManager();
    const { screen } = build([
      rec('PercentCntr', 'TEXT', 10, 10, r('CAPTION', '%')),
      rec('PercentCntr', 'TEXT', 50, 10, r('UIVAR', [r('NAME', 'TimeInGame')])),
    ], uiVars);
    uiVars.set(uiVars.add('TimeInGame', null, 2), { type: 'string', value: '12:34' });
    const [first, second] = named(screen.root, 'PercentCntr');
    expect([textOf(first!), textOf(second!)]).toEqual(['%', '12:34']);
  });

  it('TEXT then WRAPPEDTEXT (the PLAYER INFO page\'s bar_title on PLAYER_INFO_NAME_VAR): the name prints into the second', () => {
    const uiVars = new UiVarManager();
    const { screen } = build([
      rec('bar_title', 'TEXT', 30, 65, r('CAPTION', ' ')),
      rec('bar_title', 'WRAPPEDTEXT', 79, 68, r('WIDTH', '800', 'HEIGHT', '100', 'DISPLAY_ONE_LINE', [], 'UIVAR', [r('NAME', 'PLAYER_INFO_NAME_VAR')])),
    ], uiVars);
    uiVars.set(uiVars.add('PLAYER_INFO_NAME_VAR', null, 1), { type: 'string', value: 'Echo' });
    const [top, page] = named(screen.root, 'bar_title');
    expect(textOf(top!)).toBe(' ');
    expect(wrappedOf(page!)).toBe('Echo');
    expect(findNode(screen.root, 'bar_title')).toBe(top);              // a by-name command still reaches the first
  });

  it('a var set before the build shows in the second at once, as for a single widget (the set-up tells it)', () => {
    const uiVars = new UiVarManager();
    uiVars.set(uiVars.add('TimeInGame', null, 2), { type: 'string', value: '0:42' });
    const { screen } = build([
      rec('PercentCntr', 'TEXT', 10, 10, r('CAPTION', '%')),
      rec('PercentCntr', 'TEXT', 50, 10, r('UIVAR', [r('NAME', 'TimeInGame')])),
    ], uiVars);
    expect(named(screen.root, 'PercentCntr').map(textOf)).toEqual(['%', '0:42']);
  });

  it("dlgExitState's shape: the first PercentCntr nested (CHILDOF CPercent) on one var, the second top-level on another -- each prints its own; a by-name command reaches the top-level one", () => {
    const uiVars = new UiVarManager();
    const { screen, set } = build([
      rec('CPercent', 'IMAGE', 0, 0, r('FILENAME', 'a.tif', 'SIZE', ['4', '4'])),
      rec('PercentCntr', 'TEXT', 10, 10, r('UIVAR', [r('NAME', 'StatObjectivesPct')]), 'CHILDOF', 'CPercent'),
      rec('PercentCntr', 'TEXT', 505, 25, r('UIVAR', [r('NAME', 'TimeInGame')])),
    ], uiVars);
    uiVars.set(uiVars.add('StatObjectivesPct', null, 2), { type: 'string', value: '75' });
    uiVars.set(uiVars.add('TimeInGame', null, 2), { type: 'string', value: '3:21' });
    const nested = findNode(screen.root, 'CPercent')!.children.find((c) => c.name === 'PercentCntr')!;
    const top = findNode(screen.root, 'PercentCntr')!;                  // the node search: the shallower one
    expect(top).not.toBe(nested);
    expect([textOf(nested), textOf(top)]).toEqual(['75', '3:21']);
    set.nodeCommand(nodeCmd('PercentCntr', 1, 'X'), new RecordingHost());   // Caption, by name (FUN_0036fcc0)
    expect([textOf(nested), textOf(top)]).toEqual(['75', 'X']);
  });
});
