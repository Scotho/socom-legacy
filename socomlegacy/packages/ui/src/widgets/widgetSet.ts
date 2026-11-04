import type { DialogDesign, DialogRecord, DialogWidget } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { findNode, stepImagePulse, type UiNode, type UiScreen } from '../compositor/scene';
import { captionBytes, secureCodes, type CaptionSource } from '../text/captions';
import type { TextFace } from '../text/face';
import { scrollWrapped, wrapLines } from '../text/wrapped';
import { setTeletypeText, teletypeOp, tickTeletype } from '../text/teletype';
import type { UiVariable, UiVarManager } from '../uiVars';
import type { ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { baseTextCommand, ButtonWidget, textCodes } from './button';
import { CheckboxWidget } from './checkbox';
import { CounterWidget } from './counter';
import { formatSetterCut, nodeOp, printUiVar, uiVarValueOfSpec, type Widget, type WidgetCommandAnswer, type WidgetContext, type WidgetHost } from './host';
import { ListboxWidget } from './listbox';
import type { WidgetPad } from './pad';
import { ProgressBarWidget } from './progressBar';
import { RadioStripWidget } from './radioStrip';
import { SliderWidget } from './slider';

/**
 * A dialog's widgets (PLAT-15; web research 117): every control and object of a design that has run-time state, made
 * from PLAT-05's records beside the node tree PLAT-14 builds (`buildDialogScreen`), ticked, driven and drawn as data.
 *
 * - The controls PLAT-14 leaves as `widget` items -- BUTTON, SLIDERBAR, CHECKBOX, RADIOSTRIP, LISTBOX -- and the objects
 *   PROGRESSBAR and COUNTER are widgets here; `draw` puts each one's quads and glyphs in its item's place.
 * - TEXT, SECURETEXT, IMAGE and WRAPPEDTEXT are drawn by PLAT-14 from their node's content; this set ticks an IMAGE's
 *   `PULSE`, follows a TEXT's or an IMAGE's `UIVAR`, and runs their commands (`Caption`, `Valve`, `Scroll_Up`,
 *   `Scroll_Down`) on that content.
 * - `PERMANENT` is not a widget type: it is a UIVAR's longevity word (research 96 R96.4, research 117 R117.15).
 * - A TELETYPE is PLAT-13's (`../text/teletype`), drawn by PLAT-14 from its node's content; this set ticks it with the
 *   widgets and runs its commands on that content (ONL-09: `dlgWorldOfSOCOM.rdr`'s `O_filters`, research 158 §2.4).
 * - Not PLAT-15's: MAPCONTROL (MENU-16), HANDLERBUTTON, SCROLLINGTEXT and CLOCK (no dialog uses them), MPEG (PLAT-21's
 *   movie layer).
 * - Every element's enabled bit is reached here by its record (`enabled`, `setEnabled`): the widget's own where it
 *   keeps one, else the bit its class is built with (`ENABLED_AT_BUILD`) -- the focus ring's test (research 116 §17).
 *
 * Which control has the focus and when a held button repeats is PLAT-11's: `input` takes the control and the record.
 */

export interface WidgetOptions {
  face?: (name: string) => TextFace | null;
  captions?: CaptionSource | null;
  uiVars?: UiVarManager;
  valves?: ValveStore;
  locText?: (id: number) => string | null;
  name?: (cmd: ZAnimUiCommand, index: number) => string | null;
  hasTexture?: (name: string) => boolean;
  /** `WidgetContext.animation`: the dialog's scripts' animation by name (a LISTBOX's ON_UPDATE_UIVAR); absent, none starts. */
  animation?: (name: string, argument: string | null) => boolean;
}

/** The types this set makes a widget of. */
/** `FUN_00379260`'s print size: `FUN_003860f0(var, buffer, 0x2903)` (D:L273005), its stack buffer 0x2910 bytes. */
export const VAR_PRINT_BYTES = 0x2903;

export const WIDGET_TYPES = ['BUTTON', 'SLIDERBAR', 'CHECKBOX', 'RADIOSTRIP', 'LISTBOX', 'PROGRESSBAR', 'COUNTER'] as const;

/**
 * The enabled bit (+0x14 bit 7) an element is left with by its class's creation (FOCUS-RING; web research 116 §17).
 * Every class answers "enabled" (vtable +0x48) with the base element's reader 0x1fe270 -- the bit and nothing else, read
 * in the ELF for all sixteen classes -- so what a control answers when the dialog is built is what its constructor and
 * its set-up wrote:
 * - the base element's constructor sets it (`FUN_00365100` D:L262189-262204);
 * - the plain bitmap's constructor clears it through its own +0x4c (`FUN_0020cd50` D:L65834-65853; its inline copies in
 *   the IMAGE record's create `FUN_00382ff0` D:L278176 and the PROGRESSBAR's `FUN_0037e470` D:L275672);
 * - the text's set-up clears it (`FUN_003792f0` D:L273066), and every text class is set up through it: TEXT
 *   (`FUN_00388a60`), SECURETEXT (`FUN_003887b0`), TELETYPE (`FUN_00378b00` D:L272770), WRAPPEDTEXT (`FUN_0037a430`
 *   D:L273569), COUNTER (`FUN_00381be0` D:L277478), CLOCK (`FUN_0037d220` D:L274962);
 * - a LISTBOX is a plain bitmap whose create sets the bit again (`FUN_0037e8b0` D:L275854);
 * - the button family (`FUN_00377800`: BUTTON, HANDLERBUTTON, SLIDERBAR, CHECKBOX, RADIOSTRIP) and the MAPCONTROL
 *   (`FUN_0036d850`) keep the base's bit; a SCROLLINGTEXT is built on the text's constructor (`FUN_0027f250`) without
 *   the text's set-up (its own, 0x370340, is `jr ra` in the ELF), so it keeps the bit too (no dialog on the disc lists
 *   one under `CONTROLS`).
 * Nothing else writes it: the base constructor, then +0x4c alone (0x1fde10; the button family's `FUN_00377380`, which
 * also restyles) -- reached after the build by the queue's records 7 and 8 (`EnableButton` / `DisableButton`,
 * D:L262291-262316), which find an element of any class by its node's name.
 */
export const ENABLED_AT_BUILD: Readonly<Record<DialogWidget['type'], boolean>> = {
  BUTTON: true, HANDLERBUTTON: true, SLIDERBAR: true, CHECKBOX: true, RADIOSTRIP: true, LISTBOX: true, MAPCONTROL: true, SCROLLINGTEXT: true,
  IMAGE: false, PROGRESSBAR: false, TEXT: false, SECURETEXT: false, TELETYPE: false, WRAPPEDTEXT: false, COUNTER: false, CLOCK: false,
};

export class WidgetSet {
  private readonly byName = new Map<string, Widget>();
  private readonly byWidget = new Map<DialogWidget, Widget>();
  private readonly order: Widget[] = [];
  /** The stateless objects' nodes, by name (PLAT-14's content), with their records. */
  private readonly plain = new Map<string, { node: UiNode; widget: DialogWidget }>();
  /** The record a name finds: the first made under it (CONTROLS, each with its subordinates, then OBJECTS; D:L263627-263658). */
  private readonly specs = new Map<string, DialogWidget>();
  /** +0x14 bit 7 of the elements whose widget keeps none (a type no widget is made of; PROGRESSBAR, COUNTER), once written. */
  private readonly bits = new Map<DialogWidget, boolean>();

  private constructor(readonly ctx: WidgetContext) {}

  static build(design: DialogDesign, screen: UiScreen, o: WidgetOptions = {}): WidgetSet {
    const ctx: WidgetContext = {
      face: o.face ?? (() => null), font: design.font, captions: o.captions ?? null, uiVars: o.uiVars ?? null, valves: o.valves ?? null,
      locText: o.locText ?? (() => null), name: o.name ?? (() => null), hasTexture: o.hasTexture ?? (() => true),
      animation: o.animation,
    };
    const set = new WidgetSet(ctx);
    for (const r of design.controls) set.add(r.name, r.widget, screen);
    for (const r of design.objects) set.add(r.name, r.widget, screen);
    return set;
  }

  private register(name: string, spec: DialogWidget, w: Widget): Widget {
    if (!this.byName.has(name)) this.byName.set(name, w);
    this.byWidget.set(spec, w);
    this.order.push(w);
    return w;
  }

  private add(name: string, spec: DialogWidget, screen: UiScreen): Widget | null {
    const ctx = this.ctx;
    if (!this.specs.has(name)) this.specs.set(name, spec);
    switch (spec.type) {
      case 'BUTTON': return this.register(name, spec, new ButtonWidget(name, 'BUTTON', spec.button, ctx, spec.uivar));
      case 'SLIDERBAR': return this.register(name, spec, new SliderWidget(name, spec, ctx));
      case 'CHECKBOX': return this.register(name, spec, new CheckboxWidget(name, spec, ctx));
      case 'RADIOSTRIP': {
        // CGameMenu_LoadFromDesign makes the strip, then its subordinates (D:L263627-263658): here the children first,
        // so the strip holds them; the order of ticks is the design's either way.
        const strip = new RadioStripWidget(name, spec, ctx, []);
        this.register(name, spec, strip);
        const children: Widget[] = [];
        for (const s of spec.subordinates) { const c = this.add(s.name, s.widget, screen); if (c) children.push(c); }
        strip.children = children;
        return strip;
      }
      case 'LISTBOX': return this.register(name, spec, new ListboxWidget(name, spec, ctx));
      case 'PROGRESSBAR': return this.register(name, spec, new ProgressBarWidget(name, spec, ctx));
      case 'COUNTER': return this.register(name, spec, new CounterWidget(name, spec, ctx));
      case 'TEXT': case 'SECURETEXT': case 'IMAGE': case 'WRAPPEDTEXT': {
        const node = findNode(screen.root, name);
        if (node && !this.plain.has(name)) { this.plain.set(name, { node, widget: spec }); this.follow(node, spec); }
        return null;
      }
      case 'TELETYPE': {
        const node = findNode(screen.root, name);
        if (node && !this.plain.has(name)) this.plain.set(name, { node, widget: spec });
        return null;
      }
      default: return null;
    }
  }

  /**
   * A TEXT's or SECURETEXT's `UIVAR` printed into it (`FUN_00379260` D:L272983-273011); an IMAGE's string one names its
   * bitmap (`FUN_00379160` D:L272950-272978). A WRAPPEDTEXT's is the same `FUN_00379260` (its second vtable's +0xa4,
   * 0x407a84 in the ELF): the value printed, through +0x78 (`FUN_00363830`, a format into the setter) to its +0x70, the
   * wrapping setter `FUN_00379f70`; its +0xa0 (0x37a630) is `jr ra`. Both print through `FUN_003860f0` into a 0x2903-byte
   * buffer (`VAR_PRINT_BYTES`, D:L273005): what does not fit what is left is not printed (`printUiVar`). The +0x78 cuts
   * the printed text at its first "$~" (`TEXT_UIVAR_FORMAT_CUT_READING`).
   */
  private follow(node: UiNode, spec: DialogWidget): void {
    const vars = this.ctx.uiVars, u = spec.uivar;
    if (!vars || !u || u.name === null) return;
    const v = vars.add(u.name, uiVarValueOfSpec(u.value), u.longevity);
    // The set-up attaches the item and tells it at once (`FUN_003792f0` D:L273072-273077: `FUN_00385df0`, then the
    // attachment's vtable +0xc with the var), so a var set before the build -- the main's `VERSION_STRING` -- shows.
    const listener = (x: UiVariable): void => {
      const c = node.content;
      if (c?.kind === 'wrapped' && spec.type === 'WRAPPEDTEXT') {
        const s = printUiVar(x.value, VAR_PRINT_BYTES);
        if (s !== null) this.rewrap(c, captionBytes(formatSetterCut(s), this.ctx.captions));
      } else if (c?.kind === 'text' && (spec.type === 'TEXT' || spec.type === 'SECURETEXT')) {
        const s = printUiVar(x.value, VAR_PRINT_BYTES);
        if (s === null) return;
        const codes = textCodes(this.ctx, formatSetterCut(s));
        c.text.codes = spec.type === 'SECURETEXT' ? secureCodes(codes) : codes;
      } else if (c?.kind === 'sprite' && spec.type === 'IMAGE' && x.value.type === 'string' && x.value.value !== c.sprite.texture) {
        if (this.ctx.hasTexture(x.value.value)) c.sprite.texture = x.value.value;
      }
    };
    vars.attach(v, listener);
    listener(v);
  }

  get(name: string): Widget | undefined { return this.byName.get(name); }
  /** The widget made of a record; undefined for a type this set makes none of. */
  of(spec: DialogWidget): Widget | undefined { return this.byWidget.get(spec); }
  /** The record a node's name finds (the first made under it), or undefined: a node that is no record's (the popup, the fader). */
  specOf(name: string): DialogWidget | undefined { return this.specs.get(name); }

  /**
   * Slot +0x48 (0x1fe270 for every class): the element's enabled bit -- the widget's own where it keeps one (the button
   * family, the LISTBOX), else what the class's creation left (`ENABLED_AT_BUILD`) or a record 7 / 8 wrote since.
   */
  enabled(spec: DialogWidget): boolean {
    const w = this.byWidget.get(spec);
    if (w && 'enabled' in w) return Boolean((w as { enabled: unknown }).enabled);
    return this.bits.get(spec) ?? ENABLED_AT_BUILD[spec.type];
  }

  /** Slot +0x4c (0x1fde10; the button family's `FUN_00377380`): the bit written, whatever the class. */
  setEnabled(spec: DialogWidget, on: boolean): void {
    const w = this.byWidget.get(spec);
    if (w && 'setEnabled' in w && typeof w.setEnabled === 'function') (w.setEnabled as (on: boolean) => void)(on);
    else this.bits.set(spec, on);
  }
  all(): readonly Widget[] { return this.order; }

  /** Every widget's tick, in the design's order, every IMAGE's `PULSE` (`FUN_00378fc0` D:L272892-272914) and every TELETYPE's typing. */
  tick(dt: number, host: WidgetHost): void {
    for (const w of this.order) w.tick(dt, host);
    for (const { node } of this.plain.values()) {
      const c = node.content;
      if (c?.kind === 'sprite' && c.sprite.pulse) stepImagePulse(c.sprite, dt);
      else if (c?.kind === 'teletype' && c.text.face) {
        // The TELETYPE's tick `FUN_00377b80` (D:L272245-272532): the type sound (`FUN_0036a300`) and `ON_TTY_DONE`.
        const t = tickTeletype(c.state, c.text.face, c.spec, dt);
        if (t.sound) host.sound('TELETYPE');
        for (const e of t.events) host.screenEvent(e);
      }
    }
  }

  /**
   * The pad record to the named control (the one PLAT-11 says has the focus): handled or not. `focus` is +0x44's third
   * argument, the index of the child a control with children hands the record to (`FUN_00377040` D:L271933-271941).
   */
  input(name: string, pad: WidgetPad, host: WidgetHost, focus = 0): boolean {
    return this.byName.get(name)?.input(pad, host, focus) ?? false;
  }

  /**
   * A node command (PLAT-08's `UiNodeCommandHandler`, `FUN_002745a0` D:L121370-121385): the named node's object takes
   * it by its op, or declines (null) and the command falls to the table.
   */
  nodeCommand(cmd: ZAnimUiCommand, host: WidgetHost): WidgetCommandAnswer {
    if (cmd.node === null) return null;
    const w = this.byName.get(cmd.node);
    if (w) return w.command(cmd, host);
    const p = this.plain.get(cmd.node);
    if (!p) return null;
    const c = p.node.content;
    if (c?.kind === 'text') {
      const codes = baseTextCommand(cmd, this.ctx);
      if (codes === null) return null;
      c.text.codes = p.widget.type === 'SECURETEXT' ? secureCodes(codes) : codes;  // FUN_0036aff0 masks every path
      return { answer: true };
    }
    if (c?.kind === 'teletype' && p.widget.type === 'TELETYPE') {
      // `FUN_00378600` (D:L272607-272656): the class's ops 4-7 (`Continue`, `scroll_up`, `scroll_down`, `finish`; the
      // names `FUN_00378460`), then the base's `FUN_0036fcc0`: Caption and Valve into the setter +0x70, `FUN_00378a10`.
      const op = nodeOp(cmd), face = c.text.face;
      if (op >= 4 && op <= 7) {
        if (!face) return null;
        const r = teletypeOp(c.state, face, c.spec, (['Continue', 'scroll_up', 'scroll_down', 'finish'] as const)[op - 4]!);
        for (const e of r.events) host.screenEvent(e);
        return r.result ? { answer: true } : null;
      }
      const codes = baseTextCommand(cmd, this.ctx);
      if (codes === null) return null;
      setTeletypeText(c.state, codes);
      return { answer: true };
    }
    if (c?.kind === 'wrapped' && p.widget.type === 'WRAPPEDTEXT') {
      // `FUN_00379b10` (D:L273272-273303), the ops of `FUN_00379970` (D:L273198-273254): 4 Scroll_Up, 5 Scroll_Down; else the base's.
      const op = nodeOp(cmd);
      if (op === 4 || op === 5) { c.scroll = scrollWrapped(c.spec, c.scroll, c.prevRows, op === 4 ? 'Scroll_Up' : 'Scroll_Down'); return { answer: true }; }
      if (op === 1 || op === 2) {
        // `FUN_0036fcc0`: Caption by name and Valve into +0x70; Caption by id into +0x74 (`FUN_00363460`), which calls +0x70.
        this.rewrap(c, op === 1 && cmd.loc === 0 ? captionBytes(cmd.arg, this.ctx.captions) : String.fromCharCode(...(baseTextCommand(cmd, this.ctx) ?? [])));
        return { answer: true };
      }
    }
    return null;
  }

  /** A WRAPPEDTEXT's setter +0x70 (`FUN_00379f70`): the text into lines; with `AUTOSCROLL` the scroll back to 0. */
  private rewrap(c: Extract<NonNullable<UiNode['content']>, { kind: 'wrapped' }>, text: string): void {
    const face = c.text.face;
    c.lines = face ? wrapLines(face, text, { width: c.spec.width, scale: c.spec.scale, color: c.spec.color }) : [];
    if (c.spec.autoScroll) c.scroll = 0;
  }

  /**
   * PLAT-14's draw list with each `widget` item replaced, in its place, by its widget's quads and glyphs. A control this
   * set does not make (MAPCONTROL, MENU-16's) keeps its item, and is named in `undrawn`.
   */
  draw(items: readonly UiDrawItem[]): { items: UiDrawItem[]; undrawn: string[] } {
    const out: UiDrawItem[] = [], undrawn: string[] = [];
    for (const it of items) {
      if (it.kind !== 'widget') { out.push(it); continue; }
      const w = this.byWidget.get(it.record.widget);
      if (!w) { out.push(it); undrawn.push(`widget ${it.node} (${it.record.type ?? 'untyped'})`); continue; }
      out.push(...w.draw(it.x, it.y, it.opacity));
    }
    return { items: out, undrawn };
  }
}

/** A record's widget, when this set makes one of its type. */
export const isWidgetRecord = (r: DialogRecord): boolean => (WIDGET_TYPES as readonly string[]).includes(r.widget.type);
