import { describe, expect, it } from 'vitest';
import { CHAT_HOLD_SECONDS, CHAT_REPEAT_SECONDS, rootEnabled, SPECTATORS_ROOT, TauntMenu, type ChatEntry, type ChatRole } from '../src/tauntMenu';
import type { PadButton } from '../src/gamepad';
/** A TEAMMATES row (`./matchChat`'s shape): a teammate's name over his two rows. */
const TEAMMATE: ChatEntry[] = [{ label: 'kilo', help: 'Player 1', children: [{ label: 'MUTE OFF', help: 'Mute (On, Off)', key: 'mute:3', action: () => {} }] }];
describe('original Chat Menu controller path', () => {
  const rig = () => {
    const sent: unknown[] = [], sounds: string[] = [];
    const m = new TauntMenu({ send: c => sent.push(c), sound: s => sounds.push(s), unsupported: () => {}, custom: () => ['one', 'two', 'three', 'four', 'five'] });
    const step = (t: number, names: PadButton[], gate = true) => m.frame(t, new Set(names), gate);
    return { m, step, sent, sounds };
  };
  it('opens on Circle release; a hold belongs to voice and never opens on release', () => {
    const { m, step } = rig();
    step(0, ['Circle']); expect(m.isOpen()).toBe(false);
    step(.31, ['Circle']); step(.4, []); expect(m.isOpen()).toBe(false);
    step(.5, ['Circle']); step(.6, []); expect(m.isOpen()).toBe(true);
  });
  it('rejects a Circle release beyond the hold threshold without an intermediate held frame', () => {
    const { m, step, sent } = rig();
    step(0, ['Circle']);
    step(CHAT_HOLD_SECONDS + .001, []);
    expect(m.isOpen()).toBe(false);
    expect(sent).toEqual([]);
  });
  it('repeats a held direction at native 0.2 seconds and confirms once', () => {
    const { m, step, sent } = rig();
    step(0, ['Circle']); step(.1, []);
    step(.2, ['Down']); expect(m.state().root).toBe(1);
    step(.3, ['Down']); expect(m.state().root).toBe(1);
    step(.41, ['Down']); expect(m.state().root).toBe(2);
    step(.5, []); step(.65, ['Up']); step(.7, []); step(.9, ['Cross']);
    expect(m.state().depth).toBe(1);
    step(1, []); step(1.1, ['Cross']); step(1.2, ['Cross']);
    expect(sent).toEqual([{ kind: 'vocal' }]);
    expect(m.isOpen()).toBe(false);
  });
  it('drops a Triangle release inside the repeat gate; idle does not defer the cancel', () => {
    const { m, step, sent } = rig();
    step(0, ['Circle']); step(.1, []);
    step(.2, ['Down']); step(.45, ['Down']); step(.46, []);
    step(.5, ['Triangle']); step(.51, []);
    expect(m.isOpen()).toBe(true);
    step(.7, []); expect(m.isOpen()).toBe(true);
    step(.8, ['Triangle']); step(.81, []); expect(m.isOpen()).toBe(false);
    step(.9, []); expect(m.isOpen()).toBe(false); expect(sent).toEqual([]);
  });
  it('the browser cancel sequence closes after a held directional repeat', () => {
    const { m, step, sent } = rig();
    step(0, ['Circle']); step(.1, []);
    step(.2, ['Down']); step(.45, ['Down']); step(.46, []);
    const cancelAt = .46 + CHAT_REPEAT_SECONDS;
    step(cancelAt, ['Triangle']); step(cancelAt + .01, []);
    expect(m.isOpen()).toBe(false); expect(sent).toEqual([]);
  });
  it('navigates remaining roots, repeats in nested menus and returns to the selected parent',()=>{
    const sent:string[]=[],blocked:string[]=[];
    const m=new TauntMenu({send:()=>{},custom:()=>[],sound:()=>{},unsupported:s=>blocked.push(s),entries:root=>[
      {label:'entry',help:'help',key:String(root),action:()=>sent.push(String(root))},
      {label:'nested',help:'help',children:[{label:'unavailable',help:'help',unsupported:'dependency'},{label:'other',help:'help',unsupported:'dependency'}]},
    ]});
    let t=0;const step=(held:PadButton[])=>m.frame(t+=.25,new Set(held),true);
    const press=(b:PadButton)=>{step([b]);step([]);};
    // Every root giving rows, SPECTATORS (5) is drawn too, between TEAMMATES and MESSAGES (SVC-23f): [downs, root].
    for(const [downs,root] of [[0,0],[2,2],[3,3],[4,5],[5,4]] as const){
      press('Circle');for(let i=0;i<downs;i++)press('Down');expect(m.state().root).toBe(root);
      press('Cross');press('Down');press('Cross');expect(m.state().depth).toBe(2);
      step(['Down']);step(['Down']);expect(m.state().row).toBe(0);step([]);
      press('Cross');expect(blocked.at(-1)).toBe('dependency');expect(m.isOpen()).toBe(true);
      press('Triangle');expect(m.state().depth).toBe(1);expect(m.state().row).toBe(1);
      press('Up');press('Cross');expect(m.isOpen()).toBe(false);
    }
    expect(sent).toEqual(['0','2','3','5','4']);
  });
  it('SVC-23f: SPECTATORS is drawn only while its rows are there (FUN_00231a30 D:L82568-82582), in its place in the tree', () => {
    let rows: ChatEntry[] = [];
    const sent: string[] = [];
    // AD-10: TEAMMATES is drawn by its rows too (no predicate, D:L83793), so the rig gives it a teammate's row.
    const m = new TauntMenu({ send: () => {}, custom: () => [], sound: () => {}, unsupported: () => {}, entries: (root) => (root === SPECTATORS_ROOT ? rows : root === 3 ? TEAMMATE : []) });
    let t = 0; const step = (held: PadButton[]) => m.frame(t += .25, new Set(held), true);
    const press = (b: PadButton) => { step([b]); step([]); };
    press('Circle');
    expect(m.state().roots).toEqual([0, 1, 2, 3, 4]);
    for (let i = 0; i < 4; i++) press('Down');
    expect(m.state().root).toBe(4);                               // MESSAGES fifth: no SPECTATORS drawn
    press('Down'); expect(m.state().root).toBe(0);                // and the walk wraps past it
    rows = [{ label: 'VOTE ALL REMOVE', help: 'Vote to Retain or Remove all players', key: 'voteAll', action: () => sent.push('voteAll') }];
    expect(m.state().roots).toEqual([0, 1, 2, 3, SPECTATORS_ROOT, 4]);
    press('Up'); expect(m.state().root).toBe(4);
    press('Up'); expect(m.state().root).toBe(SPECTATORS_ROOT);
    press('Cross');
    expect([m.state().depth, m.state().columns[0]!.rows.map((r) => r.label)]).toEqual([1, ['VOTE ALL REMOVE']]);
    press('Cross');
    expect([sent, m.isOpen()]).toEqual([['voteAll'], false]);
  });
  it('SVC-23f: the last spectator gone while SPECTATORS is selected or open -- the TCM closes as Triangle at the top closes it (FUN_00231690 D:L82467-82469: FUN_00232890 then FUN_00235300(.., 0))', () => {
    for (const depth of [0, 1]) {
      let rows: ChatEntry[] = [{ label: 'VOTE ALL REMOVE', help: 'h', key: 'voteAll', action: () => {} }];
      const sent: unknown[] = [];
      const m = new TauntMenu({ send: (c) => { sent.push(c); }, custom: () => [], sound: () => {}, unsupported: () => {}, entries: (root) => (root === SPECTATORS_ROOT ? rows : root === 3 ? TEAMMATE : []) });
      let t = 0; const step = (held: PadButton[]) => m.frame(t += .25, new Set(held), true);
      const press = (b: PadButton) => { step([b]); step([]); };
      press('Circle'); for (let i = 0; i < 4; i++) press('Down'); if (depth) press('Cross');
      expect([m.state().root, m.state().depth], `depth ${depth}`).toEqual([SPECTATORS_ROOT, depth]);
      rows = [];
      step([]);
      expect([m.isOpen(), m.state().depth, m.state().columns, sent], `depth ${depth}`).toEqual([false, 0, [], []]);
      // The reopen held off as after Triangle's close (CHAT_HOLD_SECONDS): a Circle tap at once opens nothing.
      m.frame(t + .05, new Set(['Circle']), true); m.frame(t + .1, new Set(), true);
      expect(m.isOpen(), `depth ${depth}`).toBe(false);
      m.frame(t + .5, new Set(['Circle']), true); m.frame(t + .6, new Set(), true);
      expect(m.isOpen(), `depth ${depth}`).toBe(true);
    }
  });
  it('a refused gate (out of a match, another screen over it) opens nothing; a round reset drops a menu without sending', () => {
    const { m, step, sent } = rig();
    step(0, ['Circle'], false); step(.1, [], false); expect(m.isOpen()).toBe(false);
    step(.2, ['Circle']); step(.3, []); m.reset(); step(.4, ['Cross']);
    expect(sent).toEqual([]); expect(m.isOpen()).toBe(false);
  });
  it('backs out one level and delays reopening for 0.3 seconds', () => {
    const { m, step, sent } = rig();
    step(0, ['Circle']); step(.1, []); step(.2, ['Down']); step(.45, []); step(.5, ['Cross']); step(.6, []);
    step(.7, ['Triangle']); step(.8, []); expect(m.state().depth).toBe(0);
    step(.9, ['Triangle']); step(1, []); expect(m.isOpen()).toBe(false);
    step(1.05, ['Circle']); step(1.1, []); expect(m.isOpen()).toBe(false);
    step(1.4, ['Circle']); step(1.5, []); expect(m.isOpen()).toBe(true); expect(sent).toEqual([]);
  });
  it("the preset's TeamCommand button (Goldeneye's Square, research 197 §2): it opens and holds as Circle did; Circle does nothing", () => {
    const m = new TauntMenu({ send: () => {}, sound: () => {}, unsupported: () => {}, custom: () => [], teamCommand: 'Square' });
    const step = (t: number, names: PadButton[]) => m.frame(t, new Set(names), true);
    step(0, ['Circle']); step(.1, []); expect(m.isOpen()).toBe(false);
    step(.2, ['Circle']); step(.6, ['Circle']); expect(m.state().voiceHeld).toBe(false); step(.7, []);
    step(.8, ['Square']); step(1.2, ['Square']); expect(m.state().voiceHeld).toBe(true);
    step(1.3, []); expect(m.isOpen()).toBe(false); expect(m.state().voiceHeld).toBe(false);
    step(1.4, ['Square']); step(1.5, []); expect(m.isOpen()).toBe(true);
  });
});

/**
 * AD-10 (web sprint 40, C86; research 227 §2.9): the roots each role's menu draws, by the enable callback
 * `FUN_002344e0` binds to each root and `FUN_00231a30`'s empty-parent rule -- not one gate on the living.
 */
describe('AD-10: the root enable matrix (FUN_002344e0 D:L83766-83794; FUN_00231a30 D:L82546-82582)', () => {
  const LIVING: ChatRole = { alive: true, spectator: false }, DEAD: ChatRole = { alive: false, spectator: false }, SPECTATOR: ChatRole = { alive: false, spectator: true };
  /** A menu whose roots all give a row, TEAMMATES and SPECTATORS by `rows` (null: none), for `role` (mutable). */
  const rig = (o: { role: ChatRole; teammates?: boolean; spectators?: boolean }) => {
    const sent: string[] = [], blocked: string[] = [];
    const row = (root: number): ChatEntry[] => [{ label: `row ${root}`, help: 'h', key: String(root), action: () => { sent.push(String(root)); } }];
    const state = { ...o };
    const m = new TauntMenu({
      send: (c) => { sent.push(JSON.stringify(c)); }, custom: () => ['one', 'two', 'three', 'four', 'five'], sound: () => {}, unsupported: (s) => { blocked.push(s); },
      entries: (root) => (root === 3 ? (state.teammates ?? true ? TEAMMATE : []) : root === SPECTATORS_ROOT ? (state.spectators ? row(5) : []) : row(root)),
      role: () => state.role,
    });
    let t = 0;
    const step = (held: PadButton[]) => m.frame(t += .25, new Set(held), true);
    const press = (b: PadButton) => { step([b]); step([]); };
    return { m, step, press, sent, blocked, state, at: () => t };
  };

  it('each root\'s predicate by role: TAUNTS / RADIO FUN_0022f810 (a living actor or an online spectator), TACTICAL ORDERS / MESSAGES FUN_002301e0 (a living actor, the command group), TEAMMATES / SPECTATORS none', () => {
    const column = (role: ChatRole) => [0, 1, 2, 3, 4, SPECTATORS_ROOT].map((r) => rootEnabled(r, role));
    //                        TACTICAL  TAUNTS  RADIO  TEAMMATES  MESSAGES  SPECTATORS
    expect(column(LIVING)).toEqual([true, true, true, true, true, true]);
    expect(column(DEAD)).toEqual([false, false, false, true, false, true]);
    expect(column(SPECTATOR)).toEqual([false, true, true, true, false, true]);
  });

  it('a living player: every root drawn, peers in the tree\'s order; an empty TEAMMATES is not drawn (no teammate: its PLAYER rows all disabled, FUN_0022f6e0)', () => {
    const r = rig({ role: LIVING, spectators: true });
    r.press('Circle');
    expect([r.m.state().roots, r.m.state().root]).toEqual([[0, 1, 2, 3, SPECTATORS_ROOT, 4], 0]);
    const lone = rig({ role: LIVING, teammates: false });
    lone.press('Circle');
    expect(lone.m.state().roots).toEqual([0, 1, 2, 4]);
    for (let i = 0; i < 3; i++) lone.press('Down');
    expect(lone.m.state().root).toBe(4);                              // MESSAGES after RADIO: TEAMMATES skipped
  });

  it('a dead player opens it (online, FUN_002359a0 D:L84284-84298) on TEAMMATES, its first root (FUN_00235560 D:L84027-84049); TAUNTS, RADIO, TACTICAL ORDERS and MESSAGES are not drawn', () => {
    const r = rig({ role: DEAD, spectators: true });
    r.press('Circle');
    expect([r.m.isOpen(), r.m.state().roots, r.m.state().root]).toEqual([true, [3, SPECTATORS_ROOT], 3]);
    r.press('Down'); expect(r.m.state().root).toBe(SPECTATORS_ROOT);  // the two peers, and the walk wraps over them
    r.press('Down'); expect(r.m.state().root).toBe(3);
    r.press('Cross');
    expect([r.m.state().depth, r.m.state().columns[0]!.rows.map((x) => x.label)]).toEqual([1, ['kilo']]);
    r.press('Cross'); r.press('Cross');                                // kilo > MUTE OFF: the teammate's row acts for the dead
    expect([r.sent, r.m.isOpen()]).toEqual([[], false]);              // (the fake's action records nothing; the menu closed on the send)
    expect(r.blocked).toEqual([]);
  });

  it('a dead player with no teammate: the cursor opens on TEAMMATES, disabled, and FUN_00231690 case 1 (D:L82464-82470) closes the menu at once, its reopen held off as any close', () => {
    for (const spectators of [false, true]) {
      const r = rig({ role: DEAD, teammates: false, spectators });
      r.press('Circle');
      expect([r.m.isOpen(), r.m.state().root], `spectators ${spectators}`).toEqual([true, 3]);   // opened, on TEAMMATES
      r.step([]);                                                        // the next frame: the node it is on disabled, closed
      expect(r.m.isOpen(), `spectators ${spectators}`).toBe(false);
      expect(r.m.state().roots, `spectators ${spectators}`).toEqual(spectators ? [SPECTATORS_ROOT] : []);
      // Held off CHAT_HOLD_SECONDS from the close: a tap at once opens nothing, as after Triangle's close.
      r.m.frame(r.at() + .05, new Set(['Circle']), true); r.m.frame(r.at() + .1, new Set(), true);
      expect(r.m.isOpen()).toBe(false);
    }
  });

  it('the last teammate gone while the cursor is on TEAMMATES, or in it: the menu closes, as SVC-23f\'s SPECTATORS (FUN_00231690 case 1, D:L82464-82470)', () => {
    for (const [role, downs, depth] of [[LIVING, 3, 0], [LIVING, 3, 1], [DEAD, 0, 0], [DEAD, 0, 1]] as const) {
      const r = rig({ role });
      r.press('Circle'); for (let i = 0; i < downs; i++) r.press('Down'); if (depth) r.press('Cross');
      const label = `${role.alive ? 'living' : 'dead'} depth ${depth}`;
      expect([r.m.isOpen(), r.m.state().root, r.m.state().depth], label).toEqual([true, 3, depth]);
      r.state.teammates = false;
      r.step([]);
      expect(r.m.isOpen(), label).toBe(false);
      expect(r.blocked, label).toEqual([]);
    }
  });

  it('AD-11: an online spectator\'s tree is RADIO alone (FUN_001fa360 D:L57441-57448: tree 2; FUN_00232bc0 D:L83641-83645), the cursor on it; Down walks nowhere else; its row acts', () => {
    const r = rig({ role: SPECTATOR, spectators: true });
    r.press('Circle');
    expect([r.m.isOpen(), r.m.state().roots, r.m.state().root]).toEqual([true, [2], 2]);
    r.press('Down'); expect(r.m.state().root).toBe(2);
    r.press('Up'); expect(r.m.state().root).toBe(2);
    r.press('Cross');
    expect([r.m.state().depth, r.m.state().columns[0]!.rows.map((x) => x.label)]).toEqual([1, ['row 2']]);
    r.press('Cross');
    expect([r.sent, r.m.isOpen()]).toEqual([['2'], false]);
  });

  it('the role read at each opening: dead, then alive again (a respawn) -- the living roots back, the menu opening on TACTICAL ORDERS', () => {
    const r = rig({ role: DEAD });
    r.press('Circle');
    expect(r.m.state().roots).toEqual([3]);
    r.press('Triangle'); r.step([]); r.step([]);
    r.state.role = LIVING;
    r.press('Circle');
    expect([r.m.isOpen(), r.m.state().roots, r.m.state().root]).toEqual([true, [0, 1, 2, 3, 4], 0]);
  });

  it('without a role the menu reads a living player\'s (the rows as before AD-10)', () => {
    const m = new TauntMenu({ send: () => {}, custom: () => [], sound: () => {}, unsupported: () => {}, entries: (root) => (root === 3 ? TEAMMATE : []) });
    m.frame(0, new Set(['Circle']), true); m.frame(.1, new Set(), true);
    expect([m.state().roots, m.state().root]).toEqual([[0, 1, 2, 3, 4], 0]);
  });
});
