import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { bindingsOf, DIALOG_ARCHIVES, resolveSets, scriptLibrary, stringsOf, type DialogFacts, type SetFacts } from '../dialogInventory';
import { discRoot, readSets } from '../dump-dialogs';
import { ElfImage, findStrings, PT_LOAD } from '../elfImage';
import {
  animationStarters, EXIT_MENU_VTABLE_VA, EXIT_STATE_VTABLE_VA, luiAddiuReturn, MENU_DIALOG_SLOT, menuDialogName, vtableClass,
} from '../unplacedDialogs';

/**
 * MENU-09 (web research 114): the three dialogs no menu flow reaches -- `dlgExitState`, `dlgHype`, `dlgStickSetup`.
 * The pure readers on made-up input and the facts PLAT-06's pin already holds run in CI; the ELF's and the disc's run
 * only with `SOCOM_DISC` / `SOCOM_PC_ROOT` (W6.R8) and skip cleanly without them.
 */

// ---------------------------------------------------------------------------------------------------------------------
// A tiny ELF32 LE: one PT_LOAD at 0x1000 holding a vtable, its type descriptor, the class name, a three-instruction
// getter and the string it returns (the shape of CExitMenu's, research 114 §1.2).

function tinyElf(vaddr: number, bytes: Uint8Array): Uint8Array {
  const PH = 0x34, out = new Uint8Array(0x100 + bytes.length), v = new DataView(out.buffer);
  out.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  v.setUint32(0x1c, PH, true); v.setUint16(0x2a, 0x20, true); v.setUint16(0x2c, 1, true);
  v.setUint32(PH, 1, true); v.setUint32(PH + 4, 0x100, true); v.setUint32(PH + 8, vaddr, true);
  v.setUint32(PH + 16, bytes.length, true); v.setUint32(PH + 20, bytes.length, true);
  out.set(bytes, 0x100);
  return out;
}

function image(): ElfImage {
  const b = new Uint8Array(0x100), v = new DataView(b.buffer);
  const w = (va: number, x: number): void => v.setUint32(va - 0x1000, x, true);
  const s = (va: number, t: string): void => { for (let i = 0; i < t.length; i++) b[va - 0x1000 + i] = t.charCodeAt(i); };
  s(0x1000, 'CExitMenu');                        // the class name
  w(0x1010, 0x1000);                             // the type descriptor: its name
  w(0x1020, 0x1010); w(0x1024, 0);               // the vtable: type descriptor, offset, then the slots
  w(0x1028, 0x1060); w(0x102c, 0x1070); w(0x1030, 0x1040); w(0x1034, 0x1070);
  w(0x1040, 0x3c020000); w(0x1044, 0x03e00008); w(0x1048, 0x244210c0);    // lui v0,0; jr ra; addiu v0,v0,0x10c0
  w(0x1050, 0x3c020001); w(0x1054, 0x03e00008); w(0x1058, 0x2442a000);    // lui v0,1; jr ra; addiu v0,v0,-0x6000
  w(0x1070, 0x03e00008);                                                  // jr ra: returns nothing read here
  w(0x1080, 0x3c020000); w(0x1084, 0x00000000); w(0x1088, 0x244210c0);    // lui v0,0; nop; addiu: no jr ra, no getter
  s(0x10c0, 'dlgExitState.rdr');
  return new ElfImage(tinyElf(0x1000, b));
}

describe('the readers (made-up input)', () => {
  it('names a vtable\'s class through its type descriptor (word 0 -> descriptor -> name)', () => {
    expect(vtableClass(image(), 0x1020)).toBe('CExitMenu');
  });

  it('reads a getter that is lui / jr ra / addiu (delay slot) as the address it returns, the low half signed', () => {
    const elf = image();
    expect(luiAddiuReturn(elf, 0x1040)).toBe(0x10c0);
    expect(luiAddiuReturn(elf, 0x1050)).toBe(0x10000 - 0x6000);
    expect(luiAddiuReturn(elf, 0x1070)).toBeNull();
    expect(luiAddiuReturn(elf, 0x1044)).toBeNull();
  });

  it('a lui / addiu pair with any other instruction between them is not a getter: the middle word must be jr ra', () => {
    expect(luiAddiuReturn(image(), 0x1080)).toBeNull();
  });

  it('a menu\'s dialog is the string its slot 0x10 getter returns; none when the slot is no such getter', () => {
    const elf = image();
    expect(MENU_DIALOG_SLOT).toBe(0x10);
    expect(menuDialogName(elf, 0x1020)).toBe('dlgExitState.rdr');
    expect(menuDialogName(elf, 0x1024)).toBeNull();
  });

  it('finds what starts an animation: the bindings that name it and the animations that CALL it', () => {
    const dialogs: DialogFacts[] = [
      { archive: 'A', name: 'dlgA.rdr', scripts: ['dlgA.rdr'], strings: [], bindings: [{ owner: 'SCREEN', trigger: 'BUTTON CROSS', animation: 'Go', argument: null }] },
      { archive: 'A', name: 'dlgB.rdr', scripts: ['dlgB.rdr'], strings: [], bindings: [{ owner: 'Btn', trigger: 'BUTTON CROSS', animation: 'Other', argument: null }] },
    ];
    const sets: SetFacts[] = [
      { archive: 'Z', name: 'dlgA.rdr', anims: [{ name: 'Go', commands: [{ fn: 'SWITCHMENU', arg: 'dlgX.rdr' }], calls: [], locs: [] }, { name: 'Lone', commands: [], calls: [], locs: [] }] },
      { archive: 'Z', name: 'dlgB.rdr', anims: [{ name: 'Other', commands: [], calls: ['go'], locs: [] }] },
    ];
    expect(animationStarters(dialogs, sets, 'Go')).toEqual({
      definedIn: ['Z:dlgA.rdr'], bindings: ['dlgA.rdr SCREEN BUTTON CROSS'], calls: ['Z:dlgB.rdr/Other'],
    });
    expect(animationStarters(dialogs, sets, 'Lone')).toEqual({ definedIn: ['Z:dlgA.rdr'], bindings: [], calls: [] });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// What PLAT-06's pin (web research 96) already holds about the three, read again for MENU-09.

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'dialogInventory.pinned.json'), 'utf8')) as {
  readercMembers: string[]; readerxMembers: string[]; edges: string[]; libraryEdges: string[]; dangling: string[];
  classes: Record<string, string>; elf: { bindingNames: string[]; codeDialogs: string[]; switchStrings: string[] };
};
const to = (e: string): string => e.split(' -> ')[1]!.split(' [')[0]!;

describe('the pinned inventory (web research 96, 114 §0)', () => {
  it('dlgExitState is in READERC and READERX; dlgHype in READERC only; dlgStickSetup in neither', () => {
    expect(PIN.readercMembers).toContain('dlgExitState.rdr');
    expect(PIN.readercMembers).toContain('dlgHype.rdr');
    expect(PIN.readerxMembers).toContain('dlgExitState.rdr');
    expect(PIN.readerxMembers).not.toContain('dlgHype.rdr');
    expect([...PIN.readercMembers, ...PIN.readerxMembers].filter((m) => /sticksetup/i.test(m))).toEqual([]);
  });

  it('no dialog edge reaches dlgExitState or dlgHype; dlgStickSetup only from GoToStickSetup, a script no binding runs', () => {
    expect([...PIN.edges, ...PIN.libraryEdges].filter((e) => /^dlg(ExitState|Hype)(\.rdr)?$/i.test(to(e)))).toEqual([]);
    expect(PIN.edges.filter((e) => /sticksetup/i.test(e))).toEqual(['dlgOptions_Menu.rdr -> dlgStickSetup.rdr [script dlgOptions_Menu.rdr/GoToStickSetup SWITCHMENU]']);
    expect(PIN.dangling).toEqual(['dlgStickSetup.rdr']);
  });

  it('the ELF names dlgExitState.rdr and dlgHype, never dlgStickSetup; both are classed "code"', () => {
    expect(PIN.elf.codeDialogs.filter((c) => /exitstate|hype|sticksetup/i.test(c))).toEqual(['dlgExitState.rdr@0x3e2ce0', 'dlgHype@0x3f8c88']);
    expect([PIN.classes['dlgExitState.rdr'], PIN.classes['dlgHype.rdr']]).toEqual(['code', 'code']);
    expect(PIN.elf.bindingNames).toContain('SwitchMenu');
    expect(PIN.elf.bindingNames.filter((n) => /stick|hype|exitstate/i.test(n))).toEqual(['SetStickPreset']);
  });

  it('research 96 carries MENU-09\'s addition, pointing to research 114', () => {
    const r96 = readFileSync(resolve(import.meta.dirname, '../../docs/research/96-the-dialog-inventory-and-flow-graph.md'), 'utf8');
    expect(r96).toMatch(/MENU-09[^\n]*\(added 2026-10-01\)/);
    expect(r96).toContain('[research 114](114-unplaced-dialogs.md)');
  });

  it('research 114 and 96 name the fade tick\'s own push (0x2a9a2c) and the writer of mission_abort 2 (FUN_002041e0)', () => {
    const doc = (n: string): string => readFileSync(resolve(import.meta.dirname, `../../docs/research/${n}`), 'utf8');
    for (const n of ['114-unplaced-dialogs.md', '96-the-dialog-inventory-and-flow-graph.md']) {
      expect(doc(n)).toContain('0x2a9a2c');
      expect(doc(n)).toContain('FUN_002041e0');
    }
    expect(doc('114-unplaced-dialogs.md')).toMatch(/\| `EXIT_ABORT_POP_READING` \|[^\n]*\| resolved[^|\n]*\|$/m);
  });

  it('the post-end delay is the frame tick\'s own fade to black (FUN_003b1760, D:L50792-50797), not "no fade"', () => {
    const doc = (n: string): string => readFileSync(resolve(import.meta.dirname, `../../docs/research/${n}`), 'utf8');
    for (const n of ['114-unplaced-dialogs.md', '96-the-dialog-inventory-and-flow-graph.md']) {
      expect(doc(n)).toContain('FUN_003b1760');
      expect(doc(n)).toContain('D:L50792-50797');
      expect(doc(n)).not.toContain('D:L50780-50789');
      expect(doc(n)).not.toMatch(/does not run the fade|no fade covers|counts only while no fade runs/);
    }
  });

  it('FUN_002a9b30 clears the fade bit only for an abort or a death (the nofade test\'s bne 0x2a9ddc), not on a success', () => {
    const doc = (n: string): string => readFileSync(resolve(import.meta.dirname, `../../docs/research/${n}`), 'utf8');
    const r114 = doc('114-unplaced-dialogs.md');
    for (const s of ['0x2a9ddc', '0x2a9ea8', '0x2a9da0', '0x2a9dc4', '0x2a9ec0', 'D:L150608-150609']) expect(r114).toContain(s);
    expect(r114).not.toMatch(/outer else|leaves the bit to whoever/);
    expect(doc('96-the-dialog-inventory-and-flow-graph.md')).toContain('0x2a9ddc');
    // The frame flip's second call (D:L50813, not the store at D:L50814) and the push frame's reset to 1.0 (D:L50790).
    expect(r114).toContain('D:L50809/D:L50813');
    expect(r114).toContain('D:L50790');
    expect(r114).not.toContain('either way the screen darkens first');
  });

  it('the fade bit has other writers than FUN_002a9b30 (grep DAT_004365dc): 96 does not say only an abort or death arms the count', () => {
    const doc = (n: string): string => readFileSync(resolve(import.meta.dirname, `../../docs/research/${n}`), 'utf8');
    const r114 = doc('114-unplaced-dialogs.md'), r96 = doc('96-the-dialog-inventory-and-flow-graph.md');
    // FUN_002980d0's set (D:L141368) and clear (D:L141620), FUN_002232a0's clear (D:L75870): in the reading's searched column.
    const row = r114.split('\n').find((l) => l.startsWith('| `EXIT_FADE_CALLERS_READING` |'))!;
    for (const s of ['D:L141368', 'D:L141620', 'D:L75870', 'FUN_002232a0']) {
      expect(row).toContain(s);
      expect(r96).toContain(s);
    }
    expect(r96).not.toMatch(/which an abort\s+or death with `nofade` not 1 arms/);
  });

  it('the mission (re)start FUN_002a7d40 clears the fade bit through 0x4364e0+0xfc (D:L149686): a writer grep DAT_004365dc misses', () => {
    const doc = (n: string): string => readFileSync(resolve(import.meta.dirname, `../../docs/research/${n}`), 'utf8');
    const r114 = doc('114-unplaced-dialogs.md'), r96 = doc('96-the-dialog-inventory-and-flow-graph.md');
    const row = r114.split('\n').find((l) => l.startsWith('| `EXIT_FADE_CALLERS_READING` |'))!;
    for (const s of ['FUN_002a7d40', 'D:L149686']) {
      expect(row).toContain(s);
      expect(r114.split('\n').filter((l) => !l.startsWith('|')).join('\n')).toContain(s);
      expect(r96).toContain(s);
    }
    // The start, not D:L75870 or D:L141620, is the last clearer when a success arrives with no FUN_002a97c0 call between.
    expect(r114).not.toContain('last cleared at D:L75870 or D:L141620');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The ELF and the disc (dev only).

const DISC = discRoot();
const ELF = DISC ? resolve(DISC, 'socom2_game.elf') : null;
let elfCache: ElfImage | null = null;
const elf = (): ElfImage => (elfCache ??= new ElfImage(new Uint8Array(readFileSync(ELF ?? ''))));

describe.skipIf(!ELF || !existsSync(ELF))('the ELF (SOCOM_DISC / SOCOM_PC_ROOT): research 114 §1-§3', () => {
  it('the vtable FUN_001f1ae0 and FUN_001f1bb0 install is CExitMenu\'s, and its dialog getter returns dlgExitState.rdr', () => {
    expect(vtableClass(elf(), EXIT_MENU_VTABLE_VA)).toBe('CExitMenu');
    // The descriptor's second word is its base's: CGameMenu (0x3e2cd4 -> 0x3e2cc0 -> 0x3e2cb8 -> 'CGameMenu').
    expect(elf().cstr(elf().u32(elf().u32(elf().u32(elf().u32(EXIT_MENU_VTABLE_VA) + 4))))).toBe('CGameMenu');
    expect(elf().u32(EXIT_MENU_VTABLE_VA + MENU_DIALOG_SLOT)).toBe(0x1f3b00);
    expect(luiAddiuReturn(elf(), 0x1f3b00)).toBe(0x3e2ce0);
    expect(menuDialogName(elf(), EXIT_MENU_VTABLE_VA)).toBe('dlgExitState.rdr');
  });

  it('the state FUN_001f1d70 builds is CExitState ("ExitState"), and its slot +0x10 is FUN_001f1bb0', () => {
    expect(vtableClass(elf(), EXIT_STATE_VTABLE_VA)).toBe('CExitState');
    expect(elf().cstr(0x3e2a18)).toBe('ExitState');
    expect(elf().u32(EXIT_STATE_VTABLE_VA + 0x10)).toBe(0x1f1bb0);
    expect([elf().cstr(0x3e29e8), elf().cstr(0x3e29f8), elf().cstr(0x3e2a00)]).toEqual(['readerx.zar', 'run/ui', 'run/extzanim.zar']);
  });

  it('the mission valves the exit path reads, and the fade task\'s name', () => {
    expect([0x3f18b0, 0x3f18d0, 0x3f18e0, 0x3f18f0, 0x3f1910].map((va) => elf().cstr(va)))
      .toEqual(['mission_complete', 'mission_failure', 'mission_abort', 'mission_timeout', 'nofade']);
    expect(elf().cstr(0x3f1360)).toBe('MissionFadeToEnd');
    expect(elf().cstr(0x3e5350)).toBe('MPExitState');
  });

  it('CExitState 0x4086a0 is pushed at three sites, one inside the MissionFadeToEnd tick, which FUN_002a97c0 schedules', () => {
    // hi << 16 plus the signed low half of a lui at `lui` and an addiu at `lo` on the same register.
    const pair = (lui: number, lo: number): number => {
      const a = elf().u32(lui), c = elf().u32(lo);
      expect([a >>> 26, c >>> 26, (c >>> 21) & 31]).toEqual([0x0f, 0x09, (a >>> 16) & 31]);
      const l = c & 0xffff;
      return (((a & 0xffff) << 16) + (l & 0x8000 ? l - 0x10000 : l)) >>> 0;
    };
    const jal = (va: number): number => { const w = elf().u32(va); expect(w >>> 26).toBe(3); return (w & 0x3ffffff) << 2; };
    // FUN_002a9a70 (D:L150569), FUN_002a9b30 (D:L150605), and the tick 0x2a98a0 the decompilation does not list.
    expect([pair(0x2a9b0c, 0x2a9b14), pair(0x2a9e8c, 0x2a9e94), pair(0x2a9a20, 0x2a9a28)]).toEqual([0x4086a0, 0x4086a0, 0x4086a0]);
    expect(jal(0x2a9a2c)).toBe(0x2cf380);
    // FUN_002a97c0 hands 0x2a98a0 to FUN_0034e6b0 as the task's tick (D:L150550).
    expect(pair(0x2a9808, 0x2a9824)).toBe(0x2a98a0);
  });

  it('FUN_001ebed0 (0x1ebed0-0x1ec480) calls the screen fade FUN_003b1760 once: the post-end delay\'s fade (D:L50792)', () => {
    const JAL_FADE = (3 << 26) | (0x3b1760 >>> 2);
    const sites: number[] = [];
    for (let va = 0x1ebed0; va < 0x1ec480; va += 4) if (elf().u32(va) === JAL_FADE) sites.push(va);
    expect(sites).toHaveLength(1);
  });

  it('FUN_002a9b30\'s branches: only the nofade bne (0x2a9ddc) reaches the bit-clear 0x2a9ea8; the rest go to the epilogue', () => {
    // MIPS I-type branch: opcode 4 beq / 5 bne; target = the delay slot's address + the signed 16-bit offset * 4.
    const branch = (va: number): { op: string; target: number } => {
      const w = elf().u32(va), off = w & 0xffff;
      const op = ({ 4: 'beq', 5: 'bne' } as Record<number, string>)[w >>> 26] ?? `op${w >>> 26}`;
      return { op, target: va + 4 + (off & 0x8000 ? off - 0x10000 : off) * 4 };
    };
    expect(branch(0x2a9da0)).toEqual({ op: 'beq', target: 0x2a9ec0 });   // the state unchanged (D:L150593)
    expect(branch(0x2a9dc4)).toEqual({ op: 'beq', target: 0x2a9ec0 });   // neither state 4 nor bit 4 of +0xe1 (D:L150595)
    expect(branch(0x2a9ddc)).toEqual({ op: 'bne', target: 0x2a9ea8 });   // nofade's short != 1 (D:L150596 -> D:L150608)
    // No other branch in the function's body reaches the bit-clear.
    const into: number[] = [];
    for (let va = 0x2a9b30; va < 0x2a9ee0; va += 4) {
      const op = elf().u32(va) >>> 26;
      if ((op === 4 || op === 5) && branch(va).target === 0x2a9ea8) into.push(va);
    }
    expect(into).toEqual([0x2a9ddc]);
    // 0x2a9ebc stores +0xfc (sb, base s1, offset 0xfc) just before the epilogue's ld ra at 0x2a9ec0.
    expect(elf().u32(0x2a9ebc) >>> 16).toBe(0xa223);
    expect(elf().u32(0x2a9ebc) & 0xffff).toBe(0xfc);
  });

  it('FUN_002a7d40 stores +0x18 = 1 and clears bit 0 of +0xfc; its three callers pass 0x4364e0, so it writes DAT_004365dc', () => {
    // sb v1,0x18(a0) with v1 = 1 (addiu v1,zero,1 at 0x2a7d44): the mission state RUNNING (D:L149683).
    expect([elf().u32(0x2a7d44), elf().u32(0x2a7d60)]).toEqual([0x24030001, 0xa0830018]);
    // lbu a3,0xfc(s1); a0 = a3 & 0xfffe | 0; sb a0,0xfc(s1) (D:L149686).
    expect([0x2a7d70, 0x2a7d74, 0x2a7d78, 0x2a7d84, 0x2a7d88, 0x2a7d8c].map((va) => elf().u32(va)))
      .toEqual([0x922700fc, 0x2404fffe, 0x30060001, 0x00e42024, 0x00862025, 0xa22400fc]);
    // Every jal 0x2a7d40 in the PT_LOAD images has lui a0,0x43 before it and addiu a0,a0,0x64e0 in its delay slot
    // (D:L50946, D:L51049, D:L75935).
    const JAL = (3 << 26) | (0x2a7d40 >>> 2), sites: number[] = [];
    for (const s of elf().segments) {
      if (s.type !== PT_LOAD) continue;
      for (let o = 0; o + 4 <= s.filesz; o += 4) if (elf().u32(s.vaddr + o) === JAL) sites.push(s.vaddr + o);
    }
    expect(sites).toEqual([0x1ec8bc, 0x1ecbac, 0x22382c]);
    for (const s of sites) expect([elf().u32(s - 4), elf().u32(s + 4)]).toEqual([0x3c040043, 0x248464e0]);
    expect(0x4364e0 + 0xfc).toBe(0x4365dc);
  });

  it('no ELF string holds "StickSetup"; the one holding "hype" is dlgHype at 0x3f8c88, its strstr followed by printf("")', () => {
    expect(findStrings(elf(), /sticksetup/i)).toEqual([]);
    expect(findStrings(elf(), /hype/i)).toEqual([{ va: 0x3f8c88, text: 'dlgHype' }]);
    expect(elf().cstr(0x3f8c90)).toBe('');
  });
});

/** Every file under `dir`, relative, with forward slashes. */
function listFiles(dir: string, base: string = dir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out); else out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

let factsCache: { dialogs: DialogFacts[]; sets: SetFacts[] } | null = null;
function facts(): { dialogs: DialogFacts[]; sets: SetFacts[] } {
  if (factsCache) return factsCache;
  const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC ?? '', DIALOG_ARCHIVES[0]))));
  const dialogs = z.root.children.filter((k) => /^dlg/i.test(k.name)).map((k) => {
    const root = parseRdr(z.data(k));
    return { archive: DIALOG_ARCHIVES[0], name: k.name, scripts: scriptLibrary(root), bindings: bindingsOf(root), strings: stringsOf(root) };
  });
  return (factsCache = { dialogs, sets: readSets(DISC ?? '').sets });
}

describe.skipIf(!DISC)('the disc (SOCOM_DISC / SOCOM_PC_ROOT): research 114 §2-§3', () => {
  it('GoToStickSetup is defined once, in dlgOptions_Menu.rdr\'s set, and no binding and no CALL_ANIMATION starts it', () => {
    expect(animationStarters(facts().dialogs, facts().sets, 'GoToStickSetup')).toEqual({ definedIn: ['RUN/UIZANIM.ZAR:dlgOptions_Menu.rdr'], bindings: [], calls: [] });
  }, 120_000);

  it('dlgHype\'s one script library is a set no archive holds, so its three bindings resolve to nothing', () => {
    const hype = facts().dialogs.find((d) => d.name === 'dlgHype.rdr')!;
    expect(hype.scripts).toEqual(['dlgHype.rdr']);
    expect(facts().sets.filter((s) => /hype/i.test(s.name))).toEqual([]);
    expect(resolveSets(hype, facts().sets)).toEqual([]);
    expect(hype.bindings.map((b) => `${b.trigger} ${b.animation}`).sort()).toEqual(['BUTTON CROSS BackOutWithMusic', 'BUTTON TRIANGLE BackOutWithMusic', 'EVENT ONSTART EnterSlideShow']);
    // BackOutWithMusic exists only in two other dialogs' own sets; EnterSlideShow in none.
    expect(animationStarters([], facts().sets, 'BackOutWithMusic').definedIn).toEqual(['RUN/UIZANIM.ZAR:dlgCredits.rdr', 'RUN/UIZANIM.ZAR:dlgMissionSelection.rdr']);
    expect(animationStarters([], facts().sets, 'EnterSlideShow').definedIn).toEqual([]);
  }, 120_000);

  it('no disc file is named for the hype library or the stick setup', () => {
    expect(listFiles(DISC ?? '').filter((f) => /hype|sticksetup/i.test(f))).toEqual([]);
  }, 120_000);
});
