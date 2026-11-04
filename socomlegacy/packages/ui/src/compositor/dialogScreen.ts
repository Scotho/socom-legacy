import type { DialogDesign, DialogRecord, DialogSubordinate, DialogWidget, TextSpec } from '../dialog';
import { captionBytes, captionCodes, secureCodes, type CaptionSource } from '../text/captions';
import type { TextFace } from '../text/face';
import { fmul } from '../text/f32';
import { newTeletype, setTeletypeText } from '../text/teletype';
import { wrapLines } from '../text/wrapped';
import { makeModelInstance, type UiModelGeometry } from './models';
import { MovieLayer } from './movieLayer';
import {
  BACKGROUND_NAME, POPUP_NAME, addChild, findNode, newNode, newScreen, newSprite, removeChild,
  type UiContent, type UiNode, type UiScreen, type UiText,
} from './scene';
import { UI_FRAME } from './frame';

/**
 * A dialog's design built into the screen's node tree as `CGameMenu_LoadFromDesign` `FUN_00367950`
 * (D:L263398-263775) builds it (web research 112 §2; research 115 §4.3 for the steps it shares with the manager):
 *
 * 1. the background, when its type is IMAGE (0) and its bitmap is found: a 640 x 448 quad at the origin
 *    (`FUN_003646d0(0, 0, 640, 448, G+0xd0, tex)`, D:L263541-263579) on the **backplane** (+0xc4);
 * 2. MENUFADER -- the fader quad -- on the **foreplane** (+0xc8; D:L263612-263626);
 * 3. every control, each followed by its subordinates, then every object, each through `Add2dNode` `FUN_003696d0`
 *    (D:L264427-264492): its `CHILDOF` looked up by name in the screen's tree among the nodes made so far
 *    (`findNode`), else the **backplane**; placed at its `XPOS`/`YPOS` (`FUN_003157d0`), its opacity its `OPACITY`;
 * 3b. the `MODELS` entries (`FUN_00366730`, D:L263661): each model the page hands in (`BuildOptions.model`) placed
 *    before the menu's camera under the entry's node (`./models`); an entry whose model the page lacks makes none, as
 *    `FUN_00317c20`'s null does (D:L262834);
 * 4. MENUFADER taken out and appended again (D:L263660-263665), so it follows anything the build hooks added;
 * 5. the popup's node `POPUP`, appended to the foreplane last and hidden (D:L263666-263688);
 * 6. while nothing set `DAT_0049eaa0` (cleared at D:L264676 and D:L264348) the fader's alpha is 0 at once
 *    (D:L263689-263691); otherwise it stays 128 until a script lowers MENUFADER. The flag is set by the dialog's own
 *    `ANIMATIONS` (D:L263580-263611) and by each widget constructor that takes a widget's own list, run by step 3's
 *    factory (D:L264444): a button's `FUN_00376bd0` (D:L271713-271716; BUTTON, HANDLERBUTTON, CHECKBOX, SLIDERBAR,
 *    RADIOSTRIP), LISTBOX's `FUN_00375e20` (D:L271190-271192), MAPCONTROL's `FUN_0036d140` (D:L266510-266512) --
 *    `widgetSetsFlag`. Each loop runs once per element, so only a non-empty list sets it.
 *
 * Research 115 §4.3 step 5 and its "Draw order" line put the controls and the objects on the foreplane: `Add2dNode`'s
 * fallback parent is G+0xc4, the backplane (D:L264467-264468), and the screen's tick draws +0xc4 before the 3D pass and
 * +0xc8 after it (0x1f4700-0x1f4734, `FUN_00369170`) -- research 112 §2.3.
 */

export interface BuildOptions {
  /** The face a widget names, or the dialog's `FONT` (`CAPTION_FACE_DEFAULT_READING`, research 111 §7.1). */
  face?: (name: string) => TextFace | null;
  /** The caption service (PLAT-04's `LocService` fits); without one a caption is drawn as it stands. */
  captions?: CaptionSource | null;
  /** Whether a bitmap is found in the dialog's libraries (`FUN_0036a230`); all are, unless this says otherwise. */
  hasTexture?: (name: string) => boolean;
  /** A UI variable's string value (an IMAGE's or a TEXT's `UIVAR`); none until the runtime sets one. */
  uiVarString?: (name: string) => string | null;
  /** The movie layer a movie background draws into (PLAT-21's player writes it); a black one is made when absent. */
  movie?: MovieLayer;
  /** A `MODELS` entry's decoded model by name (`UI_GEO` / `UI_MDL`, the page's); absent or null: the entry is not made. */
  model?: (name: string) => UiModelGeometry | null;
}

/** `FUN_00382670`'s text fields to a text object: its caption's codes, its face, the face's alpha rule. */
function textOf(spec: TextSpec, codes: number[], face: TextFace | null): UiText {
  const t: UiText = {
    codes, face, scale: spec.scale, hcentered: spec.hcentered, rightJustified: spec.rightJustified,
    color: [...spec.color], alpha: 128, bold: false, x: 0, y: 0,
  };
  // `FUN_00362b20` (D:L260712-260723): setting the font while the alpha is 128 makes it the face's opacity x 128.
  if (face && t.alpha === 128) t.alpha = fmul(face.opacity, 128);
  return t;
}

/** What an object or control draws, from its widget (the factories' types; the rest are PLAT-15's). */
function contentOf(w: DialogWidget, record: DialogRecord, design: DialogDesign, o: BuildOptions): UiContent {
  const face = (name: string | null): TextFace | null => {
    const n = name ?? design.font;
    return n === null ? null : o.face?.(n) ?? null;
  };
  const caption = (c: string | null, uivar: string | null): string | null =>
    (uivar !== null ? o.uiVarString?.(uivar) ?? null : c);
  switch (w.type) {
    case 'IMAGE': {
      // `FUN_00382ff0` (D:L278129-278185): the bitmap named by FILENAME, or by the UIVAR's string when it has one.
      const name = w.uivar ? o.uiVarString?.(w.uivar.name ?? '') ?? null : w.image.filename;
      const found = name !== null && (o.hasTexture?.(name) ?? true);
      const s = newSprite(found ? name : null, w.image.size[0], w.image.size[1]);
      // `FUN_00379080` (D:L272917-272946): PULSE's flag and period, the phase 0.
      if (w.image.pulse !== null) s.pulse = { period: w.image.pulse, phase: 0 };
      return { kind: 'sprite', sprite: s };
    }
    case 'TEXT': case 'CLOCK': case 'SECURETEXT': {
      const c = caption(w.text.caption, w.uivar?.name ?? null);
      let codes = c === null ? [] : captionCodes(c, o.captions ?? null).codes;
      if (w.type === 'SECURETEXT') codes = secureCodes(codes);
      return { kind: 'text', text: textOf(w.text, codes, face(w.text.font)) };
    }
    case 'WRAPPEDTEXT': {
      const f = face(w.text.font);
      const c = caption(w.text.caption, w.uivar?.name ?? null);
      const lines = f && c !== null ? wrapLines(f, captionBytes(c, o.captions ?? null), { width: w.width, scale: w.text.scale, color: w.text.color }) : [];
      return {
        kind: 'wrapped', text: textOf(w.text, [], f), lines, scroll: 0, prevRows: 0,
        spec: { width: w.width, spacing: w.spacing, height: w.height, autoScroll: w.autoScroll, displayOneLine: w.displayOneLine, scale: w.text.scale, color: w.text.color },
      };
    }
    case 'TELETYPE': {
      const f = face(w.text.font);
      const state = newTeletype();
      const c = caption(w.text.caption, w.uivar?.name ?? null);
      if (c !== null) setTeletypeText(state, captionCodes(c, o.captions ?? null).codes);
      return {
        kind: 'teletype', text: textOf(w.text, [], f), state,
        spec: { interval: w.interval, maxLength: w.maxLength, maxHeight: w.maxHeight, spacing: w.spacing, pulseRate: w.pulseRate, noCursor: w.noCursor, fadeCursor: w.fadeCursor, scale: w.text.scale },
      };
    }
    default: return { kind: 'widget', record };
  }
}

/** Whether the widget's constructor sets `DAT_0049eaa0`: its own `ANIMATIONS` list is not empty (step 6). */
function widgetSetsFlag(w: DialogWidget): boolean {
  if ('button' in w) return w.button.bindings.length > 0;
  if (w.type === 'LISTBOX' || w.type === 'MAPCONTROL') return w.bindings.length > 0;
  return false;
}

/** `FUN_003696d0`: a record's node, under its `CHILDOF` among the nodes made so far, else the backplane. */
function add2dNode(screen: UiScreen, record: DialogRecord, content: UiContent): UiNode {
  const node = newNode(record.name, content);
  node.x = record.x; node.y = record.y; node.opacity = record.opacity;
  const parent = record.childOf ? findNode(screen.root, record.childOf) : null;
  addChild(parent ?? screen.backplane, node);
  return node;
}

/** A subordinate as `FUN_003696d0` takes it: a record of its own. */
const subRecord = (s: DialogSubordinate): DialogRecord =>
  ({ name: s.name, type: s.type, x: s.x, y: s.y, opacity: s.opacity, childOf: s.childOf, widget: s.widget });

/** `FUN_00367950`: the screen for a design. */
export function buildDialogScreen(design: DialogDesign, o: BuildOptions = {}): UiScreen {
  const screen = newScreen();
  const bg = design.background;
  if (bg && bg.type === 0 && bg.filename !== null && (o.hasTexture?.(bg.filename) ?? true)) {
    const node = newNode(BACKGROUND_NAME, { kind: 'sprite', sprite: newSprite(bg.filename, UI_FRAME.width, UI_FRAME.height) });
    addChild(screen.backplane, node);
    screen.background = node;
  }
  // G+0x279 (has a movie background): types 1 (MPEG) and 2 (MPEG_LOOPING), D:L263746-263764.
  if (bg && (bg.type === 1 || bg.type === 2)) screen.movie = o.movie ?? new MovieLayer();
  addChild(screen.foreplane, screen.fader);
  const subsOf = (w: DialogWidget): DialogSubordinate[] =>
    (w.type === 'RADIOSTRIP' ? w.subordinates : w.type === 'HANDLERBUTTON' && w.subordinate ? [w.subordinate] : []);
  for (const c of design.controls) {
    const node = add2dNode(screen, c, contentOf(c.widget, c, design, o));
    if (c.hidden) node.visible = false;                         // CPS-4b's hidden record (an adaptation): the walk passes it and its boxes
    const w = c.widget;
    for (const s of subsOf(w)) add2dNode(screen, subRecord(s), contentOf(s.widget, subRecord(s), design, o));
  }
  for (const ob of design.objects) add2dNode(screen, ob, contentOf(ob.widget, ob, design, o));
  if (o.model) for (const m of design.models) { const inst = makeModelInstance(m, o.model, o.uiVarString); if (inst) screen.models.push(inst); }   // step 3b (USEMODELUIVAR: the variable's string names the model)
  removeChild(screen.foreplane, screen.fader);
  addChild(screen.foreplane, screen.fader);
  const popup = newNode(POPUP_NAME);
  popup.visible = false;
  addChild(screen.foreplane, popup);
  screen.popup = popup;
  const flag = design.bindings.length > 0
    || [...design.controls, ...design.objects].some((r) => widgetSetsFlag(r.widget) || subsOf(r.widget).some((s) => widgetSetsFlag(s.widget)));
  if (!flag && screen.fader.content?.kind === 'sprite') screen.fader.content.sprite.alpha = 0;
  return screen;
}
