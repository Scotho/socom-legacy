import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { optionsHtml } from '../../src/console/render/options';
import { createState, CATS, HOME_CATEGORY, homeItems, loadoutSideItems } from '../../src/console/state';
import { captureLauncher } from '../../src/console/history';

/**
 * The console launcher's grammar (the S2U Briefing design system's "Console launcher" prototype, `press(b)` per
 * context and `pressSignIn`; its components' READMEs: Crossbar, ActionList, RoomTable, OptionRows, OnScreenKeyboard,
 * SignInDialog, Confirm, ConsoleLegend). A browser adaptation with no original (the project's own launcher page,
 * OT.R28): the launched game's own flow is not touched. Run over the prototype's sample adapters.
 */
function setup() {
  const A = sampleAdapters();
  const S = createState(A);
  const host: Host & { render: ReturnType<typeof vi.fn>; announce: ReturnType<typeof vi.fn>; fit: ReturnType<typeof vi.fn> } = {
    render: vi.fn(), announce: vi.fn(), fit: vi.fn(),
  };
  const c = new ConsoleController(S, A, host);
  return { A, S, c, host };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('home: the crossbar and the action list', () => {
  it('the ordered category rail starts on Home, announces moves and clamps every direction at its ends', () => {
    const { S, c, host } = setup();
    expect(S.cat).toBe(HOME_CATEGORY);
    c.press('right'); expect(CATS[S.cat]!.id).toBe('online');
    expect(host.announce).toHaveBeenLastCalledWith('Online');
    c.press('r1'); expect(S.cat).toBe(CATS.length - 1);
    c.press('right'); c.press('r1'); expect(S.cat).toBe(CATS.length - 1);
    expect(host.announce).toHaveBeenLastCalledWith('Experiments');
    for (let i = 0; i < 9; i++) c.press('l1');
    expect(S.cat).toBe(0);
    c.press('left'); expect(S.cat).toBe(0);
    expect(host.announce).toHaveBeenLastCalledWith('Profile');
    expect(CATS.map((x) => x.label)).toEqual(['Profile', 'Settings', 'Home', 'Online', 'Experiments']);
  });

  it('up / down move the item within the category, clamped, and each category keeps its own', () => {
    const { S, c } = setup();
    c.press('down');
    expect(S.item[HOME_CATEGORY]).toBe(1);
    for (let i = 0; i < 5; i++) c.press('down');
    // Home has three since LR-37 (4): Play, Server status, Discord (LATER 291); was LR-13's four, with Memory card
    expect(S.item[HOME_CATEGORY]).toBe(2);
    c.press('left');
    expect(S.item[CATS.findIndex((x) => x.id === 'options')]).toBe(0);
    c.press('right');
    expect(S.item[HOME_CATEGORY]).toBe(2);
    c.press('up');
    expect(S.item[HOME_CATEGORY]).toBe(1);
  });

  it('Cross does the focused item\'s verb: Browse rooms pushes the rooms screen; an Options item opens its category', () => {
    const { S, c } = setup();
    c.press('right');
    c.press('cross');
    expect(S.screen).toBe('rooms');
    const t = setup();
    t.S.cat = CATS.findIndex((x) => x.id === 'options');
    t.c.press('down');
    // Launcher is the second Settings action and opens Controller.
    t.c.press('cross');
    expect(t.S.screen).toBe('options');
    expect(t.S.opt).toEqual({ cat: t.A.options.categories().findIndex((x) => x.id === 'controller'), row: 0, zone: 'rows' });
  });

  it('header Back on a Settings tab leaves in one press; Circle on a row focuses the tabs', () => {
    const { S, c } = setup();
    const at = CATS.findIndex((x) => x.id === 'options');
    S.cat = at;
    S.screen = 'options';
    S.opt = { cat: 1, row: 2, zone: 'rows' };
    c.pointer('press', { b: 'circle', fk: 'back' });
    expect(S.screen).toBe('home');
    expect(S.cat).toBe(at);
    const row = setup();
    row.S.screen = 'options';
    row.S.opt = { cat: 1, row: 2, zone: 'rows' };
    row.c.press('circle');
    expect(row.S.screen).toBe('options');
    expect(row.S.opt.zone).toBe('cats');
  });

  it('Cross on the microphone toggles it and says so; Square refreshes on Replays', async () => {
    const { S, A, c } = setup();
    // LR-23 (LR.R22): no panel under Play (was LR-13: Cross opened it on Deploy, Up was the microphone's row): the Microphone
    // step's act, the overlay's Microphone item's and Settings' "Use microphone in game" row's.
    c.doAct('mic');
    await vi.advanceTimersByTimeAsync(0);
    expect(A.mic.on()).toBe(true);
    expect(S.toast).toBe('Microphone on');
    c.press('r1');                                     // Play online
    c.press('square');
    await vi.advanceTimersByTimeAsync(0);
    expect(S.toast).toBe('Microphone on');             // Play online has no Square verb
    c.doAct('replays');
    c.press('square');
    await vi.advanceTimersByTimeAsync(0);
    expect(S.toast).toBe('Replays refreshed. None yet.');
  });

  it('Triangle is the account: Profile signed in; the sign-in dialog signed out', () => {
    const { S, A, c } = setup();
    c.press('triangle');
    const profile = CATS.findIndex((x) => x.id === 'profile');
    expect([S.screen, S.cat, S.item[profile]]).toEqual(['home', profile, 0]);
    c.flipState(1);
    expect(A.session.signedIn()).toBe(false);
    c.press('triangle');
    expect(S.overlay).toBe('signin');
    expect(S.si).toMatchObject({ zone: 'keys', persona: 0, kr: 1, kc: 4, text: '', shift: false, busy: false, error: '' });
  });

  it('CX-32: Play online’s Server opens the Server screen; Profile lists the loadouts; Settings keeps its id', async () => {
    const { S, A, c } = setup();
    expect(CATS.find((x) => x.id === 'options')!.label).toBe('Settings');
    expect(homeItems('options', S, A)[0]!.act).toBe('opt:display');
    c.doAct('opt:display');
    expect(optionsHtml(S, A)).toContain('>Settings<');
    expect(optionsHtml(S, A)).toContain('Display');
    S.screen = 'home';
    // LR-23 (LR.R22), LR-39 (LR.R32): no readout on any Home (was: `readoutHtml`'s "Ready to deploy", "On the server now").
    expect(homeItems('online', S, A).map((x) => x.title)).toEqual(['Browse rooms', 'Server Information', 'Signed in as SPECTER']);   // LR-37 (6, 7, 9)
    S.cat = CATS.findIndex((x) => x.id === 'online');  // LR-13: from Play online (Home's Server status comes back to Home)
    c.doAct('server');
    expect(S.screen).toBe('server');
    c.press('square');
    await vi.advanceTimersByTimeAsync(0);
    expect(S.toast).toBe('Server status refreshed');
    c.press('circle');
    expect([S.screen, CATS[S.cat]!.id, homeItems('online', S, A)[S.item[S.cat]!]!.act]).toEqual(['home', 'online', 'server']);
    expect(loadoutSideItems(A).map((x) => x.title)).toEqual(['SEAL', 'Terrorist']);
    c.flipState(1);
    expect(loadoutSideItems(A).map((x) => [x.disabled, x.sub])).toEqual([
      [undefined, 'Sign in to read your loadouts'],
      [undefined, 'Sign in to read your loadouts'],
    ]);
  });
});

describe('rooms: the lobby browser', () => {
  const toRooms = () => { const t = setup(); t.c.press('right'); t.c.press('cross'); return t; };

  it('Cross picks the focused room as the launch target, again clears it, and announces both', () => {
    const { S, c, host } = toRooms();
    expect(S.rooms.row).toBe(1);                         // the prototype opens on Bravo
    c.press('cross');
    expect(S.rooms.selected).toBe('Bravo');               // by id (slice 2)
    expect(host.announce).toHaveBeenLastCalledWith('Launch target: room Bravo');
    c.press('cross');
    expect(S.rooms.selected).toBeNull();
    expect(host.announce).toHaveBeenLastCalledWith('Launch target cleared');
  });

  it('a full room is refused with its toast and never picked', () => {
    const { S, c } = toRooms();
    c.press('up');
    c.press('cross');
    expect(S.rooms.selected).toBeNull();
    expect(S.toast).toBe('Room Alpha is full');
  });

  it('signed out, Cross opens the sign-in dialog instead of picking', () => {
    const { S, c } = toRooms();
    c.flipState(1);
    c.press('cross');
    expect(S.overlay).toBe('signin');
    expect(S.rooms.selected).toBeNull();
  });

  it('L2 / R2 cycle the filter and put focus on the first row; Circle returns to Play online', () => {
    const { S, c } = toRooms();
    c.press('r2');
    expect([S.rooms.filter, S.rooms.row]).toEqual([1, 0]);
    c.press('l2');
    c.press('l2');
    expect(S.rooms.filter).toBe(4);                      // wraps to Open slots
    c.press('circle');
    expect([S.screen, S.cat]).toEqual(['home', CATS.findIndex((x) => x.id === 'online')]);
  });

  it('Square refreshes the list and says so', async () => {
    const { S, c } = toRooms();
    c.press('square');
    await vi.advanceTimersByTimeAsync(0);
    expect(S.toast).toBe('Room list updated');
  });
});

describe('options: tabs, rollers and the aside', () => {
  const toOptions = () => { const t = setup(); t.c.doAct('opt:display'); return t; };

  it('left / right step the focused roller within its values; Square resets it with a toast', () => {
    const { S, A, c } = toOptions();
    expect(A.options.value('res')).toBe(2);
    c.press('right');
    c.press('right');
    c.press('right');
    expect(A.options.value('res')).toBe(3);              // clamped at 4x
    c.press('left');
    expect(A.options.value('res')).toBe(2);
    c.press('left');
    c.press('square');
    expect(A.options.value('res')).toBe(2);
    expect(S.toast).toBe('Internal resolution reset to 3× · 1080p');
  });

  it('Interface size refits the page at once', () => {
    const { S, A, c, host } = toOptions();
    S.opt.row = 5;
    c.press('right');
    expect(A.options.value('uiscale')).toBe(1);
    expect(host.fit).toHaveBeenCalled();
  });

  it('L1 / R1 change category from anywhere, wrapping', () => {
    const { S, c } = toOptions();
    c.press('l1');
    expect(S.opt).toMatchObject({ cat: 6, row: 0 });   // the last of the sample's seven (LR-5 F3 added Appearance)
    c.press('r1');
    expect(S.opt.cat).toBe(0);
  });

  it('Circle goes rows, then categories, then the crossbar with Options current and that category focused', () => {
    const { S, c } = toOptions();
    c.press('r1');
    c.press('circle');
    expect(S.opt.zone).toBe('cats');
    c.press('down');
    expect(S.opt.cat).toBe(2);
    c.press('circle');
    const options = CATS.findIndex((x) => x.id === 'options');
    // The sample's Controller tab (reached by Down) is the Launcher door, the second Settings item.
    expect([S.screen, S.cat, S.item[options]]).toEqual(['home', options, 1]);
  });

  it('left on an action row goes to the categories; Cross does the action', async () => {
    const { S, c } = toOptions();
    c.press('r1');
    c.press('r1');                                       // Controller
    S.opt.row = 3;                                       // Button mapping
    c.press('cross');
    await vi.advanceTimersByTimeAsync(0);
    expect(S.toast).toBe('Button mapping: not drawn in this prototype');
    c.press('left');
    expect(S.opt.zone).toBe('cats');
  });

  it('a row that needs sign-in is locked signed out: no step, and Cross opens the sign-in dialog', () => {
    const { S, A, c } = toOptions();
    c.flipState(1);
    c.doAct('opt:account');                              // Account
    c.press('right');
    expect(A.options.value('remember')).toBe(0);
    S.opt.row = 1;
    c.press('cross');
    expect(S.overlay).toBe('signin');
  });
});

describe('sign-in: the dialog and its on-screen keyboard', () => {
  const toSignIn = () => { const t = setup(); t.c.flipState(1); t.c.press('triangle'); return t; };

  it('walks the keys; down from row 3 lands on the wide key covering the column, up from it on columns 0, 2, 6, 8', () => {
    const { S, c } = toSignIn();
    c.press('down');
    c.press('down');
    expect([S.si.kr, S.si.kc]).toEqual([3, 4]);
    c.press('down');
    expect([S.si.kr, S.si.kc]).toEqual([4, 1]);          // Space spans columns 2-5
    c.press('right');
    c.press('right');
    c.press('right');
    expect(S.si.kc).toBe(3);                             // the wide row has four keys
    c.press('up');
    expect([S.si.kr, S.si.kc]).toEqual([3, 8]);
    S.si.kc = 1;
    c.press('down');
    expect(S.si.kc).toBe(0);
    c.press('up');
    expect([S.si.kr, S.si.kc]).toEqual([3, 0]);
    S.si.kc = 7;
    c.press('down');
    expect(S.si.kc).toBe(2);
    c.press('up');
    expect([S.si.kr, S.si.kc]).toEqual([3, 6]);          // Delete (wide column 2) up to column 6
    S.si.kc = 4;
    c.press('down');
    expect([S.si.kr, S.si.kc]).toEqual([4, 1]);
    c.press('up');
    expect([S.si.kr, S.si.kc]).toEqual([3, 2]);          // Space (wide column 1) up to column 2
    S.si.kc = 7;
    c.press('down');
    for (let i = 0; i < 4; i++) c.press('up');
    expect(S.si.kr).toBe(0);
    for (let i = 0; i < 12; i++) c.press('right');
    expect(S.si.kc).toBe(9);
    c.press('up');
    expect(S.si.zone).toBe('personas');
    c.press('right');
    expect(S.si.persona).toBe(1);
    c.press('down');
    expect([S.si.zone, S.si.kr, S.si.kc]).toEqual(['keys', 0, 0]);
  });

  it('Cross types the focused key; Square deletes, Triangle spaces, L2 shifts', () => {
    const { S, c } = toSignIn();
    c.press('cross');
    expect(S.si.text).toBe('t');
    c.press('l2');
    expect(S.si.shift).toBe(true);
    c.press('cross');
    expect(S.si.text).toBe('tT');
    c.press('square');
    expect(S.si.text).toBe('t');
    c.press('triangle');
    expect(S.si.text).toBe('t ');
  });

  it('R2 with no password says so in the field; with one it signs in, closes and toasts', async () => {
    const { S, A, c } = toSignIn();
    c.press('r2');
    expect(S.si.error).toBe('Enter the password for SPECTER.');
    c.press('cross');
    c.press('r2');
    expect(S.si.busy).toBe(true);
    c.press('circle');                                   // busy: nothing is read
    expect(S.overlay).toBe('signin');
    await vi.advanceTimersByTimeAsync(900);
    expect(A.session.signedIn()).toBe(true);
    expect(S.overlay).toBeNull();
    expect(S.toast).toBe('Signed in as SPECTER');
  });

  it('the Add new persona is refused in the prototype\'s words', () => {
    const { S, c } = toSignIn();
    S.si.persona = 1;
    c.press('r2');
    expect(S.si.error).toBe('Only SPECTER is on this memory card in the prototype.');
  });

  it('Options submits as R2 does (the pressSignIn of the prototype): START never arms, an empty password errors; Circle closes', () => {
    const { S, c } = toSignIn();
    c.press('options');
    expect(S.start).toBe('idle');
    expect(S.overlay).toBe('signin');
    expect(S.si.error).toBe('Enter the password for SPECTER.');
    c.press('circle');
    expect(S.overlay).toBeNull();
  });
});

describe('the confirm and states dialogs: Circle closes', () => {
  it('Circle cancels the sign-out confirm, signed in still', () => {
    const { S, A, c } = setup();
    c.doAct('signout');
    c.press('down');
    c.press('circle');
    expect(S.overlay).toBeNull();
    expect(A.session.signedIn()).toBe(true);
  });
  it('Circle closes the prototype states panel; Cross there flips the focused state', () => {
    const { S, A, c } = setup();
    c.pointer('states', {});
    expect(S.overlay).toBe('states');
    c.press('down');
    c.press('cross');
    expect(A.session.signedIn()).toBe(false);
    c.press('circle');
    expect(S.overlay).toBeNull();
  });
});

describe('confirm: sign out', () => {
  it('No comes first and is focused; Cross on Yes signs out and clears the launch target', async () => {
    const { S, A, c } = setup();
    c.press('right');
    c.press('cross');
    c.press('cross');
    expect(S.rooms.selected).toBe('Bravo');               // by id (slice 2)
    c.doAct('signout');
    expect([S.overlay, S.confirmRow]).toEqual(['confirm', 0]);
    c.press('cross');
    expect(S.overlay).toBeNull();
    expect(A.session.signedIn()).toBe(true);
    c.doAct('signout');
    c.press('down');
    c.press('cross');
    await vi.advanceTimersByTimeAsync(0);
    expect(A.session.signedIn()).toBe(false);
    expect(S.rooms.selected).toBeNull();
    // LR-20 (4) (pass 2's Q8, `cfedd8775`): signed out from the launcher page, the Signed out resting screen is the message
    // and no toast is drawn over it (the artifact shows none); over a game the toast stays (`grammar.ts` restSignedOut).
    expect(S.overlay).toBe('signedout');
    expect(S.toast).toBe('');
  });
});

describe('START: the OPTIONS button from anywhere', () => {
  it('blocked without the disc: the legend\'s one warn line, cleared after 3.6 s', () => {
    const { S, c } = setup();
    c.flipState(0);
    c.press('options');
    expect(S.legendError).toBe('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
    expect(S.start).toBe('idle');
    vi.advanceTimersByTime(3600);
    expect(S.legendError).toBe('');
  });

  it('blocked while the disc is being read, in its own words', () => {
    const { S, A, c } = setup();
    c.flipState(0);
    c.press('cross');                                    // LR-13: Play, its panel on the disc check
    c.press('cross');                                    // Choose disc
    expect(A.disc.state()).toBe('reading');
    c.press('options');
    expect(S.legendError).toBe('Your disc is still being read.');
  });

  it('with the disc: arms, then the launch screen after 360 ms; Circle there returns to the launcher', async () => {
    const { S, c } = setup();
    c.press('options');
    expect(S.start).toBe('arming');
    await vi.advanceTimersByTimeAsync(360);
    expect([S.start, S.overlay]).toEqual(['launching', 'launch']);
    c.press('circle');
    expect([S.start, S.overlay]).toEqual(['idle', null]);
  });

  it('choosing a disc reads it, then says so', async () => {
    const { S, A, c } = setup();
    c.flipState(0);
    c.press('cross');                                    // LR-13: Play, its panel on the disc check
    c.press('cross');
    await vi.advanceTimersByTimeAsync(1200);
    expect(A.disc.state()).toBe('ready');
    expect(S.toast).toBe('Disc ready: SOCOM II');
  });
});

/**
 * CX-12 (the design's controls page names it; CX-11's lists scroll): L2 / R2 page a list taller than its pane -- the
 * focused row moves the pane's height in rows (the host's `page`, measured by `../../src/console/render/frame`
 * `pageRows`; null when the list fits), clamped at the ends, and the render keeps it in view as any move. A screen's own
 * L2 / R2 stay its own (Browse rooms' filter roller; the dialogs' Shift and Done); where the list fits, L2 / R2 do what
 * they did. A move calls the menu-move cue as any focus move does (CX-20). A browser adaptation with no original (OT.R28).
 */
describe('CX-12: L2 / R2 page a list taller than its pane', () => {
  function paged(rows: number | null) {
    const t = setup();
    (t.host as Host).page = () => rows;
    return t;
  }

  it('Options: R2 moves the focused row a page down, L2 a page up, clamped at the ends', () => {
    const { S, c } = paged(3);
    S.screen = 'options';
    S.opt = { cat: 0, row: 0, zone: 'rows' };                             // Display: seven rollers
    c.press('r2');
    expect(S.opt.row).toBe(3);
    c.press('r2');
    expect(S.opt.row).toBe(6);
    c.press('r2');
    expect(S.opt.row).toBe(6);
    c.press('l2');
    expect(S.opt.row).toBe(3);
    c.press('l2');
    c.press('l2');
    expect(S.opt.row).toBe(0);
    expect(S.opt.cat).toBe(0);
  });

  it('a list that fits its pane (no page): L2 / R2 move nothing', () => {
    const { S, c } = paged(null);
    S.screen = 'options';
    S.opt = { cat: 0, row: 2, zone: 'rows' };
    c.press('r2');
    c.press('l2');
    expect(S.opt).toEqual({ cat: 0, row: 2, zone: 'rows' });
  });

  it('Options\' tabs (the categories zone) are not paged', () => {
    const { S, c } = paged(3);
    S.screen = 'options';
    S.opt = { cat: 1, row: 0, zone: 'cats' };
    c.press('r2');
    expect(S.opt).toEqual({ cat: 1, row: 0, zone: 'cats' });
  });

  it('Browse rooms keeps L2 / R2 as its filter roller, even when its table overflows', () => {
    const { S, A, c } = paged(3);
    S.screen = 'rooms';
    S.rooms.row = 2;
    c.press('r2');
    expect(S.rooms.filter).toBe(1);
    expect(S.rooms.row).toBe(0);
    c.press('l2');
    expect(S.rooms.filter).toBe(0);
    expect(A.rooms.filters().length).toBeGreaterThan(1);
  });

  it('the replays list pages; the page down stops on the last row (the down press there asks for more, not R2)', () => {
    const { S, A, c } = paged(5);
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, map: 'Crossroads', rules: 'Suppression', when: '2026-10-11 20:00', length: '12:00', players: 8, names: 'A, B' }));
    let asked = 0;
    A.replays.view = () => ({ kind: 'ok', entries, more: { kind: 'idle' } });
    A.replays.more = async () => { asked++; };
    S.screen = 'replays';
    S.rp.row = 0;
    c.press('r2');
    expect(S.rp.row).toBe(5);
    c.press('r2');
    c.press('r2');
    expect(S.rp.row).toBe(11);
    expect(asked).toBe(0);
    c.press('l2');
    expect(S.rp.row).toBe(6);
  });

  it('a Home category\'s actions page too', () => {
    const { S, A, c } = paged(2);
    expect(S.screen).toBe('home');
    expect(homeItems(CATS[S.cat]!.id, S, A).length).toBeGreaterThanOrEqual(3);
    S.item[S.cat] = 0;
    c.press('r2');
    expect(S.item[S.cat]).toBe(2);
    expect(S.cat).toBe(HOME_CATEGORY);
    c.press('l2');
    expect(S.item[S.cat]).toBe(0);
  });

  it('a page that moves the focus calls the menu-move cue once; one clamped at an end does not', () => {
    const { S, A, c } = paged(3);
    const selection = vi.fn();
    A.cue = { selection };
    S.screen = 'options';
    S.opt = { cat: 0, row: 0, zone: 'rows' };
    c.press('l2');
    expect(selection).not.toHaveBeenCalled();
    c.press('r2');
    expect(selection).toHaveBeenCalledTimes(1);
  });

  it('a dialog keeps its own L2 / R2: the sign-in\'s Shift', () => {
    const { S, c } = paged(3);
    c.openSignIn();
    c.press('l2');
    expect(S.si.shift).toBe(true);
  });
});

/**
 * CX-51 (the owner, 2026-10-21: "make mouse clicks trigger the same audio effects as controller on launcher as well"): a
 * click that moves the focus -- to another category, item, row or tab -- plays the menu-move cue a pad's move plays
 * (CX-20); a click that also acts plays only its act's cue (open, confirm, toggle, error), never the move on top; a click
 * on what is focused already that does nothing plays nothing, and a hover plays nothing. A browser adaptation (OT.R28).
 */
describe('CX-51: a click plays the cue the pad would, once', () => {
  function cued() {
    const t = setup();
    const played: string[] = [];
    t.A.cue = { selection: () => { played.push('move'); }, play: (c) => { played.push(c); } };
    return { ...t, played };
  }
  const onCat = (S: ReturnType<typeof setup>['S'], id: string): number => { S.cat = CATS.findIndex((x) => x.id === id); return S.cat; };

  it('a click on another category plays the move cue, once', () => {
    const { S, c, played } = cued();
    c.pointer('cat', { i: '3' });
    expect(S.cat).toBe(3);
    expect(played).toEqual(['move']);
  });

  it('a click on another Home item that only focuses it plays the move cue, once', () => {
    const { S, A, c, played } = cued();
    const at = onCat(S, 'profile');
    const items = homeItems('profile', S, A);
    const gap = items.findIndex((x, i) => i > 0 && x.act.startsWith('todo:'));   // the sample's Profiles: "Coming" (LR-37: Online has no gap now)
    expect(gap).toBeGreaterThan(0);
    S.item[at] = 0;
    c.pointer('item', { i: String(gap) });
    expect(S.item[at]).toBe(gap);
    expect(S.screen).toBe('home');
    expect(played).toEqual(['move']);
  });

  it('a click on another room row or option row plays the move cue, once', () => {
    const room = cued();
    room.S.screen = 'rooms';
    room.S.rooms.row = 0;
    room.c.pointer('room', { i: '1' });
    expect([room.S.screen, room.S.overlay, room.S.rooms.row]).toEqual(['rooms', null, 1]);
    expect(room.played).toEqual(['move']);
    const opt = cued();
    opt.S.screen = 'options';
    opt.S.opt = { cat: 0, row: 0, zone: 'rows' };
    opt.c.pointer('optrow', { i: '2' });
    expect(opt.S.opt.row).toBe(2);
    expect(opt.played).toEqual(['move']);
    const tab = cued();
    tab.S.screen = 'options';
    tab.S.opt = { cat: 0, row: 3, zone: 'rows' };
    tab.c.pointer('optcat', { i: '1' });
    expect(tab.S.opt).toEqual({ cat: 1, row: 0, zone: 'rows' });
    expect(tab.played).toEqual(['move']);
  });

  it('a click that moves the focus and opens a page or a dialog plays only that act\'s cue', () => {
    const page = cued();
    const at = onCat(page.S, 'online');
    page.S.item[at] = 2;
    page.c.pointer('item', { i: '0' });                                  // Browse rooms
    expect(page.S.screen).toBe('rooms');
    expect(page.played).toEqual(['confirm']);
    const dialog = cued();
    dialog.c.flipState(1);                                               // the sample signed out
    expect(dialog.A.session.signedIn()).toBe(false);
    const on = onCat(dialog.S, 'online');
    dialog.S.item[on] = 0;
    const signIn = homeItems('online', dialog.S, dialog.A).findIndex((x) => x.act === 'signin');
    dialog.c.pointer('item', { i: String(signIn) });
    expect(dialog.S.overlay).toBe('signin');
    expect(dialog.played).toEqual(['open']);
  });

  it('a click its branch routes through Cross plays one cue in all, not the move on top', () => {
    const row = cued();
    const entries = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, map: 'Crossroads', rules: 'Suppression', when: '2026-10-11 20:00', length: '12:00', players: 8, names: 'A, B' }));
    row.A.replays.view = () => ({ kind: 'ok', entries, more: { kind: 'idle' } });
    row.S.screen = 'replays';
    row.S.rp.row = 0;
    // With no watch the row's Cross does nothing: the click is the pad's move then a silent Cross -- the move, once.
    row.c.pointer('replay', { i: '2' });
    expect(row.S.rp.row).toBe(2);
    expect(row.played).toEqual(['move']);
    // With one, Cross opens the viewer over the list: its open, and not the move on top.
    row.played.length = 0;
    const viewer = { press: () => {}, close: () => {}, locked: () => false, lock: () => {} } as unknown as NonNullable<ReturnType<NonNullable<typeof row.A.replays.watch>>>;
    row.A.replays.watch = () => viewer;
    row.A.replays.watching = () => viewer;                               // the draw's `syncViewer` keeps it open
    row.c.pointer('replay', { i: '1' });
    expect([row.S.rp.row, row.S.overlay]).toEqual([1, 'viewer']);
    expect(row.played).toEqual(['open']);
    const yes = cued();
    yes.S.overlay = 'confirm';
    yes.S.confirmKind = 'signout';
    yes.S.confirmRow = 0;
    yes.c.pointer('confirm', { i: '1' });
    expect(yes.played).toHaveLength(1);
    expect(yes.played).not.toContain('move');
  });

  it('a click on what is focused already that does nothing plays nothing', () => {
    const { S, A, c, played } = cued();
    c.pointer('cat', { i: String(S.cat) });
    const at = onCat(S, 'profile');                                      // LR-37 (9): Profile's Coming row (Online has none now)
    const gap = homeItems('profile', S, A).findIndex((x, i) => i > 0 && x.act.startsWith('todo:'));
    S.item[at] = gap;
    c.pointer('item', { i: String(gap) });
    expect(played).toEqual([]);
  });

  it('a click doing what a silent pad press does stays silent: the account\'s Profile, a room filter, the source dropdown', () => {
    const acct = cued();
    acct.S.item[HOME_CATEGORY] = 2;
    acct.c.pointer('account', {});                                       // signed in: Triangle's jump to Profile
    expect(acct.S.cat).toBe(CATS.findIndex((x) => x.id === 'profile'));
    expect(acct.played).toEqual([]);
    const pad = cued();
    pad.S.item[HOME_CATEGORY] = 2;
    pad.c.press('triangle');
    expect(pad.S.cat).toBe(acct.S.cat);
    expect(pad.played).toEqual([]);                                      // the pad's Triangle there: silent
    const filter = cued();
    filter.S.screen = 'rooms';
    filter.S.rooms.row = 2;
    filter.c.pointer('filter', { i: '1' });                              // L2 / R2's roller (no tab sound, CX.R12)
    expect([filter.S.rooms.filter, filter.S.rooms.row]).toEqual([1, 0]);
    expect(filter.played).toEqual([]);
    const src = cued();
                                                                          // LR-23: the cog is the legend chip's (was: Play's panel, on its disc check)
    src.c.pointer('srcbtn', {});                                         // Square on Disc: the dropdown opens
    expect(src.S.src.open).toBe(true);
    src.c.pointer('srcopt', { i: String(src.S.src.row) });               // Cross on the focused option
    expect(src.S.src.open).toBe(false);
    // LR-37 (2; the owner: "Re-add the menu sounds ... across the whole launcher UI"): the source menu is a drop-up as the
    // theme's: its opening says open and a pick confirm (was: silent, CX-51).
    expect(src.played).toEqual(['open', 'confirm']);
    src.c.pointer('srcbtn', {});
    src.c.pointer('srcopt', { i: String(1 - src.S.src.row) });           // another option: the pick's cue (was: the move to it)
    expect(src.played).toEqual(['open', 'confirm', 'open', 'confirm']);
  });

  it('a hover moves the focus in silence', () => {
    const { S, c, played } = cued();
    S.input = 'pointer';
    c.hover('item', 2);
    expect(S.item[S.cat]).toBe(2);
    S.screen = 'options';
    S.opt = { cat: 0, row: 0, zone: 'rows' };
    c.hover('optrow', 3);
    expect(S.opt.row).toBe(3);
    expect(played).toEqual([]);
  });

  it('a click that steps a setting on another row, or ticks Remember me, plays only the toggle', () => {
    const step = cued();
    step.S.screen = 'options';
    step.S.opt = { cat: 0, row: 0, zone: 'rows' };
    const row = optionsRow(step);
    const had = step.A.options.value(row.id);
    step.c.pointer('optstep', { i: '2', d: had < row.values!.length - 1 ? '1' : '-1' });
    expect(step.S.opt.row).toBe(2);
    expect(step.A.options.value(row.id)).not.toBe(had);
    expect(step.played).toEqual(['toggle']);
    const tick = cued();
    tick.A.session.remembers = () => true;
    tick.c.openSignIn();
    tick.played.length = 0;
    const was = tick.S.si.remember;
    tick.c.pointer('remember', {});
    expect(tick.S.si.remember).toBe(!was);
    expect(tick.played).toEqual(['toggle']);
  });

  // The review's F1: in pointer mode the page's `mouseover` calls `hover` before the click (`../../src/console/input`),
  // moving the focus in silence; the click then carries that move.
  it('a hover then a click on the same row plays the move, once (items, rooms, option rows)', () => {
    const item = cued();
    item.S.input = 'pointer';
    const at = onCat(item.S, 'profile');                                 // LR-37 (9): Online has no Coming row now; Profile's Profiles is
    const gap = homeItems('profile', item.S, item.A).findIndex((x, i) => i > 0 && x.act.startsWith('todo:'));
    item.S.item[at] = 0;
    item.c.hover('item', gap);
    expect(item.played).toEqual([]);
    item.c.pointer('item', { i: String(gap) });
    expect(item.played).toEqual(['move']);
    const room = cued();
    room.S.input = 'pointer';
    room.S.screen = 'rooms';
    room.S.rooms.row = 0;
    room.c.hover('room', 1);
    room.c.pointer('room', { i: '1' });
    expect(room.played).toEqual(['move']);
    const opt = cued();
    opt.S.input = 'pointer';
    opt.S.screen = 'options';
    opt.S.opt = { cat: 0, row: 0, zone: 'rows' };
    opt.c.hover('optrow', 2);
    opt.c.pointer('optrow', { i: '2' });
    expect(opt.played).toEqual(['move']);
  });

  it('a hover then a click that opens a page plays only the page\'s cue', () => {
    const { S, c, played } = cued();
    S.input = 'pointer';
    const at = onCat(S, 'online');
    S.item[at] = 2;
    c.hover('item', 0);                                                  // Browse rooms
    c.pointer('item', { i: '0' });
    expect(S.screen).toBe('rooms');
    expect(played).toEqual(['confirm']);
  });

  it('a hover over one row then another, then a click on the second: one move; a hover back where it began: none', () => {
    const t = cued();
    t.S.input = 'pointer';
    t.S.screen = 'rooms';
    t.S.rooms.row = 0;
    t.c.hover('room', 1);
    t.c.hover('room', 2);
    t.c.pointer('room', { i: '2' });
    expect(t.played).toEqual(['move']);
    const back = cued();
    back.S.input = 'pointer';
    back.S.screen = 'options';
    back.S.opt = { cat: 0, row: 0, zone: 'rows' };
    back.c.hover('optrow', 2);
    back.c.hover('optrow', 0);
    back.c.pointer('optrow', { i: '0' });
    expect(back.played).toEqual([]);
  });

  it('a pad press after a hover takes the hover\'s move: the click after it adds none', () => {
    const { S, A, c, played } = cued();
    S.input = 'pointer';
    const at = onCat(S, 'profile');                                      // LR-37 (9): Profile's Coming row (Online has none now)
    const gap = homeItems('profile', S, A).findIndex((x, i) => i > 0 && x.act.startsWith('todo:'));
    S.item[at] = 0;
    c.hover('item', gap - 1);
    c.press('down');                                                     // the pad's own move, its own cue
    expect(S.item[at]).toBe(gap);
    expect(played).toEqual(['move']);
    c.pointer('item', { i: String(gap) });
    expect(played).toEqual(['move']);
  });

  // The review's F2: Cross on a focused item whose act jumps to Profile is silent on the pad (as the account's button).
  // LR-39 (LR.R32): no Home row jumps to Profile any more -- the Memory card left the page's Home (LR-37 (4)) and the
  // overlay's (LR-39) -- so the jump is read on Online's Signed in item, in both modes (was: the overlay's Memory card).
  it('a click on the focused Signed in item jumps to Profile in silence; the pad\'s Cross too; from another item, the move', () => {
    const profile = CATS.findIndex((x) => x.id === 'profile');
    for (const mode of ['page', 'overlay'] as const) {
      const acct = cued();
      acct.S.mode = mode;
      const at = onCat(acct.S, 'online');
      const signedIn = homeItems('online', acct.S, acct.A).findIndex((x) => x.title.startsWith('Signed in as'));
      expect(signedIn).toBeGreaterThanOrEqual(0);
      acct.S.item[at] = signedIn;
      acct.c.pointer('item', { i: String(signedIn) });
      expect(acct.S.cat, mode).toBe(profile);
      expect(acct.played, mode).toEqual([]);
      const pad = cued();
      pad.S.mode = mode;
      pad.S.item[onCat(pad.S, 'online')] = signedIn;
      pad.c.press('cross');
      expect([pad.S.cat, pad.played], mode).toEqual([profile, []]);       // the pad's Cross there: silent
      const other = cued();
      other.S.mode = mode;
      other.S.item[onCat(other.S, 'online')] = 0;
      other.c.pointer('item', { i: String(signedIn) });                   // the move to it, then the silent jump
      expect(other.S.cat, mode).toBe(profile);
      expect(other.played, mode).toEqual(['move']);
    }
  });

  // The re-review's L1: a hover's move does not outlive the page it was made on (the browser's Back, `applySnap`).
  // LR-39 (LR.R32): read on Online's Signed in item (was: the overlay's Memory card, gone from every Home).
  it('a hover, then the browser\'s Back, then a click on the focused Signed in item: no stray move', () => {
    const { S, A, c, played } = cued();
    S.input = 'pointer';
    const online = onCat(S, 'online');
    const signedIn = homeItems('online', S, A).findIndex((x) => x.title.startsWith('Signed in as'));
    S.item[online] = signedIn;
    const home = captureLauncher(S, A);
    c.pointer('item', { i: '0' });                                       // Browse rooms
    expect(S.screen).toBe('rooms');
    c.hover('room', 3);
    played.length = 0;
    c.applySnap(home);                                                   // Back: Online, the Signed in item focused
    expect([S.screen, S.cat, S.item[online]]).toEqual(['home', online, signedIn]);
    c.pointer('item', { i: String(signedIn) });
    expect(S.cat).toBe(CATS.findIndex((x) => x.id === 'profile'));
    expect(played).toEqual([]);
  });

  // The re-review's L2: the current Settings tab clicked from a row below it puts the focus on its first row -- a move.
  it('a click on the current Settings tab from a row below plays the move; on it with the focus on its first row, none', () => {
    const { S, c, played } = cued();
    S.screen = 'options';
    S.opt = { cat: 1, row: 2, zone: 'rows' };
    c.pointer('optcat', { i: '1' });
    expect(S.opt).toEqual({ cat: 1, row: 0, zone: 'rows' });
    expect(played).toEqual(['move']);
    c.pointer('optcat', { i: '1' });
    expect(played).toEqual(['move']);
  });

  function optionsRow(t: ReturnType<typeof setup>) {
    const cat = t.A.options.categories()[0]!;
    const row = cat.rows[2]!;
    expect(row.values?.length ?? 0).toBeGreaterThan(1);
    return row as typeof row & { values: readonly string[] };
  }
});
