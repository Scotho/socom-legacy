import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, readZdbMember, Zar, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { decodeLocText, FONTS_RDR, LOC_ARCHIVES, loadLocService, locArchivePath, type LocService } from '@s2u/scene';
import { captionCodes, dialogCaptions, locTextBytes, faceNames, glyphWidth, loadDialog, readTextFaces, type TextFace } from '../../src/index';

/**
 * PLAT-13's dev-disc checks (web research 111 §1, §2, §7): every face of `RUN/READERC.ZAR/fonts.rdr` loads as the engine
 * loads it; every caption of every dialog of `RUN/UI/READERC.ZAR` (110) and `RUN/UI/READERX.ZAR` (4), resolved through
 * PLAT-04's `LocService`, lays out in the face it names without a code the face lacks; the LOC tables hold no byte
 * on which the engine's character reader and `decodeLocText` part. Names and counts only.
 *
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) every test skips.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
// This separately dumped executable is not a retail-disc file (unlike the archives above).
const HAVE_GAME_ELF = DISC !== null && existsSync(resolve(DISC, 'socom2_game.elf'));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC ?? '', p)));
const DIALOG_ARCHIVES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'] as const;

let faces: TextFace[] | null = null;
const loadFaces = (): TextFace[] => {
  if (faces) return faces;
  const z = Zar.parse(read(FONTS_RDR.archive));
  return (faces = readTextFaces(parseRdr(z.data(z.find(FONTS_RDR.member)!))));
};

describe.skipIf(DISC === null)(`UI text over the disc${DISC === null ? ' (no SOCOM_DISC / SOCOM_PC_ROOT)' : ''}`, () => {
  it('every face of fonts.rdr loads: the two faces, their glyphs, textures, shadows', () => {
    const z = Zar.parse(read(FONTS_RDR.archive));
    expect(faceNames(parseRdr(z.data(z.find(FONTS_RDR.member)!)))).toEqual(['font_titlebar_01', 'font_text_01']);
    const [title, text] = loadFaces() as [TextFace, TextFace];
    expect([title.glyphs.size, text.glyphs.size]).toEqual([166, 184]);   // 185 records: code 96 twice, one glyph
    expect(title.textures).toEqual(['font_titlebar_01.tif']);
    expect(text.textures).toEqual(['font_text_01.tif', 'font_special_01.tif']);
    expect([title.shadow, text.shadow]).toEqual([
      { offset: [3, 3], color: [0, 0, 0], opacity: Math.fround(0.65) }, { offset: [1, 1], color: [0, 0, 0], opacity: 0.75 },
    ]);
    expect([text.topy, text.boty, title.boty]).toEqual([0, 15, 0]);
    for (const f of [title, text]) expect([f.opacity, f.scale, f.xspacing, f.glowTexture, f.korean]).toEqual([Math.fround(0.7), 1, 0, null, false]);
    const multi = (f: TextFace): number[] => [...f.glyphs.values()].filter((g) => g.elements.length > 1).map((g) => g.code);
    expect([multi(title), multi(text)]).toEqual([[], [96]]);
    expect(glyphWidth(text.glyphs.get(96)!)).toBe(Math.max(...text.glyphs.get(96)!.elements.map((e) => e.disp[0] + e.width)));
    const coloured = [...text.glyphs.values()].filter((g) => g.color !== null);
    expect(coloured).toHaveLength(18);
    expect(coloured.every((g) => g.texture === 1 && g.color!.join() === '150,150,150')).toBe(true);
    // Every letter is in both faces, so the fallback's last resort (UNKNOWN_GLYPH_LAST_RESORT_READING) never runs.
    for (const f of [title, text]) for (let c = 0x41; c <= 0x5a; c++) expect(f.glyphs.has(c)).toBe(true);
  });

  let service: LocService | null = null;
  const loc = async (): Promise<LocService> => {
    if (service) return service;
    const { service: s, missing } = await loadLocService(new FsAssetSource(DISC ?? ''), 'RUN/MP2.ZDB');
    expect(missing).toEqual([]);
    return (service = s);
  };

  it('every caption of every dialog lays out in its face with no code the face lacks', async () => {
    const s = await loc();
    const faceBy = new Map(loadFaces().map((f) => [f.name, f]));
    const tally: Record<string, number> = {};
    const lacking: string[] = [];
    let dialogs = 0;
    for (const archive of DIALOG_ARCHIVES) {
      const z = Zar.parse(read(archive));
      for (const k of z.root.children) {
        dialogs++;
        const d = loadDialog(parseRdr(z.data(k)));
        for (const c of dialogCaptions(d)) {
          // A widget without FONT draws in the dialog's (CAPTION_FACE_DEFAULT_READING, research 111 §7).
          const name = c.font ?? d.font ?? '(none)';
          const { codes, resolution } = captionCodes(c.caption, s);
          tally[`${name} ${resolution.kind}`] = (tally[`${name} ${resolution.kind}`] ?? 0) + 1;
          const face = faceBy.get(name);
          if (!face) { lacking.push(`${k.name} ${c.path}: no face ${name}`); continue; }
          for (const code of codes) if (code !== 0x0a && !face.glyphs.has(code)) lacking.push(`${k.name} ${c.path}: ${code.toString(16)}`);
        }
      }
    }
    expect(dialogs).toBe(114);
    expect(lacking).toEqual([]);
    // 1555 captions: every one names a face of fonts.rdr, and none is a name no table holds.
    expect(tally).toEqual({
      'font_text_01 loc': expect.any(Number), 'font_text_01 literal': expect.any(Number),
      'font_titlebar_01 loc': expect.any(Number), 'font_titlebar_01 literal': expect.any(Number),
    });
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(1555);
  });

  it('the LOC tables hold no lead byte on which FUN_0039f0c0 and decodeLocText part (0xC0, 0xC1, 0xE0 and above); their text round-trips to its bytes', async () => {
    const parting: string[] = [];
    const notRoundTrip: string[] = [];
    let twoByte = 0;
    for (const spec of LOC_ARCHIVES) {
      if (spec.deferred) continue;
      const { archive, member } = locArchivePath(spec.name);
      const bytes = spec.where === 'disc' ? read(archive) : await readZdbMember(new FsAssetSource(DISC ?? ''), 'RUN/MP2.ZDB', archive.split('/').pop()!);
      const zar = Zar.parse(bytes);
      const key = zar.root.children.find((x) => x.name.toLowerCase() === member.toLowerCase())!;
      const walk = (n: RdrNode): void => {
        if (!Array.isArray(n)) return;
        const at = n.indexOf('LOCALIZED');
        if (at >= 0) {
          const v = n[at + 1];
          const raw = Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : String(v ?? '');
          // LOC_TEXT_BYTES_READING: the decoded text re-encodes to the table's own bytes.
          if (locTextBytes(decodeLocText(raw)) !== raw) notRoundTrip.push(spec.name);
          for (let i = 0; i < raw.length; i++) {
            const b = raw.charCodeAt(i);
            if (b === 0xc0 || b === 0xc1 || b >= 0xe0) parting.push(`${spec.name} ${b.toString(16)}`);
            else if (b >= 0xc2) twoByte++;
          }
          return;
        }
        for (const c of n) walk(c);
      };
      walk(parseRdr(zar.data(key)));
    }
    expect(parting).toEqual([]);
    expect(notRoundTrip).toEqual([]);
    expect(twoByte).toBeGreaterThan(0);
  });

  it('the dialogs\' button glows: every TEXT_GLOW has a TIME (none divides by zero)', () => {
    const glows: Record<string, number> = {};
    for (const archive of DIALOG_ARCHIVES) {
      const z = Zar.parse(read(archive));
      for (const k of z.root.children) {
        for (const r of [...loadDialog(parseRdr(z.data(k))).controls]) {
          const w = r.widget;
          if (!('button' in w)) continue;
          for (const st of ['normal', 'active', 'pressed', 'disabled'] as const) {
            const g = w.button[st].glow;
            if (g) glows[`${st} ${g.range.map((x) => +x.toFixed(2)).join('-')} over ${+g.time.toFixed(2)}`] = (glows[`${st} ${g.range.map((x) => +x.toFixed(2)).join('-')} over ${+g.time.toFixed(2)}`] ?? 0) + 1;
          }
        }
      }
    }
    expect(glows).toEqual({ 'active 0.5-1 over 0.5': 293, 'active 0.3-1 over 0.8': 6 });
  });

  it.skipIf(!HAVE_GAME_ELF)('the ELF names no TICKERTAPETEXT (reCOM\'s, SOCOM 1); it names TEXT_GLOW', () => {
    const elf = Buffer.from(read('socom2_game.elf'));
    expect(elf.indexOf('TICKERTAPE')).toBe(-1);
    expect(elf.indexOf('TEXT_GLOW')).toBeGreaterThan(0);
  });
});
