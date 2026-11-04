import type { RdrNode } from '@s2u/archive';
import { loadDialog, type DialogDesign, type ZAnimUiCommand } from '../../src/index';
import type { WidgetHost, WidgetSound } from '../../src/widgets/index';

// Hand-built dialogs for the widget tests (web research 117), shaped as `parseRdr` returns a compiled dialog; no disc
// bytes. The expected values in the tests are worked by hand from the cited decompilation lines.

export const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
  const out: RdrNode[] = [];
  for (let i = 0; i < kv.length; i += 2) { const v = kv[i + 1]!; out.push(kv[i] as string, Array.isArray(v) ? v : [v]); }
  return out;
};
export const rec = (name: string, type: string, x: number, y: number, spec: RdrNode[], ...more: (string | RdrNode)[]): RdrNode[] =>
  r('NAME', name, 'TYPE', type, 'XPOS', String(x), 'YPOS', String(y), ...more, 'SPEC', spec);
export const design = (controls: RdrNode[][], objects: RdrNode[][] = [], ...more: (string | RdrNode)[]): DialogDesign =>
  loadDialog([['SCREENS', r('FONT', 'font_t', 'CONTROLS', controls, 'OBJECTS', objects, ...more)]]);

/** A host that records what the widgets asked of it; `missing` names the animations it does not find. */
export class RecordingHost implements WidgetHost {
  readonly calls: string[] = [];
  constructor(private readonly missing: ReadonlySet<string> = new Set()) {}
  animation(name: string | null, argument: string | null): boolean {
    if (name === null || this.missing.has(name)) { this.calls.push(`missing ${name}`); return false; }
    this.calls.push(argument === null ? `anim ${name}` : `anim ${name}(${argument})`);
    return true;
  }
  hasAnimation(name: string | null): boolean { return name !== null && !this.missing.has(name); }
  sound(name: WidgetSound): void { this.calls.push(`sound ${name}`); }
  screenEvent(code: number): void { this.calls.push(`event 0x${code.toString(16)}`); }
  take(): string[] { return this.calls.splice(0); }
}

/** A node command as PLAT-07's runtime decodes one: the node's op at +6 (op + 0xE8), the u16 at +8, the s16 at +0xc. */
export const nodeCmd = (node: string, op: number, arg = '', u16 = 0, loc = 0): ZAnimUiCommand => {
  const bytes = new Uint8Array(16);
  bytes[6] = op + 0xe8;
  bytes[8] = u16 & 0xff; bytes[9] = u16 >> 8;
  bytes[12] = loc & 0xff; bytes[13] = (loc >> 8) & 0xff;
  return { anim: 'a', sequence: 's', nodeIndex: 1, node, opcodeByte: op + 0xe8, fn: null, arg, loc, bytes };
};
