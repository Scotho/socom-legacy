import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, EMPTY_ITEM, FULL_SLOT, ITEM, type Loadout } from '@s2u/scene';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readHud } from '../src/hudAssets';
import { DPAD_GLYPH, FONT_SPECIAL_01, FONT_TEXT_01 } from '../src/hudFont';
import { closedMenu, step, type MenuContext, type MenuInput, type MenuState } from '../src/weaponSelectState';
import {
  ARROW_HIGH, ARROW_LOW, ARROW_ORIENT, CARD_TEXT_OFFSET, deadHelpLines, DRAW_ORDER, drawWeaponSelect, EMPTY_SLOT_NAME_READING, INVENTORY_GLYPH, menuFade, menuInputOfKey, menuInputOfPad,
  MenuPulses, promptLines, pulse, PULSE_HIGH, PULSE_LOW, PULSE_PHASE_READING, weaponSelectLayout, WEAPON_SELECT_KEY_READING,
  WEAPON_SELECT_MENU_KEYS_READING, type Rgb, type WeaponSelectItem, type WsSprite, type WsText,
} from '../src/weaponSelect';
import { WeaponExchange } from '../src/weaponExchange';

/**
 * WEAPON EXCHANGE drawn (research 94 §B5) over a hand-built arsenal -- `weaponSelectState.test.ts`'s, with each record's
 * `DisplayName` and `IconTextureName` -- the layout per state, the pulses and fades on the clock, the prompt's `%c` per
 * input device, the key and pad maps, and the thin draw to the HUD's quads.
 */

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number, display = name): RdrNode[] =>
  rec(['InternalName', name], ['ID', String(id)], ['DisplayName', display], ['IconTextureName', `${name.replace(/\W/g, '')}_Icon.tif`],
    ['AMMO_TYPES', []]);
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('Mark 23', 15, 'Mk23 Mod 0'), item('M9', 5), item('226', 6), item('HK5', 31), item('M4A1', 54, 'M4A1 Carbine'),
  item('M4A1-M203', 61, 'M4A1 w/M203'), item('AK-47', 58), item('870', 84), item('M40A1', 102), item('M67', 121, 'M67 Frag'),
  item('AN-M8', 122), item('HE', 126, 'HE Grenade'), item('M203', 141), item('M203 HE', 171), item('M203 FRAG', 175),
  item('Claymore', 153), item('C4', 151, 'C4 Explosive'), item('PMN Mine', 158), item('Double Ammo Load', 194, '2X Ammo'),
  item('Thermal Scope', 195),
]] as RdrNode);
const valves = new Map([
  ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_Sig226', 8], ['Enable_mp5', 1], ['Enable_m4Acarbine', 1],
  ['Enable_m4Acarbine_203', 1], ['Enable_ak47', 8], ['Enable_870', 1], ['Enable_remington700', 9], ['Enable_frag', 9],
  ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_203HE', 0], ['Enable_203FRAG', 0], ['Enable_claymore', 1],
  ['Enable_c4', 16], ['Enable_pmn', 8], ['Enable_2xammo', 9], ['Enable_ThermScope', 9],
]);
const seal: MenuContext = { arsenal, valves, side: 'seal' };
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const drive = (s: MenuState, ...inputs: MenuInput[]): MenuState => inputs.reduce((st, i) => step(seal, st, i).state, s);

const texts = (items: WeaponSelectItem[], part: string): WsText[] =>
  items.filter((i): i is WsText => i.kind === 'text' && i.part === part);
const sprites = (items: WeaponSelectItem[], part: string): WsSprite[] =>
  items.filter((i): i is WsSprite => i.kind === 'sprite' && i.part === part);
const one = <T>(xs: T[]): T => { expect(xs).toHaveLength(1); return xs[0]!; };

const OPEN = 1;   // a second after opening: the fades are full (0.25 s)
const R2 = String.fromCharCode(0xbe), RIGHT = String.fromCharCode(0xa3), LEFT = String.fromCharCode(0xaf);

describe('weaponSelectLayout: S2, the slot list (research 94 §B4, §B5)', () => {
  const list = drive(closedMenu(kit(54, 15, 121, 126, ITEM.C4)), 'inventory');

  it('draws the title panel, "WEAPON EXCHANGE" centred on 75 at baseline 129, and the body panel', () => {
    const { items } = weaponSelectLayout(list, seal, OPEN);
    expect(one(sprites(items, 'titlePanel'))).toMatchObject({ texture: 'newweapnbkrnd.tif', x: -10, y: 105, w: 170, h: 35, rgb: [80, 80, 80], alpha: 100 });
    expect(one(texts(items, 'title'))).toMatchObject({ text: 'WEAPON EXCHANGE', x: 75, y: 129, scale: 1, align: 'centre', rgb: [128, 128, 64], alpha: 100 });
    expect(one(sprites(items, 'body'))).toMatchObject({ x: -10, y: 140, w: 170, h: 110, rgb: [128, 128, 128] });
  });

  it('writes the five rows upper-cased at (12, 161 + 20 i), scale 0.9; the locked C4 row in (40, 40, 40)', () => {
    const rows = texts(weaponSelectLayout(list, seal, OPEN).items, 'row');
    expect(rows.map((r) => r.text)).toEqual(['M4A1 CARBINE', 'MK23 MOD 0', 'M67 FRAG', 'HE GRENADE', 'C4 EXPLOSIVE']);
    expect(rows.map((r) => [r.x, r.y, r.scale, r.align])).toEqual([0, 1, 2, 3, 4].map((i) => [12, 161 + 20 * i, 0.9, 'left']));
    expect(rows.map((r) => r.rgb)).toEqual([[128, 128, 128], [128, 128, 128], [128, 128, 128], [128, 128, 128], [40, 40, 40]]);
    const empty = drive(closedMenu(kit(54, 15, 121, EMPTY_ITEM, EMPTY_ITEM)), 'inventory');
    expect(texts(weaponSelectLayout(empty, seal, OPEN).items, 'row').map((r) => r.text)).toEqual(
      ['M4A1 CARBINE', 'MK23 MOD 0', 'M67 FRAG', '<NONE>', '<NONE>']);
  });

  it('puts the highlight bar on the current row (146 + 20 i, 18 high) and pulses it (80,120,120) <-> (160,250,250) at 4/s', () => {
    const down = drive(list, 'down', 'down');
    const at = (t: number): WsSprite => one(sprites(weaponSelectLayout(down, seal, t).items, 'bar'));
    expect(at(OPEN)).toMatchObject({ x: -10, y: 186, w: 170, h: 18 });
    expect(at(0.5).rgb).toEqual([80, 120, 120]);                 // the triangle's foot: a period is 0.5 s
    expect(at(0.625).rgb).toEqual([120, 185, 185]);              // half-way up
    expect(at(0.75).rgb).toEqual([160, 250, 250]);               // the peak
    expect(at(0.875).rgb).toEqual([120, 185, 185]);              // on the way down
  });

  it('previews the picker for the highlighted slot: its category, three cards, grey arrows, no card highlight', () => {
    const { items } = weaponSelectLayout(list, seal, OPEN);
    expect(one(texts(items, 'pickerHeader'))).toMatchObject({ text: 'ASSAULT RIFLES', x: 252, y: 129, scale: 1, align: 'centre', rgb: [128, 128, 64] });
    expect(one(sprites(items, 'pickerPanel'))).toMatchObject({ x: 170, y: 105, w: 170, h: 35, rgb: [80, 80, 80] });
    expect(one(sprites(items, 'pickerBody'))).toMatchObject({ x: 170, y: 140, w: 170, h: 225, rgb: [128, 128, 128] });
    expect(texts(items, 'cardName').map((c) => c.text)).toEqual(['M4A1 W/M203', 'M4A1 CARBINE', 'M4A1 W/M203']);
    const arrows = [...sprites(items, 'categoryArrow'), ...sprites(items, 'itemArrow')];
    expect(arrows).toHaveLength(4);
    for (const a of arrows) expect(a).toMatchObject({ texture: 'hud_arrow_off2.tif', rgb: [100, 100, 100] });
    expect(sprites(items, 'cardHighlight')).toEqual([]);
    const pistol = weaponSelectLayout(drive(list, 'down'), seal, OPEN).items;
    expect(one(texts(pistol, 'pickerHeader')).text).toBe('PISTOLS');
  });
});

describe('weaponSelectLayout: S3, the picker', () => {
  const picker = drive(closedMenu(kit(54, 15, 121, 126, 194)), 'inventory', 'action');

  it('lays the three cards at y0 = 182 + 64 i: icon top-left (174, y0 + 2) at native size, name pen (174, y0 - 2)', () => {
    const { items } = weaponSelectLayout(picker, seal, OPEN);
    const icons = sprites(items, 'cardIcon'), names = texts(items, 'cardName');
    expect(icons.map((i) => [i.texture, i.x, i.y, i.w, i.h])).toEqual([
      ['m4a1m203_icon.tif', 174, 184, null, null], ['m4a1_icon.tif', 174, 248, null, null], ['m4a1m203_icon.tif', 174, 312, null, null],
    ]);
    expect(names.map((n) => [n.text, n.x, n.y, n.scale, n.rgb])).toEqual([
      ['M4A1 W/M203', 174, 180, 0.9, [128, 128, 128]], ['M4A1 CARBINE', 174, 244, 0.9, [128, 128, 128]],
      ['M4A1 W/M203', 174, 308, 0.9, [128, 128, 128]],
    ]);
  });

  it('blanks the side cards when the category holds one item (L88180-88184)', () => {
    const pistol = drive(closedMenu(kit(54, 15, 121, 126, 194)), 'inventory', 'down', 'action');
    const { items } = weaponSelectLayout(pistol, seal, OPEN);
    expect(texts(items, 'cardName').map((n) => [n.text, n.index])).toEqual([['MK23 MOD 0', 1]]);
    expect(sprites(items, 'cardIcon').map((n) => n.index)).toEqual([1]);
  });

  it('shows the middle-card highlight (170..340, 226..290) pulsing at 4/s and holds the slot bar at (160, 250, 250)', () => {
    const at = (t: number): WeaponSelectItem[] => weaponSelectLayout(picker, seal, t).items;
    expect(one(sprites(at(OPEN), 'cardHighlight'))).toMatchObject({ texture: 'newweapnbkrnd.tif', x: 170, y: 226, w: 170, h: 64 });
    expect(one(sprites(at(1.125), 'cardHighlight')).rgb).toEqual([120, 185, 185]);
    expect(one(sprites(at(1.25), 'cardHighlight')).rgb).toEqual([160, 250, 250]);
    expect(one(sprites(at(1.125), 'bar')).rgb).toEqual([160, 250, 250]);
  });

  it('pulses the four arrows (80,80,80) -> (255,255,128) at 2/s, each pointing out of its side', () => {
    const arrows = (t: number): WsSprite[] => {
      const items = weaponSelectLayout(picker, seal, t).items;
      return [...sprites(items, 'categoryArrow'), ...sprites(items, 'itemArrow')];
    };
    for (const a of arrows(1)) expect(a.rgb).toEqual([80, 80, 80]);
    for (const a of arrows(1.25)) expect(a.rgb).toEqual([167.5, 167.5, 104]);
    for (const a of arrows(1.5)) expect(a.rgb).toEqual([255, 255, 128]);
    const [left, right, up, down] = arrows(1);
    expect([left!.x, left!.y, left!.w, left!.h, left!.turn, left!.flipU, left!.flipV]).toEqual([168, 105, null, null, -Math.PI / 2, false, false]);
    expect([right!.x, right!.y, right!.turn, right!.flipU, right!.flipV]).toEqual([305, 105, Math.PI / 2, true, false]);
    expect([up!.x, up!.y, up!.w, up!.h, up!.turn, up!.flipU, up!.flipV]).toEqual([200, 140, 100, 20, 0, false, false]);
    expect([down!.x, down!.y, down!.w, down!.h, down!.turn, down!.flipU, down!.flipV]).toEqual([200, 344, 100, 20, 0, false, true]);
  });

  it('orients each arrow as FUN_00358cc0 / FUN_00358e20 leave its corners (ARROW_ORIENT)', () => {
    type O = { turn: number; flipU: boolean; flipV: boolean };
    // The texel point (u, v) in 0..1 a screen point samples, for a quad mirrored, then turned clockwise by `turn`.
    const sample = (o: O, sx: number, sy: number): [number, number] => {
      const c = Math.cos(-o.turn), n = Math.sin(-o.turn), x = sx - 0.5, y = sy - 0.5;
      const ux = x * c - y * n + 0.5, uy = x * n + y * c + 0.5;
      const r = (v: number): number => Math.round(v * 1e9) / 1e9 + 0;
      return [r(o.flipU ? 1 - ux : ux), r(o.flipV ? 1 - uy : uy)];
    };
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
    const drawn = (o: O) => corners.map(([x, y]) => sample(o, x, y));
    // The code's mappings, worked from the vertex slots: as stored; (sx, 1 - sy); (1 - sy, sx); (1 - sy, 1 - sx).
    const code = (f: (x: number, y: number) => [number, number]) => corners.map(([x, y]) => f(x, y));
    expect(drawn(ARROW_ORIENT.up)).toEqual(code((x, y) => [x, y]));
    expect(drawn(ARROW_ORIENT.down)).toEqual(code((x, y) => [x, 1 - y]));
    expect(drawn(ARROW_ORIENT.left)).toEqual(code((x, y) => [1 - y, x]));
    expect(drawn(ARROW_ORIENT.right)).toEqual(code((x, y) => [1 - y, 1 - x]));
  });

  it('draws in the game\'s order (DRAW_ORDER): the picker, its arrows, the cards card by card, the slot list\'s panels, then the strings', () => {
    const parts = weaponSelectLayout(picker, seal, OPEN, { prompt: { ghost: false, device: 'pad', sinceDeath: 1 } }).items
      .map((i) => (i.index === undefined ? i.part : `${i.part}${i.index}`));
    expect(parts).toEqual([
      'pickerPanel', 'pickerBody', 'pickerHeader', 'categoryArrow0', 'categoryArrow1', 'itemArrow0', 'itemArrow1', 'cardHighlight',
      'cardIcon0', 'cardName0', 'cardIcon1', 'cardName1', 'cardIcon2', 'cardName2', 'titlePanel', 'body', 'bar',
      'prompt0', 'prompt1', 'prompt2', 'title', 'row0', 'row1', 'row2', 'row3', 'row4',
    ]);
    expect(DRAW_ORDER.flat()).toHaveLength(14);
  });

  it('keeps the card name at its pen, the text object adding nothing of its own (CARD_TEXT_OFFSET)', () => {
    expect(CARD_TEXT_OFFSET).toEqual({ dx: 0, dy: 0 });
  });
});

describe('the empty rows and the pulses across openings (PF-32; research 233 §4)', () => {
  it("an empty slot's row reads <NONE> and a two-slot item's second row ------- from zweapon.rdr's EQUIP_NONE (0xff) and FULL_SLOT (0xfe) DisplayName (FUN_003c4b40 D:L316433-316449; FUN_0023e370 L88329-88336); rows past the count are blank", () => {
    // The disc's zweapon.rdr holds both records (test-fixtures/RUN/ZWEAPON.ZAR: FULL_SLOT 254 '-------', EQUIP_NONE 255
    // '<NONE>'); the row setter takes the record FUN_003c4b40 finds by +0x7c, as for a weapon's.
    const withNone = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
      item('M4A1', 54, 'M4A1 Carbine'), item('Mark 23', 15, 'Mk23 Mod 0'), item('M67', 121, 'M67 Frag'), item('FULL_SLOT', 254, '-------'), item('EQUIP_NONE', 255, '<NONE>'),
    ]] as RdrNode);
    const ctx: MenuContext = { ...seal, arsenal: withNone };
    const rows = (c: MenuContext, k: Loadout): string[] =>
      texts(weaponSelectLayout(step(c, closedMenu(k), 'inventory').state, c, OPEN).items, 'row').map((r) => r.text);
    expect(rows(ctx, kit(54, 15, 121, FULL_SLOT, EMPTY_ITEM))).toEqual(['M4A1 CARBINE', 'MK23 MOD 0', 'M67 FRAG', '-------', '<NONE>']);
    // An arsenal without the two records (a hand-built one): the same strings, EMPTY_SLOT_NAME_READING's.
    expect(EMPTY_SLOT_NAME_READING).toEqual({ [EMPTY_ITEM]: '<NONE>', [FULL_SLOT]: '-------' });
    expect(rows(seal, kit(54, 15, 121, FULL_SLOT, EMPTY_ITEM))).toEqual(['M4A1 CARBINE', 'MK23 MOD 0', 'M67 FRAG', '-------', '<NONE>']);
    // Rows past the character's slot count are cleared with a null record (D:L88328): blank.
    expect(rows(ctx, kit(54, 15, 121))).toEqual(['M4A1 CARBINE', 'MK23 MOD 0', 'M67 FRAG', '', '']);
  });

  it("the slot bar's, the card highlight's and the arrows' pulses carry their phase from one opening to the next, each advanced only while its part shows (FUN_00240600 D:L89400-89488; FUN_0023d2b0 D:L87909-87923); set once when the HUD is built (FUN_00241a90; FUN_0023cd20 from FUN_00240e60 D:L89595-89600, research 202 §3.12)", () => {
    expect(PULSE_PHASE_READING).toBe('persistent');
    const near = (a: Rgb, b: Rgb): void => { a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 9)); };
    const mixed = (lo: Rgb, hi: Rgb, k: number): Rgb => [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k];
    const p = new MenuPulses();
    expect(p.clocks(0)).toEqual({ bar: 0, highlight: 0, arrows: 0 });           // 0 rising when built
    p.change('list', 0);                                                         // opened on the slot list
    p.change('picker', 0.3);                                                     // the bar stopped at 0.3 s
    p.change('closed', 0.5);                                                     // the arrows at 0.2 s
    expect(p.clocks(0.5)).toEqual({ bar: 0.3, highlight: 0.5, arrows: 0.2 });
    // Closed: the body fades out over 0.25 s (100 reached, 400/s), and the card highlight runs while it shows.
    expect(p.clocks(10)).toEqual({ bar: 0.3, highlight: 0.75, arrows: 0.2 });
    p.change('list', 10);                                                        // opened again: nothing reset
    const at = p.clocks(10);
    expect(at).toEqual({ bar: 0.3, highlight: 0.75, arrows: 0.2 });
    const list = drive(closedMenu(kit(54, 15, 121, 126, 194)), 'inventory');
    const bar = one(sprites(weaponSelectLayout(list, seal, OPEN, { pulses: at }).items, 'bar'));
    near(bar.rgb, mixed(PULSE_LOW, PULSE_HIGH, 0.8));                             // 0.3 s x 4/s = 1.2: on the way down, 0.8
    expect(p.clocks(10.1).bar).toBeCloseTo(0.4, 12);
    p.change('picker', 10.1);
    const picker = drive(list, 'action');
    const arrows = sprites(weaponSelectLayout(picker, seal, 0.1, { pulses: p.clocks(10.1) }).items, 'categoryArrow');
    for (const a of arrows) near(a.rgb, mixed(ARROW_LOW, ARROW_HIGH, 0.4));        // 0.2 s x 2/s, where it stopped
    near(one(sprites(weaponSelectLayout(picker, seal, 0.1, { pulses: p.clocks(10.1) }).items, 'cardHighlight')).rgb,
      mixed(PULSE_LOW, PULSE_HIGH, pulse(0.85, 4)));
    // The page's menu keeps one MenuPulses for the match (WeaponExchange): a reopening continues the bar.
    let now = 0;
    const x = new WeaponExchange({ clock: () => now, opensOn: () => kit(54, 15, 121, 126, 194), confirm: () => {} });
    x.setContext(seal);
    const gate = { inMatch: true, alive: false, cameraOnSelf: true, spectator: false };
    x.input('inventory', gate);
    now = 0.3; x.input('back', gate);
    now = 5; x.input('inventory', gate);
    now = 5.5;                                                                   // 0.3 s before the close, 0.5 s since
    near(one(sprites(x.layout(null).items, 'bar')).rgb, mixed(PULSE_LOW, PULSE_HIGH, pulse(0.8, 4)));
    expect(pulse(0.8, 4)).not.toBeCloseTo(pulse(0.5, 4), 3);                      // not from the opening
  });
});

describe('the fades: 0 <-> 100 at 400/s (DAT_003dce78/80, 98/a0)', () => {
  const list = drive(closedMenu(kit(54, 15, 121, 126, 194)), 'inventory');

  it('fades in over 0.25 s after opening, everything of the menu together', () => {
    expect(menuFade('list', 0)).toBe(0);
    expect(menuFade('list', 0.125)).toBe(50);
    expect(menuFade('picker', 0.3)).toBe(100);
    const { items } = weaponSelectLayout(list, seal, 0.125);
    for (const i of items) expect(i.alpha).toBe(50);
  });

  it('fades out over 0.25 s after closing, from where it had reached; nothing when never opened', () => {
    const closed = step(seal, list, 'back').state;
    expect(menuFade('closed', 2, 0.125)).toBe(50);
    expect(menuFade('closed', 0.1, 0.05)).toBe(0);                // open 0.05 s: 20 reached, 20 gone after 0.05 s
    const fading = weaponSelectLayout(closed, seal, 2, { closedFor: 0.125 }).items;
    expect(one(texts(fading, 'title')).alpha).toBe(50);
    expect(one(sprites(fading, 'bar')).rgb).toEqual([160, 250, 250]);   // state 0: the bar's solid branch (L89431)
    expect(weaponSelectLayout(closed, seal, 2, { closedFor: 0.3 }).items).toEqual([]);
    expect(weaponSelectLayout(closedMenu(kit(54, 15, 121, 126, 194)), seal, 5).items).toEqual([]);
  });
});

describe("LATER 118: the dead's six help lines, as the paths write them (research 282 §8; research 91 §12)", () => {
  // The ELF's strings (read through tools/elfImage.ts): 0xa3 / 0xaf the d-pad's right / left glyphs, 0x3e31b0 a space.
  const BLANK = ' ';
  it("on his own body (FUN_001f97b0, respawn off): 0x3e32e0 with the Inventory glyph, 0x3e3350, 0x3e3380, then 0x3e31b0 (D:L56997-57007, D:L57040-57046)", () => {
    expect(deadHelpLines({ ghost: false, watching: false, device: 'pad' })).toEqual([
      `You have died.  ${R2} Select new weapons.`, `Use the ${RIGHT} and ${LEFT} directional buttons`, 'to cycle through living teammates',
      BLANK, BLANK, BLANK,
    ]);
  });
  it("a ghost on its own body: 0x3e31c0, 0x3e31f0 with the glyph, 0x3e3280, 0x3e32b0, then 0x3e31b0 (D:L57049-57060, D:L57100-57106)", () => {
    expect(deadHelpLines({ ghost: true, watching: false, device: 'pad' })).toEqual([
      'You are a ghost.  You will play the next', `round as a real player.  ${R2} Select new`,
      `weapons. Use the ${RIGHT} and ${LEFT} directional`, 'buttons to cycle through living teammates.', BLANK, BLANK,
    ]);
  });
  it('watching a teammate (FUN_001f9f20): 0x3e3430, 0x3e3450, 0x3e3410, then 0x3e31b0 (D:L57150-57159)', () => {
    expect(deadHelpLines({ ghost: false, watching: true, device: 'pad' })).toEqual([
      `You have died.  Use the ${RIGHT} and ${LEFT}`, 'directional buttons to cycle through', 'living teammates.', BLANK, BLANK, BLANK,
    ]);
  });
  it('a ghost watching a teammate: 0x3e31c0, 0x3e33b0, 0x3e33e0, 0x3e3410, then 0x3e31b0 (D:L57162-57172)', () => {
    expect(deadHelpLines({ ghost: true, watching: true, device: 'pad' })).toEqual([
      'You are a ghost.  You will play the next', `round as a real player.  Use the ${RIGHT} and`,
      `${LEFT} directional buttons to cycle through`, 'living teammates.', BLANK, BLANK,
    ]);
  });
  it("the %c per device and Inventory button, as the prompt renders it (R1's 0xbd; the key; the touch label)", () => {
    expect(deadHelpLines({ ghost: false, watching: false, device: 'pad', inventoryButton: 'R1' })[0]).toBe(`You have died.  ${String.fromCharCode(0xbd)} Select new weapons.`);
    expect(deadHelpLines({ ghost: false, watching: false, device: 'keyboard' })[0]).toBe(`You have died.  ${WEAPON_SELECT_KEY_READING.label} Select new weapons.`);
    expect(deadHelpLines({ ghost: true, watching: false, device: 'touch' })[1]).toBe('round as a real player.  [INV] Select new');
  });
});

describe('the prompt lines (§B2, S1 / S1g; FUN_001f97b0 L56978)', () => {
  it('writes the dead player\'s three lines centred on x 324 at baselines 380 + 18 i, scale 0.9, the %c the pad\'s R2 glyph (0xbe)', () => {
    const lines = promptLines({ ghost: false, device: 'pad', sinceDeath: 1 });
    expect(lines.map((l) => l.text)).toEqual([
      `You have died.  ${R2} Select new weapons.`, `Use the ${RIGHT} and ${LEFT} directional buttons`, 'to cycle through living teammates',
    ]);
    expect(lines.map((l) => [l.x, l.y, l.scale, l.align, l.rgb, l.alpha])).toEqual(
      [0, 1, 2].map((i) => [324, 380 + 18 * i, 0.9, 'centre', [100, 100, 20], 100]));
    expect(lines[0]!.glyphs).toEqual([0xbe]);
    expect(lines[1]!.glyphs).toEqual([DPAD_GLYPH.right, DPAD_GLYPH.left]);
    expect(lines[2]!.glyphs).toBeUndefined();
    expect(promptLines({ ghost: false, device: 'pad', sinceDeath: 1, inventoryButton: 'R1' })[0]).toMatchObject({
      text: `You have died.  ${String.fromCharCode(0xbd)} Select new weapons.`, glyphs: [INVENTORY_GLYPH.R1],
    });
  });

  it('renders the %c as the PC key and the touch button on those devices', () => {
    const keyboard = promptLines({ ghost: false, device: 'keyboard', sinceDeath: 1 });
    expect(keyboard[0]!.text).toBe(`You have died.  ${WEAPON_SELECT_KEY_READING.label} Select new weapons.`);
    expect(keyboard[0]!.glyphs).toBeUndefined();
    expect(keyboard[1]!.text).toBe(`Use the ${RIGHT} and ${LEFT} directional buttons`);   // the d-pad glyphs stay the game's
    expect(WEAPON_SELECT_KEY_READING.code).toBe('KeyI');
    expect(promptLines({ ghost: false, device: 'touch', sinceDeath: 1 })[0]!.text).toBe('You have died.  [INV] Select new weapons.');
  });

  it('writes the ghost\'s four lines with the same %c', () => {
    expect(promptLines({ ghost: true, device: 'keyboard', sinceDeath: 1 }).map((l) => [l.text, l.y])).toEqual([
      ['You are a ghost.  You will play the next', 380], ['round as a real player.  [I] Select new', 398],
      [`weapons. Use the ${RIGHT} and ${LEFT} directional`, 416], ['buttons to cycle through living teammates.', 434],
    ]);
  });

  it('holds 10 s, then fades to nothing over 0.5 s (L56544-56561)', () => {
    const alpha = (s: number): number[] => promptLines({ ghost: false, device: 'pad', sinceDeath: s }).map((l) => l.alpha);
    expect(alpha(10)).toEqual([100, 100, 100]);
    expect(alpha(10.25)).toEqual([50, 50, 50]);
    expect(alpha(10.5)).toEqual([]);
  });

  it('is drawn with the menu closed (S1) and stays up while it is open', () => {
    const prompt = { ghost: false, device: 'pad' as const, sinceDeath: 2 };
    const s1 = weaponSelectLayout(closedMenu(kit(54, 15, 121, 126, 194)), seal, 0, { prompt }).items;
    expect(s1.map((i) => i.part)).toEqual(['prompt', 'prompt', 'prompt']);
    const open = drive(closedMenu(kit(54, 15, 121, 126, 194)), 'inventory');
    expect(texts(weaponSelectLayout(open, seal, OPEN, { prompt }).items, 'prompt')).toHaveLength(3);
  });
});

describe('the keys and the pad inside the menu (§B3)', () => {
  it('maps every key WEAPON_SELECT_MENU_KEYS_READING names, and nothing else', () => {
    const expected: Record<string, MenuInput> = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right',
      ArrowRight: 'right', KeyX: 'action', Enter: 'action', Backspace: 'back', KeyI: 'inventory',
    };
    for (const [code, input] of Object.entries(expected)) expect(menuInputOfKey(code), code).toBe(input);
    expect(Object.keys(WEAPON_SELECT_MENU_KEYS_READING).sort()).toEqual(Object.keys(expected).sort());
    for (const code of ['Escape', 'Space', 'KeyQ', 'KeyE', 'Tab', 'KeyR', 'Digit1', 'KeyM', 'constructor']) expect(menuInputOfKey(code), code).toBeNull();
  });

  it('keeps the game\'s buttons on the pad: R2 Inventory, Cross Action, Triangle / Start back, the d-pad; Circle is no cancel', () => {
    expect(menuInputOfPad('R2')).toBe('inventory');
    expect(menuInputOfPad('Cross')).toBe('action');
    expect(menuInputOfPad('Triangle')).toBe('back');
    expect(menuInputOfPad('Start')).toBe('back');
    expect(['Up', 'Down', 'Left', 'Right'].map((b) => menuInputOfPad(b as 'Up'))).toEqual(['up', 'down', 'left', 'right']);
    for (const b of ['Circle', 'Square', 'R1', 'L1', 'L2', 'Select', 'L3', 'R3'] as const) expect(menuInputOfPad(b), b).toBeNull();
  });
});

describe('drawWeaponSelect: the layout as the HUD pass\'s quads (layer 1), as the scoreboard draws', () => {
  const SIZES: Record<string, { width: number; height: number }> = {
    'newweapnbkrnd.tif': { width: 128, height: 64 }, 'hud_arrow_off2.tif': { width: 32, height: 32 },
    'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 }, 'm4a1_icon.tif': { width: 128, height: 32 }, 'm4a1m203_icon.tif': { width: 128, height: 32 },
  };
  const picker = drive(closedMenu(kit(54, 15, 121, 126, 194)), 'inventory', 'action');

  it('places the panels on a 640x448 frame as laid out, stretched whole, tinted on the 0-128 scale', () => {
    const { quads } = drawWeaponSelect({ width: 640, height: 448 }, weaponSelectLayout(picker, seal, OPEN), SIZES);
    expect(quads.every((q) => q.layer === 1)).toBe(true);
    const panels = quads.filter((q) => q.texture === 'newweapnbkrnd.tif');
    expect(panels.map((q) => [q.x - q.w / 2, q.y - q.h / 2, q.w, q.h])).toEqual([
      [170, 105, 170, 35], [170, 140, 170, 225], [170, 226, 170, 64], [-10, 105, 170, 35], [-10, 140, 170, 110], [-10, 146, 170, 18],
    ]);
    const title = panels[3]!;
    expect([title.u0, title.v0, title.u1, title.v1]).toEqual([0, 0, 128, 64]);
    expect(title.rgba).toEqual([80 / 128, 80 / 128, 80 / 128, 100 / 128]);
  });

  it('draws an icon at its native size, the arrows turned or flipped, and scales with the frame about its centre', () => {
    const { quads } = drawWeaponSelect({ width: 1280, height: 896 }, weaponSelectLayout(picker, seal, OPEN), SIZES);
    const icon = quads.find((q) => q.texture === 'm4a1_icon.tif')!;
    expect([icon.x - icon.w / 2, icon.y - icon.h / 2, icon.w, icon.h]).toEqual([640 + (174 - 320) * 2, 248 * 2, 256, 64]);
    const arrows = quads.filter((q) => q.texture === 'hud_arrow_off2.tif');
    expect(arrows.map((a) => a.turn)).toEqual([-Math.PI / 2, Math.PI / 2, 0, 0]);
    expect(arrows.map((a) => [a.u0, a.v0, a.u1, a.v1])).toEqual([[0, 0, 32, 32], [32, 0, 0, 32], [0, 0, 32, 32], [0, 32, 32, 0]]);
    const text = quads.filter((q) => q.texture === FONT_TEXT_01.texture);
    expect(text.length).toBeGreaterThan(0);
  });

  it('draws the prompt\'s pad glyphs from font_special_01.tif in (150, 150, 150) with no shadow; the letters glyph by glyph, shadow first', () => {
    const layout = weaponSelectLayout(closedMenu(kit(54, 15, 121, 126, 194)), seal, 0, { prompt: { ghost: false, device: 'pad', sinceDeath: 1 } });
    const { quads } = drawWeaponSelect({ width: 640, height: 448 }, layout, SIZES);
    const special = quads.filter((q) => q.texture === FONT_SPECIAL_01.texture);
    expect(special.map((q) => [q.u0, q.v0])).toEqual([[148, 35], [182, 35], [200, 35]]);   // R2, then the d-pad's right and left; v from UL.y + 1 (OBF-33)
    for (const q of special) expect(q.rgba).toEqual([150 / 128, 150 / 128, 150 / 128, 100 / 128]);
    const letters = quads.filter((q) => q.texture === FONT_TEXT_01.texture);
    // "You": Y's shadow, Y, o's shadow, o, ...; the shadow black at min(100, int(0.75 x 128) = 96).
    const ink = [100 / 128, 100 / 128, 20 / 128, 100 / 128], shadow = [0, 0, 0, 96 / 128];
    expect(letters.slice(0, 4).map((q) => q.rgba)).toEqual([shadow, ink, shadow, ink]);
    expect(letters[0]!.u0).toBe(letters[1]!.u0);
    expect(letters[2]!.u0).not.toBe(letters[0]!.u0);
    // Without the atlas the pad glyphs draw nothing, and the letters as before.
    const bare = drawWeaponSelect({ width: 640, height: 448 }, layout, { 'font_text_01.tif': SIZES['font_text_01.tif']! });
    expect(bare.quads.filter((q) => q.texture === FONT_SPECIAL_01.texture)).toEqual([]);
    expect(bare.quads).toHaveLength(letters.length);
  });

  it('skips what it has no bitmap for and what is faded out', () => {
    const { quads } = drawWeaponSelect({ width: 640, height: 448 }, weaponSelectLayout(picker, seal, OPEN), {});
    expect(quads).toEqual([]);
    const faded = drawWeaponSelect({ width: 640, height: 448 }, weaponSelectLayout(picker, seal, 0), SIZES);
    expect(faded.quads).toEqual([]);
  });
});

const mp2 = fixture('RUN/MP2.ZDB');
describe.skipIf(mp2 === null)(`the arrow bitmap on the disc${mp2 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('hud_arrow_off2.tif points up: its ink narrows from a wide base to a tip at the top (ARROW_ORIENT)', () => {
    const { bitmaps } = readHud(mp2!, parseZdb(mp2!));
    const a = bitmaps['hud_arrow_off2.tif']!;
    const widths: number[] = [];
    for (let y = 0; y < a.height; y++) {
      let n = 0;
      for (let x = 0; x < a.width; x++) if (a.data[(y * a.width + x) * 4 + 3]! > 0) n++;
      if (n) widths.push(n);
    }
    expect(widths.length).toBeGreaterThan(8);
    expect(widths[0]!).toBeLessThan(widths[widths.length - 1]! / 4);
  });
});
