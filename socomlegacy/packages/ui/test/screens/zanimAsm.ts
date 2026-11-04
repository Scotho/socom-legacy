import type { ZAnimRtAnimation, ZAnimRtCommand, ZAnimRtSequence } from '../../src/zanimRuntime';

/**
 * A small assembler for the connecting lines' tests (sprint 9's S9-WIRE): one animation of one sequence, laid out as
 * `@s2u/scene`'s `parseAnimSets` returns the disc's (the header and sizes as `test/zanimRuntime.test.ts` assembles
 * them, research 106 §4). Only the commands those tests send: `ui::UI_COMMAND` with and without a node, `SOUND`, the
 * POPUP record (research 118 §2).
 */

/** The commands with no timeless bit on the disc (research 106 §4). */
const TIMED = new Set([1, 15, 22, 25, 52, 61]);

/** A command's bytes: the header (cmd, set << 8, bit 17 timeless, size << 18), then `fill` writes the payload. */
export function command(set: number, n: number, size: number, fill?: (v: DataView, b: Uint8Array) => void): Uint8Array {
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  const timeless = set === 0 ? !TIMED.has(n) : true;
  v.setUint32(0, (n | (set << 8) | (timeless ? 1 << 17 : 0) | (size << 18)) >>> 0, true);
  fill?.(v, b);
  return b;
}

/** `ui::UI_COMMAND` without a node: the function's name index at +6, the argument's at +8. */
export const uiFn = (names: readonly string[], fn: string, arg = 'NA'): Uint8Array =>
  command(1, 1, 16, (v) => { v.setUint16(4, 0, true); v.setUint8(6, names.indexOf(fn)); v.setUint16(8, names.indexOf(arg), true); });

/** `SOUND` (30): +4 the flags, +6 the name index (research 122 §7: 0x80, a new play, unplaced). */
export const sound = (names: readonly string[], name: string, flags = 0x80): Uint8Array =>
  command(0, 30, 0x20, (v) => { v.setUint16(4, flags, true); v.setUint16(6, names.indexOf(name), true); });

/** The POPUP record's fields this assembler writes (research 118 §2; offsets into the record). */
export interface PopupRecordSpec {
  text: string; panel: string; x: number; y: number; w: number; h: number; textX?: number; textY?: number;
  /** +66 / +67: buttons and the answer valve; button 1 (+68) one slot of width `w1` (0: hidden). */
  valve?: string; w1?: number; w2?: number;
}

/** A `ui::UI_COMMAND` on the node `POPUP` (node index `node`, op 0: byte +6 = 0xE8) carrying the 220-byte record. */
export function popupRecord(names: readonly string[], node: number, r: PopupRecordSpec): Uint8Array {
  return command(1, 1, 0x10 + 220, (v) => {
    v.setUint16(4, node, true); v.setUint8(6, 0xe8);
    const at = 0x10;
    v.setUint8(at + 0, names.indexOf(r.text)); v.setUint8(at + 4, names.indexOf(r.panel));
    v.setInt32(at + 8, r.x, true); v.setInt32(at + 12, r.y, true); v.setInt32(at + 16, r.h, true); v.setInt32(at + 20, r.w, true);
    v.setInt32(at + 24, r.textY ?? 0, true); v.setInt32(at + 28, r.textX ?? 0, true); v.setFloat32(at + 32, 1, true);
    for (let i = 0; i < 3; i++) v.setInt32(at + 36 + 4 * i, 128, true);
    if (r.valve) {
      v.setUint8(at + 66, 1); v.setUint8(at + 67, names.indexOf(r.valve));
      const slot = (b: number, w: number, x: number): void => {
        v.setInt32(at + b + 4, x, true); v.setInt32(at + b + 8, 50, true); v.setInt32(at + b + 12, w, true); v.setInt32(at + b + 16, 25, true);
        v.setFloat32(at + b + 72, 1, true);
      };
      slot(68, r.w1 ?? 50, 10);
      slot(144, r.w2 ?? 0, 100);
    }
  });
}

/** One animation of one sequence `main` that starts with it (word 0x102), not auto-started (flags 0x22). */
export function animation(name: string, names: readonly string[], nodes: readonly string[], commands: Uint8Array[], flags = 0x22): ZAnimRtAnimation {
  let o = 0x1c;
  const cmds: ZAnimRtCommand[] = commands.map((b) => {
    const h = new DataView(b.buffer, b.byteOffset).getUint32(0, true);
    const c = { offset: o, set: (h >>> 8) & 0xff, cmd: h & 0xff, timeless: (h & (1 << 17)) !== 0, size: h >>> 18, bytes: b };
    o += b.length;
    return c;
  });
  const seq: ZAnimRtSequence = { offset: 0, name: 'main', word: 0x102, size: o, commands: cmds };
  return {
    name, names, nodeRefs: ['NA', ...nodes].map((n) => ({ name: n })),
    params: { flags, priority: 3, seqOffsets: [0, 0, 0, 0], state: 1 }, sequences: [seq],
  };
}
