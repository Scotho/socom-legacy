import type { DialogBinding } from '../dialog';
import type { CaptionSource } from '../text/captions';
import type { TextFace } from '../text/face';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { UiDrawItem } from '../compositor/drawList';
import type { WidgetPad } from './pad';

/**
 * What a widget asks of the screen around it (web research 117), and the shape every widget shares. A widget is data:
 * it keeps its run-time fields, answers a pad record and a command, ticks by a `dt` it is given (PLAT-12's clock, W9.R10)
 * and draws as draw-list items (PLAT-14's), never a canvas call.
 */

/** The two UI sounds a widget plays: `FUN_0036a2c0` (D:L264855-264862) SELECTION, `FUN_0036a300` (D:L264867-264874) TELETYPE. */
export type WidgetSound = 'SELECTION' | 'TELETYPE';

/**
 * The screen's side: PLAT-07's runtime starts animations, PLAT-23's resolution plays sounds, PLAT-10's manager fires
 * the screen's event bindings. A widget never reaches them otherwise.
 */
export interface WidgetHost {
  /**
   * `FUN_0026a250(0x414bb0, name, 0)` then, when found, `FUN_002734b0(anim, 0)` without an argument or
   * `FUN_00272bb0(anim, 1, 8, argument, 0)` with one: the named animation started. False when it was not found.
   */
  animation(name: string | null, argument: string | null): boolean;
  /** `FUN_0026a250(0x414bb0, name, 0)` alone: whether the named animation is found (nothing started). */
  hasAnimation(name: string | null): boolean;
  sound(name: WidgetSound): void;
  /** `FUN_00367810(screen, code, 0)` (D:L263359-263397): every screen-level `EVENT` binding of `code`. */
  screenEvent(code: number): void;
}

/** What a widget reads while it is built and when a command runs: the text, the variables, the valves. */
export interface WidgetContext {
  /** A face by name (`fonts.rdr`, PLAT-13's `readTextFaces`); null when none. */
  face: (name: string) => TextFace | null;
  /** The dialog's `FONT`, the face a widget without its own takes. */
  font: string | null;
  captions: CaptionSource | null;
  uiVars: UiVarManager | null;
  valves: ValveStore | null;
  /** A UIMnLOC string by id (a `Caption` command's s16 at +0xc); null when not known. */
  locText: (id: number) => string | null;
  /** `names[index]` of the command's animation (a LISTBOX's `UIVAR` byte at +0x10); null when not known. */
  name: (cmd: ZAnimUiCommand, index: number) => string | null;
  /** Whether a bitmap is found in the dialog's libraries (`FUN_0036a230`); all are, unless this says otherwise. */
  hasTexture: (name: string) => boolean;
  /**
   * An animation of the dialog's scripts started by name with its argument, for a widget that starts one outside its
   * host's calls: a LISTBOX's `EVENT ON_UPDATE_UIVAR` bindings after its array var rebuilt the items (`FUN_003754d0`
   * D:L270808-270822: `FUN_0026a250(0x414bb0, name, 0)` -- the script library, not the screen -- then `FUN_002734b0` /
   * `FUN_00272bb0`), the attach-time fire during the build among them (`FUN_00375e20` D:L271185-271186). False when
   * the name is not found; absent: none starts. (ONL-01's `host` option and ONL-04's `animation` merged into this one,
   * 2026-10-03: the original's call is a lookup-and-start by name, which needs no host object.)
   */
  animation?: (name: string, argument: string | null) => boolean;
}

/** A command a widget's own handler (run-time vtable +0x64) takes: its answer, or null when it is not its op. */
export type WidgetCommandAnswer = { answer: boolean } | null;

/** Every widget's entries; a non-control answers no pad and takes no focus. */
export interface Widget {
  readonly name: string;
  readonly type: string;
  /** The run-time vtable +0x38. */
  tick(dt: number, host: WidgetHost): void;
  /** +0x44: handled or not (the screen sees what is not); `focus` the index of the child that has it (its third argument). */
  input(pad: WidgetPad, host: WidgetHost, focus?: number): boolean;
  /** +0x50 / +0x54: the focus arrives / leaves (PLAT-11 decides when). */
  setActive(host: WidgetHost): void;
  setNormal(): void;
  /** +0x64 by the op +0x68 names. */
  command(cmd: ZAnimUiCommand, host: WidgetHost): WidgetCommandAnswer;
  /** +0x10: what it draws at the node's place in the frame, `opacity` the walk's (PLAT-14's `drawnAlpha` input). */
  draw(x: number, y: number, opacity: number): UiDrawItem[];
}

/** `FUN_00274870(0)` (D:L121434): a node command's byte +6 is its op plus this. */
export const NODE_OP_BASE = 0xe8;

/** A node command's op: byte +6 less `NODE_OP_BASE` (`FUN_0036fcc0` D:L268030-268032). */
export const nodeOp = (cmd: ZAnimUiCommand): number => (cmd.opcodeByte - NODE_OP_BASE) & 0xff;

/** The u16 at `off` of the command (little-endian, the EE's). */
export const commandU16 = (cmd: ZAnimUiCommand, off: number): number => (cmd.bytes[off] ?? 0) | ((cmd.bytes[off + 1] ?? 0) << 8);

/** A binding's animation started with its own `ARGUMENT` (`FUN_002734b0` / `FUN_00272bb0`). */
export const startBinding = (host: WidgetHost, b: Pick<DialogBinding, 'animation' | 'argument'>): boolean => host.animation(b.animation, b.argument);

/**
 * `FUN_003860f0` (D:L279730-279791, research 104): a var printed as its type prints it -- `%d`, `%f`, `%s` (the ELF's
 * 0x3fa4b0, 0x3fa4b8, 0x3fa4c0) -- into a buffer of `size` bytes: an integer or a real only when more than 15 are
 * left, a string only when its length + 2 is less, an array only when more than 5 are left, its elements printed in
 * turn at the end of what is there, each with what is left (ONL-04: SERVER_NEWS is an array of texts, research 147).
 * The type-0 node prints nothing (null at the top). Without `size`, no limit.
 */
export function printUiVar(v: UiVarValue, size = Number.POSITIVE_INFINITY): string | null {
  switch (v.type) {
    case 'int': return size > 15 ? String(Math.trunc(v.value)) : '';
    case 'real': return size > 15 ? v.value.toFixed(6) : '';
    case 'string': return v.value.length + 2 < size ? v.value : '';
    case 'array': {
      let out = '';
      if (size > 5) for (const e of v.value) out += printUiVar(e, size - out.length) ?? '';
      return out;
    }
    default: return null;
  }
}

/**
 * TEXT_UIVAR_FORMAT_CUT_READING: a TEXT's, SECURETEXT's or WRAPPEDTEXT's var callback (`FUN_00379260` D:L272983-273011)
 * hands the printed value to the text's +0x78, `FUN_00363830` (WRAPPEDTEXT's vtable 0x4079e0 read in the ELF, research
 * 117 §13.8), which copies it up to the first "$~" and ends it there (D:L261214-261243, research 154 §7) before its
 * +0x70. TEXT's (vtable 0x407a90) and SECURETEXT's (vtable 0x406fa0) +0x78 are 0x363830 too, read in the ELF (the
 * fresh review, 2026-10-29).
 * So CREATE GAME's `gamename_val` draws "test", not GAMENAMEVAR's whole `test$~<room>`. [reading]
 */
export const TEXT_UIVAR_FORMAT_CUT_READING = 'the printed var cut at its first "$~" (FUN_00363830) for TEXT, SECURETEXT and WRAPPEDTEXT' as const;

/** `FUN_00363830`'s cut (D:L261214-261243): a text up to its first "$~" (`TEXT_UIVAR_FORMAT_CUT_READING`). */
export function formatSetterCut(text: string): string {
  const cut = text.indexOf('$~');
  return cut < 0 ? text : text.slice(0, cut);
}

/**
 * UIVAR_SPEC_TOKEN_READING: a widget's `UIVAR` `VALUE` (`CUIVariableSpec`, `FUN_00386ff0`) as the var's node. The
 * engine's reader gives the token's node type; `parseRdr` keeps none (`TOKEN_TYPE_READING`, research 105 §1), so an
 * integer-spelled token is taken as an int, another number-spelled one as a real, any other as a string, a list as an
 * array of those -- the rule `SHORT_GLYPH_CODE_READING` applies to a font's tokens (research 111 §1.2). [reading]
 */
export const UIVAR_SPEC_TOKEN_READING = 'integer-spelled: int; number-spelled: real; else string; a list: an array' as const;

export function uiVarValueOfSpec(node: unknown): UiVarValue | null {
  if (node === null || node === undefined) return null;
  if (Array.isArray(node)) {
    const out: UiVarValue[] = [];
    for (const e of node) { const v = uiVarValueOfSpec(e); if (v) out.push(v); }
    return { type: 'array', value: out };
  }
  if (typeof node !== 'string') return null;
  if (/^[-+]?\d+$/.test(node)) return { type: 'int', value: Number.parseInt(node, 10) };
  if (node.trim() !== '' && Number.isFinite(Number(node))) return { type: 'real', value: Math.fround(Number(node)) };
  return { type: 'string', value: node };
}
