import { describe, expect, it } from 'vitest';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { ammoDisplayNameOf, HELD_RIFLE, HELD_SIDEARM, readKitTable } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  DEFAULT_MODEL, DEFAULT_ROUND, HUD_LAYOUT, Hud, hudLayout, messageAlpha, ROUND_SCREEN_HIDES, ROUND_START, SMALL_MESSAGE_WRAP_WIDTH,
  SMALL_MESSAGES, type HudModel, hudPass, OWN_BODY_HIDES, SPECTATOR_HIDES, START_MENU_HIDES, TEAMMATE_HIDES,
} from '../src/hud';
import { ammoNameOf, PICKUP_LINE_ENTRY_ORDER_PLACEHOLDER, PICKUP_TEXT_FIREARM_READING, pickupLines } from '../src/pickupLine';

/**
 * PICKUP-LINE (research 234 §7 `PICKUP_TEXT_PLACEHOLDER`, research 87 §14): a bundle walked over posts the taken item's
 * ammo name -- `FUN_005bb000` (D:L473356-473375, D:L473374) posts the ammo record's string on the small message window
 * (`small_messages.rdr`, colour 0) unless it is the window's latest line; the rig showed "M67 Ammo" and
 * "HE Grenade / Ammo" (the second wrapped by the small window's width).
 */

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const model = (over: Partial<HudModel> = {}): HudModel => ({ ...DEFAULT_MODEL, ...over });
const smallTexts = (hud: Hud): string[] => (hud.state().model.smallBanner ?? []).map((b) => b.lines.map((l) => l.text).join('/'));

describe('pickupLines: what a take posts, in the order FUN_005bb000 takes its entries', () => {
  const records = [HELD_RIFLE, HELD_SIDEARM] as const;
  const names = new Map([[121, 'M67 Ammo'], [126, 'HE Grenade Ammo']]);
  const ammoOf = (item: number): string | null => names.get(item) ?? null;

  it('an equipment take posts each written slot\'s item ammo name (the rig: "M67 Ammo")', () => {
    const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 126, 255];
    expect(pickupLines({ slot: null, loadout, records, added: [[], []], equipment: [{ slot: 2 }] }, ammoOf)).toEqual(['M67 Ammo']);
    expect(pickupLines({ slot: null, loadout, records, added: [[], []], equipment: [{ slot: 2 }, { slot: 3 }] }, ammoOf))
      .toEqual(['M67 Ammo', 'HE Grenade Ammo']);
  });

  it('a firearm pour posts the slot record\'s ammo name first (PICKUP_TEXT_FIREARM_READING), the equipment after', () => {
    const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255];
    const lines = pickupLines({ slot: null, loadout, records, added: [[18], []], equipment: [{ slot: 2 }] }, ammoOf);
    expect(PICKUP_TEXT_FIREARM_READING).toBe('posted');
    expect(lines).toEqual([HELD_RIFLE.ammo, 'M67 Ammo']);
    expect(HELD_RIFLE.ammo).toBe('5.56 x 45mm');
  });

  it("PICKUP_LINE_ENTRY_ORDER_PLACEHOLDER: the port's order (firearms, then equipment) stands named, not the bundle's", () => {
    // FUN_005bb990 D:L473549-473607 posts one line per bundle entry in its order; the room's kit carries no such order.
    expect(PICKUP_LINE_ENTRY_ORDER_PLACEHOLDER).toMatch(/firearm rings first/);
    const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255];
    expect(pickupLines({ slot: null, loadout, records, added: [[18], []], equipment: [{ slot: 2 }] }, ammoOf))
      .toEqual([HELD_RIFLE.ammo, 'M67 Ammo']);
  });

  it('posts nothing for a weapon claim (a slot), a launcher claim (nothing added), a pour of nothing, or an unknown item', () => {
    const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255];
    expect(pickupLines({ slot: 0, loadout, records, added: [[18], []] }, ammoOf)).toEqual([]);
    expect(pickupLines({ slot: null, loadout, records, added: [[], []] }, ammoOf)).toEqual([]);
    expect(pickupLines({ slot: null, loadout, records }, ammoOf)).toEqual([]);
    expect(pickupLines({ slot: null, loadout, records, added: [[0], [0]] }, ammoOf)).toEqual([]);
    expect(pickupLines({ slot: null, loadout: [0, 0, 999, 0, 0], records, equipment: [{ slot: 2 }] }, ammoOf)).toEqual([]);
  });

  it('posts each line by its ammo record\'s DisplayName (PICKUP_TEXT_READING): the firearm\'s and the equipment\'s', () => {
    const display = new Map([['5.56 x 45mm', '5.56 X 45MM'], ['M67 Ammo', 'M67 FRAG']]);
    const shown = (ammo: string): string => display.get(ammo) ?? ammo;
    const named = (item: number): string | null => { const a = ammoOf(item); return a === null ? null : shown(a); };
    const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 126, 255];
    expect(pickupLines({ slot: null, loadout, records, added: [[18], []], equipment: [{ slot: 2 }, { slot: 3 }] }, named, shown))
      .toEqual(['5.56 X 45MM', 'M67 FRAG', 'HE Grenade Ammo']);
  });

  it('ammoNameOf: the kit table\'s item ammo, else the baked throwable\'s', () => {
    expect(ammoNameOf(null, 121)).toBe('M67 Ammo');
    expect(ammoNameOf(null, 126)).toBe('HE Grenade Ammo');
    expect(ammoNameOf(null, 999)).toBeNull();
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(ZWEAPON === null)(`ammoNameOf on the disc's kit table${ZWEAPON === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('names the rig\'s two lines and the charges by their ZAMMO names', () => {
    const table = readKitTable(ZWEAPON!);
    expect(ammoNameOf(table, 121)).toBe('M67 Ammo');
    expect(ammoNameOf(table, 126)).toBe('HE Grenade Ammo');
    expect(ammoNameOf(table, 151)).toBe('C4 Ammo');
    expect(ammoNameOf(table, 153)).toBe('Claymore Ammo');
  });

  it('PICKUP_TEXT_READING: every item\'s line is its ZAMMO record\'s DisplayName (127: "M18 RED SMOKE"), the disc\'s bytes', () => {
    const table = readKitTable(ZWEAPON!);
    expect(ammoNameOf(table, 127)).toBe('M18 RED SMOKE');
    let differs = 0;
    for (const [id, item] of table.arsenal.items) {
      if (item.ammo === null) continue;
      const shown = ammoDisplayNameOf(table.arsenal, item.ammo);
      expect([id, ammoNameOf(table, id)]).toEqual([id, shown]);
      if (shown !== item.ammo) differs++;
    }
    expect(differs).toBeGreaterThan(0);
    // A firearm pour posts its record's ammo by the same table: the Dragunov's round keeps its trailing space.
    const svd = [...table.records.values()].find((r) => r.ammo === '7.62 x 54 R')!;
    const lines = pickupLines({ slot: null, loadout: [svd.id, HELD_SIDEARM.id, 255, 255, 255], records: [svd, HELD_SIDEARM], added: [[10], []] },
      (item) => ammoNameOf(table, item), (ammo) => ammoDisplayNameOf(table.arsenal, ammo));
    expect(lines).toEqual(['7.62 x 54 R ']);
  });
});

describe('the small message window (small_messages.rdr, research 87 §14)', () => {
  it('wraps at the small window\'s 92: "HE Grenade Ammo" is the rig\'s "HE Grenade / Ammo", "M67 Ammo" one line', () => {
    expect(SMALL_MESSAGE_WRAP_WIDTH).toBe(92);
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('M67 Ammo');
    hud.postSmallMessage('HE Grenade Ammo');
    hud.step(0.5);
    expect(smallTexts(hud)).toEqual(['M67 Ammo', 'HE Grenade/Ammo']);
    expect(hud.state().model.banner).toEqual([]);           // the main window untouched
  });

  it('does not post the window\'s latest line again while it shows; another line, or the same once gone, posts', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('M67 Ammo');
    hud.postSmallMessage('M67 Ammo');
    hud.step(0.5);
    expect(smallTexts(hud)).toEqual(['M67 Ammo']);
    hud.postSmallMessage('C4 Ammo');
    hud.postSmallMessage('M67 Ammo');
    hud.step(0.1);
    expect(smallTexts(hud)).toEqual(['M67 Ammo', 'C4 Ammo', 'M67 Ammo']);
    hud.step(SMALL_MESSAGES.fadetime + 1);
    expect(smallTexts(hud)).toEqual([]);
    hud.postSmallMessage('M67 Ammo');
    hud.step(0.5);
    expect(smallTexts(hud)).toEqual(['M67 Ammo']);
  });

  // PICKUP-LINE correction 5: the take compares its text case-insensitively with the window's NEWEST LINE
  // (`FUN_002b6d60` / `FUN_00198b80`, D:L473369-473371); the window itself (`FUN_002b6530` D:L157930-157941) skips the
  // text's leading spaces and, on the same text as its last post while it holds a line, adds none
  // (SMALL_MESSAGE_REPEAT_RESET_PLACEHOLDER: what it does to that post's lines is a virtual call not read).
  it('a repeat in another case is a repeat: the take\'s compare is case-insensitive (FUN_00198b80)', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('M67 Ammo');
    hud.postSmallMessage('m67 AMMO');
    hud.step(0.5);
    expect(smallTexts(hud)).toEqual(['M67 Ammo']);
  });

  it('a wrapped post: its last piece is the newest line the take compares with; the window drops its whole text again', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('HE Grenade Ammo');                 // "HE Grenade" / "Ammo": the newest line is "Ammo"
    hud.postSmallMessage('AMMO');                            // the take's compare: the newest line, any case -- dropped
    hud.step(0.1);
    expect(smallTexts(hud)).toEqual(['HE Grenade/Ammo']);
    hud.postSmallMessage('HE Grenade Ammo');                 // passes the take's compare ("Ammo"), the window's own drops it
    hud.step(0.1);
    expect(smallTexts(hud)).toEqual(['HE Grenade/Ammo']);
    hud.postSmallMessage('HE GRENADE AMMO');                 // the window's own compare is by bytes: another case posts
    hud.step(0.1);
    expect(smallTexts(hud)).toEqual(['HE Grenade/Ammo', 'HE GRENADE/AMMO']);
  });

  it('the window skips a text\'s leading spaces (D:L157930-157931): " CHEM LIGHT " twice is one post', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage(' CHEM LIGHT ');
    hud.postSmallMessage(' CHEM LIGHT ');
    hud.step(0.5);
    expect(smallTexts(hud).map((t) => t.trim())).toEqual(['CHEM LIGHT']);
    expect(smallTexts(hud)[0]!.startsWith(' ')).toBe(false);
  });

  it('fades out on the small window\'s fadetime 5, not the main window\'s 7', () => {
    expect(SMALL_MESSAGES.fadetime).toBe(5);
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('M67 Ammo');
    hud.step(5);
    expect(smallTexts(hud)).toEqual(['M67 Ammo']);
    hud.step(ROUND_START.fadeOut + 0.01);
    expect(smallTexts(hud)).toEqual([]);
    expect(messageAlpha(5.2, SMALL_MESSAGES.fadetime)).toBeLessThan(1);
    expect(messageAlpha(5.2)).toBe(1);                       // the main window's own fadetime unchanged
  });

  it('with no pick-up the HUD\'s model and layout are as they were: no small window on the model, no quad of it drawn', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.startRound(DEFAULT_ROUND);
    hud.step(1);
    hud.postMessage('Satchel');                              // the main window's post is the main window's alone
    hud.step(1);
    expect('smallBanner' in hud.state().model).toBe(false);
    const draw = hudLayout(PS2, hud.state().model, SIZES, hud.timing());
    expect(draw.quads.some((q) => q.element === 'smallMessage')).toBe(false);
    expect(draw.rects.smallMessage).toBeUndefined();
  });

  it('a round\'s start clears the window, and a round screen hides it', () => {
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('M67 Ammo');
    hud.step(0.5);
    expect(smallTexts(hud)).toEqual(['M67 Ammo']);
    hud.startRound(DEFAULT_ROUND);
    hud.step(0.1);
    expect(smallTexts(hud)).toEqual([]);
    expect(ROUND_SCREEN_HIDES.has('smallMessage')).toBe(true);
  });

  it('draws its panel and lines at the top left, left-anchored, clear of the main window', () => {
    const W = HUD_LAYOUT.smallMessage;
    expect(W).toEqual({ panel: { x: 2, y: 0, w: 140, h: 99 }, x: 12 });
    const draw = hudLayout(PS2, model({ smallBanner: [{ alpha: 1, lines: [{ text: 'M67 Ammo', scale: 0.9 }] }] }), SIZES);
    const r = draw.rects.smallMessage!;
    expect(r.x).toBeCloseTo(2, 5);
    expect(r.width).toBeCloseTo(140, 5);
    expect(draw.rects.message).toBeUndefined();
    // On a wide frame it stays on the left edge (the ammo box's anchor), not the centre line.
    const wide = hudLayout({ width: 1280, height: 448 }, model({ smallBanner: [{ alpha: 1, lines: [{ text: 'M67 Ammo', scale: 0.9 }] }] }), SIZES);
    expect(wide.rects.smallMessage!.x).toBeCloseTo(2, 5);
  });

  // PICKUP-LINE correction 3: the small window goes whenever the HUD is off. The hide-all `FUN_001f77c0` hides the
  // main message window (D:L56354) and the small one (D:L56355; D:L56356 is object 0x437540, not a message window,
  // and the subtitles window 0x436b80 is not in it; research 282 §1) -- the START menu's open, a spectator's and a
  // teammate's view -- and a dead player on his own body hides the small window too (`FUN_001f97b0` D:L57113; its
  // D:L57114 is the subtitles window).
  it('the START menu\'s hide-all hides the small window (START_MENU_HIDES; D:L56355), and the pass leaves it undrawn', () => {
    expect(START_MENU_HIDES.has('smallMessage')).toBe(true);
    const hud = new Hud();
    hud.setVisible(true);
    hud.postSmallMessage('M67 Ammo');
    hud.step(1);
    const m = hud.state().model;
    expect(hudPass(PS2, m, SIZES, hud.timing(), false, null).quads.some((q) => q.element === 'smallMessage')).toBe(true);
    expect(hudPass(PS2, { ...m, startMenu: true }, SIZES, hud.timing(), false, null).quads.some((q) => q.element === 'smallMessage')).toBe(false);
  });

  it('a spectator\'s view hides it (SPECTATOR_HIDES, the same hide-all)', () => {
    expect(SPECTATOR_HIDES.has('smallMessage')).toBe(true);
  });

  it('a teammate\'s view hides it (TEAMMATE_HIDES, derived from SPECTATOR_HIDES less the box\'s panel and icon)', () => {
    expect(TEAMMATE_HIDES.has('smallMessage')).toBe(true);
  });

  it('a dead player on his own body hides it (OWN_BODY_HIDES; D:L57113)', () => {
    expect(OWN_BODY_HIDES.has('smallMessage')).toBe(true);
  });

  it('SMALL_MESSAGE_LAYOUT_READING: a line starts at the window\'s left, x 12, whatever its width (FUN_002b5830 D:L157609-157610)', () => {
    // The take posts with the centred argument 0 (D:L473374): in a non-centred window such a line is placed at the
    // window's left, not centred on its middle. A short and a long line start at the same x.
    const left = (text: string): number => {
      const draw = hudLayout(PS2, model({ smallBanner: [{ alpha: 1, lines: [{ text, scale: 0.9 }] }] }), SIZES);
      const glyphs = draw.quads.filter((q) => q.element === 'smallMessage' && q.texture === 'font_text_01.tif');
      expect(glyphs.length).toBeGreaterThan(0);
      return Math.min(...glyphs.map((q) => q.x - q.w / 2));
    };
    const short = left('C4'), long = left('HE Grenade');
    expect(short).toBeCloseTo(long, 5);
    expect(Math.abs(short - 12)).toBeLessThan(1);           // the pen at 12; the glyph cell's own inset aside
  });
});

const READERC = fixture('RUN/READERC.ZAR');
describe.skipIf(READERC === null)(`RUN/READERC.ZAR/small_messages.rdr${READERC === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  // SMALL_MESSAGE_LAYOUT_READING's premise, a non-centred window: the window loader sets its flag bit 0 only on the
  // key "centered" (D:L158216-158219) and bit 1 on "descends" (D:L158220-158226). Neither key is in small_messages.rdr
  // nor in messages.rdr; subtitles.rdr carries "centered", the control that the reader finds the key where it is.
  it('neither small_messages.rdr nor messages.rdr carries "centered" or "descends"; subtitles.rdr carries "centered"', () => {
    const zar = Zar.parse(READERC!);
    const rdr = (name: string): RdrNode => parseRdr(zar.data(zar.find(name)!));
    for (const name of ['small_messages.rdr', 'messages.rdr']) {
      expect(rdrGet(rdr(name), 'centered'), `${name} centered`).toBeUndefined();
      expect(rdrGet(rdr(name), 'descends'), `${name} descends`).toBeUndefined();
    }
    expect(rdrGet(rdr('subtitles.rdr'), 'centered')).toBeDefined();
  });

  it('holds the values SMALL_MESSAGES carries', () => {
    const zar = Zar.parse(READERC!);
    const root = parseRdr(zar.data(zar.find('small_messages.rdr')!));
    const num = (key: string): number => Number(rdrGet(root, key));
    expect({
      left: num('left'), bottom: num('bottom'), maxlength: num('maxlength'), XMargin: num('XMargin'), YMargin: num('YMargin'),
      fadetime: num('fadetime'), scale: num('scale'), maxsize: num('maxsize'), spacing: num('spacing'),
    }).toEqual(SMALL_MESSAGES);
  });
});
