/**
 * MENU-09's readers (web research 114): what opens -- or would open -- the three dialogs no menu flow reaches,
 * `dlgExitState`, `dlgHype` and `dlgStickSetup`. Pure: an `ElfImage` and PLAT-06's dialog and set facts come in as
 * parameters; `tools/test/unplacedDialogs.test.ts` runs them on made-up input in CI and on the disc's ELF and archives
 * where the disc is present. Names and addresses only; no bytes leave the disc.
 */
import type { ElfImage } from './elfImage';
import type { DialogFacts, SetFacts } from './dialogInventory';

/**
 * `CExitMenu`'s vtable: installed by its constructor's tail in `FUN_001f1bb0` (D:L53485) and by its destructor
 * `FUN_001f1ae0` (D:L53424), at the menu's +0x910. Word 0 is the type descriptor (0x3e2cd0, naming `CExitMenu`
 * 0x3e2c98), word 1 the offset, then the slots (research 114 §1.2).
 */
export const EXIT_MENU_VTABLE_VA = 0x404ff0;

/** `CExitState`'s vtable: set last by its constructor `FUN_001f1d70` (D:L53523); descriptor 0x3e29d8 -> `CExitState`. */
export const EXIT_STATE_VTABLE_VA = 0x404fc0;

/**
 * The slot a `CGameMenu` returns its dialog's file name from: `FUN_00368570` (the menu's start, D:L263797) calls the
 * menu vtable's +0x10 and hands the result to the dialog loader `FUN_00367430` (D:L263798).
 */
export const MENU_DIALOG_SLOT = 0x10;

/** The class a GCC 2.x vtable names: its word 0 is the type descriptor, whose word 0 points at the class name. */
export function vtableClass(elf: ElfImage, vtable: number): string {
  return elf.cstr(elf.u32(elf.u32(vtable)));
}

const JR_RA = 0x03e00008;

/**
 * The address a three-instruction getter returns -- `lui rX,hi` / `jr ra` / `addiu rX,rX,lo` in the delay slot,
 * rX the return register v0 -- as hi << 16 plus lo sign-extended; null for any other code.
 */
export function luiAddiuReturn(elf: ElfImage, fn: number): number | null {
  const a = elf.u32(fn), b = elf.u32(fn + 4), c = elf.u32(fn + 8);
  const V0 = 2;
  const isLui = a >>> 26 === 0x0f && ((a >>> 21) & 31) === 0 && ((a >>> 16) & 31) === V0;
  const isAddiu = c >>> 26 === 0x09 && ((c >>> 21) & 31) === V0 && ((c >>> 16) & 31) === V0;
  if (!isLui || b !== JR_RA || !isAddiu) return null;
  const lo = c & 0xffff;
  return (((a & 0xffff) << 16) + (lo & 0x8000 ? lo - 0x10000 : lo)) >>> 0;
}

/** The dialog file a `CGameMenu` vtable's +0x10 getter returns, or null when that slot is not such a getter. */
export function menuDialogName(elf: ElfImage, vtable: number): string | null {
  const va = luiAddiuReturn(elf, elf.u32(vtable + MENU_DIALOG_SLOT));
  return va === null ? null : elf.cstr(va);
}

/** Where an animation is defined and what could start it, matched without case as the engine's lookups are. */
export interface AnimationStarters {
  /** `archive:set` of every named set that defines it. */
  definedIn: string[];
  /** `dialog owner trigger` of every READERC binding (screen or control) whose ANIMATION is it. */
  bindings: string[];
  /** `archive:set/animation` of every animation whose CALL_ANIMATION names it. */
  calls: string[];
}

export function animationStarters(dialogs: readonly DialogFacts[], sets: readonly SetFacts[], animation: string): AnimationStarters {
  const is = (s: string): boolean => s.toLowerCase() === animation.toLowerCase();
  return {
    definedIn: sets.filter((s) => s.anims.some((a) => is(a.name))).map((s) => `${s.archive}:${s.name}`),
    bindings: dialogs.flatMap((d) => d.bindings.filter((b) => is(b.animation)).map((b) => `${d.name} ${b.owner} ${b.trigger}`)),
    calls: sets.flatMap((s) => s.anims.filter((a) => a.calls.some(is)).map((a) => `${s.archive}:${s.name}/${a.name}`)),
  };
}
