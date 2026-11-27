import { afterEach, describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { buildDialogScreen, findNode, setUiVarDisplayMask, setUiVarDisplayText, uiVarDisplayChanged, uiVarShownText, UiVarManager } from '../../src/index';
import { WidgetSet } from '../../src/widgets/index';
import { textFace } from './fixtures';
import { design, r, rec } from '../widgets/fixtures';

/**
 * STREAMER-P1 (OT.R152; product track, a browser adaptation): the page's display rule over a UI variable's printed text
 * (`../../src/text/displayText`). A TEXT or WRAPPEDTEXT that prints a variable the rule names draws the rule's words in
 * its place; the variable's value is unchanged. Unset, every widget prints its variable as the original does.
 */

const face = textFace();
const build = (objects: ReturnType<typeof rec>[], uiVars: UiVarManager) => {
  const d = design([], objects);
  const screen = buildDialogScreen(d, { face: () => face });
  return { screen, set: WidgetSet.build(d, screen, { face: () => face, uiVars }) };
};
const textOf = (screen: ReturnType<typeof build>['screen'], name: string): string | null => {
  const c = findNode(screen.root, name)?.content;
  return c?.kind === 'text' ? String.fromCharCode(...c.text.codes) : null;
};
const wrappedOf = (screen: ReturnType<typeof build>['screen'], name: string): string[] => {
  const c = findNode(screen.root, name)?.content;
  return c?.kind === 'wrapped' ? c.lines.map((l) => String.fromCharCode(...l.codes)) : [];
};
const text = (name: string, uivar: string) => rec(name, 'TEXT', 0, 0, r('UIVAR', [r('NAME', uivar)]));
const wrapped = (name: string, uivar: string, more: (string | RdrNode)[] = []) =>
  rec(name, 'WRAPPEDTEXT', 0, 40, r('CAPTION', ' ', 'WIDTH', '400', 'SPACING', '10', 'HEIGHT', '30', 'UIVAR', [r('NAME', uivar)], ...more));
const stringVar = (vars: UiVarManager, name: string, value: string): void => { vars.set(vars.add(name, null, 2), { type: 'string', value }); };

/** A rule as a page would give it: NAMEVAR draws "YOU", except the widget `entry_val`. */
const rule = (name: string, widget: string): string | null => (name.toUpperCase() === 'NAMEVAR' && widget !== 'entry_val' ? 'YOU' : null);

afterEach(() => setUiVarDisplayText(null));

describe('STREAMER-P1: the display rule over a UI variable\'s printed text', () => {
  it('unset: a TEXT and a WRAPPEDTEXT print the variable as before', () => {
    const vars = new UiVarManager();
    stringVar(vars, 'NAMEVAR', 'bob');
    const { screen } = build([text('t', 'NAMEVAR'), wrapped('w', 'NAMEVAR')], vars);
    expect(textOf(screen, 't')).toBe('bob');
    expect(wrappedOf(screen, 'w')).toEqual(['bob']);
    expect(uiVarShownText('NAMEVAR', 't', 'bob')).toBe('bob');
  });

  it('set: a TEXT and a WRAPPEDTEXT that print a named variable draw the rule\'s words; the value is unchanged', () => {
    setUiVarDisplayText(rule);
    const vars = new UiVarManager();
    stringVar(vars, 'NAMEVAR', 'bob');
    const { screen } = build([text('t', 'NAMEVAR'), wrapped('w', 'NAMEVAR'), text('other', 'GAMENAMEVAR')], vars);
    stringVar(vars, 'GAMENAMEVAR', 'g1');
    expect(textOf(screen, 't')).toBe('YOU');
    expect(wrappedOf(screen, 'w')).toEqual(['YOU']);
    expect(textOf(screen, 'other')).toBe('g1');                                     // a variable the rule does not name
    vars.set('NAMEVAR', { type: 'string', value: 'carol' });                         // each change drawn by the rule
    expect(textOf(screen, 't')).toBe('YOU');
    expect(vars.find('NAMEVAR')?.value).toEqual({ type: 'string', value: 'carol' });
  });

  it('set: the rule is asked per widget -- a widget it leaves (null) prints the variable as typed', () => {
    setUiVarDisplayText(rule);
    const vars = new UiVarManager();
    stringVar(vars, 'NAMEVAR', 'bob');
    const { screen } = build([text('shown', 'NAMEVAR'), text('entry_val', 'NAMEVAR')], vars);
    expect(textOf(screen, 'shown')).toBe('YOU');
    expect(textOf(screen, 'entry_val')).toBe('bob');
  });

  it('a rule that throws draws the text as given; no variable name draws as given', () => {
    setUiVarDisplayText(() => { throw new Error('x'); });
    expect(uiVarShownText('NAMEVAR', 't', 'bob')).toBe('bob');
    setUiVarDisplayText(rule);
    expect(uiVarShownText(null, 't', 'bob')).toBe('bob');
    expect(uiVarShownText('namevar', 't', 'bob')).toBe('YOU');
  });
});

describe("STREAMER-P1: the rule is told the dialog (the controller's F1 ruling: CREATE CLAN's clan name left as typed)", () => {
  const byDialog = (name: string, _w: string, dialog: string | null): string | null =>
    (name === 'CLANNAMEVAR' && dialog !== 'dlgCreateClan.rdr' ? 'Hidden' : null);
  it("the widget set and the build pass the dialog's name; none given is null", () => {
    setUiVarDisplayText(byDialog);
    const vars = new UiVarManager();
    stringVar(vars, 'CLANNAMEVAR', 'The Clan');
    const d = design([], [text('txtClanName', 'CLANNAMEVAR')]);
    const typed = buildDialogScreen(d, { face: () => face, dialog: 'dlgCreateClan.rdr' });
    WidgetSet.build(d, typed, { face: () => face, uiVars: vars, dialog: 'dlgCreateClan.rdr' });
    expect(textOf(typed, 'txtClanName')).toBe('The Clan');
    const other = buildDialogScreen(d, { face: () => face, dialog: 'dlgManageRoster.rdr' });
    WidgetSet.build(d, other, { face: () => face, uiVars: vars, dialog: 'dlgManageRoster.rdr' });
    expect(textOf(other, 'txtClanName')).toBe('Hidden');
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan')).toBe('Hidden');
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan', 'dlgCreateClan.rdr')).toBe('The Clan');
  });
});

describe("STREAMER-P1: a change of the page's rule redraws the open dialog (the controller's ruling (d), a live toggle)", () => {
  it('uiVarDisplayChanged() redraws a built TEXT and WRAPPEDTEXT with the rule as it is now; the value unchanged', () => {
    const vars = new UiVarManager();
    stringVar(vars, 'NAMEVAR', 'bob');
    const { screen } = build([text('t', 'NAMEVAR'), wrapped('w', 'NAMEVAR')], vars);
    expect(textOf(screen, 't')).toBe('bob');
    setUiVarDisplayText(rule);
    expect(textOf(screen, 't')).toBe('bob');                                         // nothing redraws by itself
    uiVarDisplayChanged();
    expect(textOf(screen, 't')).toBe('YOU');
    expect(wrappedOf(screen, 'w')).toEqual(['YOU']);
    setUiVarDisplayText(null);
    uiVarDisplayChanged();
    expect(textOf(screen, 't')).toBe('bob');
    expect(vars.find('NAMEVAR')?.value).toEqual({ type: 'string', value: 'bob' });
  });
  it('the asterisk mask follows the same redraw', () => {
    const vars = new UiVarManager();
    stringVar(vars, 'PW', 'abc');
    const { screen } = build([text('p', 'PW')], vars);
    setUiVarDisplayMask((n) => n === 'PW');
    uiVarDisplayChanged();
    expect(textOf(screen, 'p')).toBe('***');
    setUiVarDisplayMask(null);
    uiVarDisplayChanged();
    expect(textOf(screen, 'p')).toBe('abc');
  });
  it("a redraw runs no other listener of the var (a list's or a button's)", () => {
    const vars = new UiVarManager();
    stringVar(vars, 'NAMEVAR', 'bob');
    build([text('t', 'NAMEVAR')], vars);
    let told = 0;
    vars.attach('NAMEVAR', () => { told += 1; });
    uiVarDisplayChanged();
    expect(told).toBe(0);
  });
});

describe("STREAMER-P1: a redraw touches only a widget whose drawing the rule or mask changes (the glance's F1/F2)", () => {
  it('a TEXT the rule does not name keeps what a script drew over it; a named one is redrawn', () => {
    const vars = new UiVarManager();
    stringVar(vars, 'NAMEVAR', 'bob');
    stringVar(vars, 'GAMENAMEVAR', 'g1');
    const { screen } = build([text('t', 'NAMEVAR'), text('other', 'GAMENAMEVAR')], vars);
    const node = findNode(screen.root, 'other')!;
    if (node.content?.kind === 'text') node.content.text.codes = [...'SCRIPT'].map((c) => c.charCodeAt(0));   // a caption set by a script
    setUiVarDisplayText(rule);
    uiVarDisplayChanged();
    expect(textOf(screen, 't')).toBe('YOU');
    expect(textOf(screen, 'other')).toBe('SCRIPT');
    uiVarDisplayChanged();                                                           // the same answer again: nothing redrawn
    expect(textOf(screen, 'other')).toBe('SCRIPT');
  });
  it('a WRAPPEDTEXT the rule does not name is not rewrapped (its scroll kept)', () => {
    const vars = new UiVarManager();
    stringVar(vars, 'GAMENAMEVAR', 'g1');
    const { screen } = build([wrapped('w', 'GAMENAMEVAR', ['AUTOSCROLL'])], vars);
    const c = findNode(screen.root, 'w')!.content;
    if (c?.kind === 'wrapped') c.scroll = 3;
    setUiVarDisplayText(rule);
    uiVarDisplayChanged();
    const after = findNode(screen.root, 'w')!.content;
    expect(after?.kind === 'wrapped' ? after.scroll : -1).toBe(3);
  });
});
