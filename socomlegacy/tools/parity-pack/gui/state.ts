import { IsoAssetSource, SOCOM2_US_BOOT } from '@s2u/archive';
import { fsBlob } from '../../fmv-spike';
import { PCSX2_VK } from '../../eph/keys';
import { PAD1_NAME, PCSX2_PAUSE_HOTKEY, pcsx2KeyName } from '../../eph/padIni';
import type { Input } from '../../eph/script';
import { EXPECTED_ELF_CRC, PACK_PATHS, packPath } from './layout';

/**
 * The parity pack GUI's checklist and the facts under it (PK-5; docs/specs/2026-11-03-parity-pack-design.md 5, "The
 * checklist", and 10.1). Product track (OT.R53): the GUI of a validation instrument, an adaptation, never in a build and
 * never changing the game's behaviour. The checklist itself is pure (facts in, six sentences out); the facts' readers
 * (the image's ELF CRC, the browser on the host) take their file access injected or read the tester's own files only.
 */

export type CheckId = 'image' | 'bios' | 'maps' | 'ffmpeg' | 'browser' | 'pad';
export type CheckLevel = 'ok' | 'bad' | 'warn';

export interface CheckLine {
  readonly id: CheckId;
  readonly ok: boolean;
  /** green, red, or amber (the pad, and the maps while they are being prepared). */
  readonly level: CheckLevel;
  readonly text: string;
}

/** The browser the harness's page runs in (PK.R2: the tester's own Edge or Chrome, else the bundled Chromium). */
export interface BrowserChoice {
  /** EPH_BROWSER_CHANNEL, or null for Playwright's bundled Chromium. */
  readonly channel: 'msedge' | 'chrome' | null;
  readonly name: 'Edge' | 'Chrome' | 'the bundled browser';
  /** PLAYWRIGHT_BROWSERS_PATH, for the bundled browser only. */
  readonly browsersPath?: string;
}

export interface ChecklistFacts {
  /** Every `.iso` in drop-here/, by name and size in bytes. */
  readonly isos: readonly { readonly name: string; readonly size: number }[];
  /** The one image's ELF CRC (8 upper-case hex digits), or null when not read (yet, or it failed: `elfCrcError`). */
  readonly elfCrc: string | null;
  readonly elfCrcError?: string | null;
  /** Every `.bin` in drop-here/bios/. */
  readonly biosFiles: readonly string[];
  /** Every `.bin` already in the pack's own bios folder (a pack built --with-bios, PK.R6); absent or empty otherwise. */
  readonly shippedBios?: readonly string[];
  readonly mapsIndexExists: boolean;
  /** The preparation in progress, when it runs. */
  readonly preparing?: { readonly done: number; readonly total: number } | null;
  readonly ffmpegFound: boolean;
  readonly browser: BrowserChoice | null;
  /** As the GUI page reports `navigator.getGamepads()`; null before it has. */
  readonly padSeen: boolean | null;
  /** The first pad's `id` and `mapping` as the page reports them (PK-8); absent from a page that sends only `seen`. */
  readonly padId?: string | null;
  readonly padMapping?: string | null;
}

const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** The six lines, in the design's order, each one sentence. */
export function checklist(f: ChecklistFacts): CheckLine[] {
  const line = (id: CheckId, ok: boolean, text: string, level: CheckLevel = ok ? 'ok' : 'bad'): CheckLine => ({ id, ok, level, text });
  let image: CheckLine;
  if (f.isos.length === 0) image = line('image', false, 'put your SOCOM II disc image (.iso) in drop-here');
  else if (f.isos.length > 1) image = line('image', false, `one image only in drop-here: found ${f.isos.length}`);
  else if (f.elfCrc === null) {
    image = f.elfCrcError
      ? line('image', false, `the disc image ${f.isos[0]!.name} could not be read as a SOCOM II disc: ${f.elfCrcError}`)
      : line('image', false, `checking the disc image ${f.isos[0]!.name}`, 'warn');
  } else if (f.elfCrc.toUpperCase() !== EXPECTED_ELF_CRC) {
    image = line('image', false, 'this is not the US retail SOCOM II image the harness is built for');
  } else image = line('image', true, `the disc image: ${f.isos[0]!.name} (${gb(f.isos[0]!.size)}), the US retail SOCOM II`);

  const bins = [...f.biosFiles].sort();
  const shipped = [...(f.shippedBios ?? [])].sort();
  const bios = bins.length > 0
    ? line('bios', true, bins.length === 1 ? `the PS2 BIOS: ${bins[0]}` : `the PS2 BIOS: ${bins[0]} (the first of ${bins.length})`)
    : shipped.length > 0
      ? line('bios', true, `the PS2 BIOS: ${shipped[0]} (included in the pack)`)
      : line('bios', false, 'put your PS2 BIOS dump (.bin) in drop-here\\bios');

  let maps: CheckLine;
  if (f.preparing) maps = line('maps', false, `preparing the maps: ${f.preparing.done} of ${f.preparing.total}`, 'warn');
  else if (f.mapsIndexExists) maps = line('maps', true, 'the maps are prepared from your image');
  else maps = line('maps', false, 'the maps are not prepared yet: press Prepare (once, a few minutes)');

  const ffmpeg = f.ffmpegFound
    ? line('ffmpeg', true, 'ffmpeg found: the video can be recorded')
    : line('ffmpeg', false, 'ffmpeg was not found: the pack is incomplete');

  const browser = f.browser
    ? line('browser', true, `the page runs in ${f.browser.name === 'the bundled browser' ? 'the bundled browser' : `your ${f.browser.name}`}`)
    : line('browser', false, 'no Edge, Chrome or bundled browser');

  // The harness reads the pad in the W3C standard mapping (tools/eph/pageMap GAMEPAD_BUTTON); another mapping's buttons
  // may sit at other indices, so it warns (PK-8).
  const pad = !f.padSeen
    ? line('pad', false, 'no pad seen yet: plug one in (it can be done later)', 'warn')
    : !f.padId
      ? line('pad', true, 'a pad is connected')
      : f.padMapping === 'standard'
        ? line('pad', true, `pad seen: ${f.padId} (standard mapping)`)
        : line('pad', true, `pad seen: ${f.padId} -- its mapping is not the standard one; the buttons may not line up`, 'warn');
  return [image, bios, maps, ffmpeg, browser, pad];
}

/** Play is offered only when the image, the BIOS, the maps, ffmpeg and a browser are all green; the pad only warns. */
export function canPlay(list: readonly CheckLine[]): boolean {
  const need: CheckId[] = ['image', 'bios', 'maps', 'ffmpeg', 'browser'];
  return need.every((id) => list.find((l) => l.id === id)?.ok === true);
}

/** The first red line's sentence (why Play is refused), or null. */
export function firstRefusal(list: readonly CheckLine[]): string | null {
  return list.find((l) => l.id !== 'pad' && !l.ok)?.text ?? null;
}

/**
 * The ini with `[Filenames] BIOS = <name>` (PCSX2's setting of the BIOS file in its bios folder): the key replaced where
 * it is, added at the section's end, or the section added at the file's end; every other line and the line ends kept.
 */
export function withBios(iniText: string, name: string): string {
  if (/[\r\n]/.test(name)) throw new Error('a BIOS file name holds no line break');
  const eol = iniText.includes('\r\n') ? '\r\n' : '\n';
  const lines = iniText.split(/(?<=\n)/);
  let section = '';
  let inAt = -1;
  let lastInSection = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    const head = /^\[(.+)\]$/.exec(t);
    if (head) { section = head[1]!; if (section === 'Filenames') { inAt = i; lastInSection = i; } continue; }
    if (section !== 'Filenames') continue;
    if (t !== '') lastInSection = i;
    if (/^BIOS\s*=/.test(t)) {
      const end = /\r?\n$/.exec(lines[i]!)?.[0] ?? '';
      lines[i] = `BIOS = ${name}${end}`;
      return lines.join('');
    }
  }
  if (inAt >= 0) {
    const at = lines[lastInSection]!;
    if (!/\n$/.test(at)) lines[lastInSection] = at + eol;
    lines.splice(lastInSection + 1, 0, `BIOS = ${name}${eol}`);
    return lines.join('');
  }
  const body = iniText === '' || /\n$/.test(iniText) ? iniText : iniText + eol;
  return `${body}${body === '' ? '' : eol}[Filenames]${eol}BIOS = ${name}${eol}`;
}

/** PCSX2's ELF CRC: every little-endian 32-bit word of the file XORed (a trailing partial word is not read). */
export function elfCrc(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let crc = 0;
  for (let i = 0; i + 4 <= bytes.byteLength; i += 4) crc = (crc ^ view.getUint32(i, true)) >>> 0;
  return crc.toString(16).toUpperCase().padStart(8, '0');
}

/** The image's boot file (`SCUS_972.75`, discIdentity's SOCOM2_US_BOOT) through the repository's ISO reader, its CRC. */
export async function readElfCrc(isoPath: string): Promise<string> {
  const blob = fsBlob(isoPath);
  try {
    const source = new IsoAssetSource(blob);
    return elfCrc(await source.read(SOCOM2_US_BOOT));
  } finally {
    blob.close();
  }
}

/**
 * The browser for the page: Edge when its exe is installed, else Chrome, else the pack's bundled Chromium when it was
 * shipped (`pack/runtime/ms-playwright`), else none. `env` gives the Program Files folders.
 */
export function findBrowser(env: Readonly<Record<string, string | undefined>>, exists: (p: string) => boolean, packRoot: string): BrowserChoice | null {
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.ProgramW6432].filter((r): r is string => !!r && r.trim() !== '');
  const at = (rel: string): boolean => roots.some((r) => exists(`${r.replace(/\\/g, '/').replace(/\/+$/, '')}/${rel}`));
  if (at('Microsoft/Edge/Application/msedge.exe')) return { channel: 'msedge', name: 'Edge' };
  if (at('Google/Chrome/Application/chrome.exe')) return { channel: 'chrome', name: 'Chrome' };
  const bundled = packPath(packRoot, PACK_PATHS.browsers);
  if (exists(bundled)) return { channel: null, name: 'the bundled browser', browsersPath: bundled };
  return null;
}

/** One PS2 button and the keyboard key the harness's [Pad1] binds it to (the repair's key table). */
export interface KeyRow { readonly button: string; readonly key: string }

const BUTTON_WORDS: Readonly<Partial<Record<Input, string>>> = {
  up: 'D-pad up', down: 'D-pad down', left: 'D-pad left', right: 'D-pad right',
  lup: 'Left stick up', ldown: 'Left stick down', lleft: 'Left stick left', lright: 'Left stick right',
  rup: 'Right stick up', rdown: 'Right stick down', rleft: 'Right stick left', rright: 'Right stick right',
};
const KEY_WORDS: Readonly<Record<string, string>> = {
  Return: 'Enter', Backspace: 'Backspace', Up: 'Up arrow', Down: 'Down arrow', Left: 'Left arrow', Right: 'Right arrow',
};

/**
 * Every PS2 button and its key, as `tools/eph/padIni.ts` pad1Lines writes `[Pad1]` (`<Name> = Keyboard/<key>`, the keys
 * of `tools/eph/keys.ts` PCSX2_VK), in [Pad1]'s order; then PCSX2's pause key.
 */
export function keyTable(): KeyRow[] {
  const rows = (Object.keys(PAD1_NAME) as Input[]).map((i) => {
    const key = pcsx2KeyName(PCSX2_VK[i]);
    return { button: BUTTON_WORDS[i] ?? PAD1_NAME[i], key: KEY_WORDS[key] ?? key };
  });
  return [...rows, { button: 'Pause PCSX2', key: PCSX2_PAUSE_HOTKEY.key }];
}
