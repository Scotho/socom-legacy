import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * ROUND-CHAT's look sheet for the owner (2026-11-13: "show me screenshots of the chat text with their icons. Try to match
 * the original as much as possible ... The text must also be readable"). A test instrument, no check of the game: on
 * request only (`S2U_ROUND_CHAT_LOOK=1`, with game data). Five lines per option, posted through the test room's own HUD
 * message window and the disc's font (`__viewer.roundChatPreviewLines`, devmode), over a bright map (MP6, Desert Glory)
 * and a dark one (MP7, Night Stalker), at Modern and at PS2. Each frame is saved whole and as a crop of the window; the
 * window's background is sampled before the lines are posted, for the contrast table (`look.json`).
 *   S2U_ROUND_CHAT_LOOK=1 [S2U_ROUND_CHAT_LOOK_OUT=<dir>] npx playwright test packages/viewer/e2e/zz-round-chat-look.spec.ts
 */
test.skip(!process.env['S2U_ROUND_CHAT_LOOK'], 'the look sheet runs on request: S2U_ROUND_CHAT_LOOK=1');

type C = [number, number, number];
type Line = { segments: { text: string; rgb: C }[]; icon?: string };
const GREY: C = [128, 128, 128], GREEN: C = [64, 128, 64], WHISPER: C = [128, 64, 64];   // the original's ALL, TEAM, whisper (kind 5)
const SEAL: C = [72, 100, 128], TERR: C = [128, 64, 64], SPEC: C = [115, 115, 115];       // option B's names (RC-4, provisional)
const WHISPER_LINE: Line = { segments: [{ text: 'Mike: meet me at the truck', rgb: WHISPER }] };   // a received /w, as drawn today

/** The options (the original's forms first). Icons by the HUD bitmap's name: the disc's own, or the drawn eye. */
const OPTIONS: Record<string, { title: string; lines: Line[] }> = {
  A: {
    title: 'A -- the original first: its lobby forms and colours, its own dead and spectators icons (the voice channels\')',
    lines: [
      { segments: [{ text: 'Kilo (All): stack up on the left door', rgb: GREY }] },
      { segments: [{ text: 'Viper (Team): push mid now', rgb: GREEN }] },
      { segments: [{ text: 'Echo (All): two by the truck, watch out', rgb: GREY }], icon: 'action_dead_zone.tif' },
      { segments: [{ text: 'Watcher (All): nice shot', rgb: GREY }], icon: 'action_tune_spectators.tif' },
      WHISPER_LINE,
    ],
  },
  B: {
    title: 'B -- the owner\'s loose guidance: names in SEAL blue / Terrorist red / neutral, the disc\'s skull, a drawn eye',
    lines: [
      { segments: [{ text: 'Kilo', rgb: SEAL }, { text: ': stack up on the left door', rgb: GREY }] },
      { segments: [{ text: 'Viper', rgb: TERR }, { text: ' (team): push mid now', rgb: GREEN }] },
      { segments: [{ text: 'Echo', rgb: SEAL }, { text: ': two by the truck, watch out', rgb: GREY }], icon: 'round_chat_skull' },
      { segments: [{ text: 'Watcher', rgb: SPEC }, { text: ': nice shot', rgb: GREY }], icon: 'round_chat_eye' },
      WHISPER_LINE,
    ],
  },
  B2: {
    title: 'B2 -- B with the nearest name colours that pass 4.5:1 on the bright frame (look-1\'s measure): SEAL (92,116,128), Terrorist (128,108,108)',
    lines: [
      { segments: [{ text: 'Kilo', rgb: [92, 116, 128] }, { text: ': stack up on the left door', rgb: GREY }] },
      { segments: [{ text: 'Viper', rgb: [128, 108, 108] }, { text: ' (team): push mid now', rgb: GREEN }] },
      { segments: [{ text: 'Echo', rgb: [92, 116, 128] }, { text: ': two by the truck, watch out', rgb: GREY }], icon: 'round_chat_skull' },
      { segments: [{ text: 'Watcher', rgb: SPEC }, { text: ': nice shot', rgb: GREY }], icon: 'round_chat_eye' },
      WHISPER_LINE,
    ],
  },
  C1: {
    title: 'C1 (an alternative, not the original\'s) -- the original\'s forms, colours and both its icons; only the name tinted by side',
    lines: [
      { segments: [{ text: 'Kilo', rgb: SEAL }, { text: ' (All): stack up on the left door', rgb: GREY }] },
      { segments: [{ text: 'Viper', rgb: TERR }, { text: ' (Team): push mid now', rgb: GREEN }] },
      { segments: [{ text: 'Echo', rgb: SEAL }, { text: ' (All): two by the truck, watch out', rgb: GREY }], icon: 'action_dead_zone.tif' },
      { segments: [{ text: 'Watcher', rgb: SPEC }, { text: ' (All): nice shot', rgb: GREY }], icon: 'action_tune_spectators.tif' },
      WHISPER_LINE,
    ],
  },
  C2: {
    title: 'C2 (an alternative, not the original\'s) -- no icons: the state as words in the original\'s grey, the name tinted by side',
    lines: [
      { segments: [{ text: 'Kilo', rgb: SEAL }, { text: ': stack up on the left door', rgb: GREY }] },
      { segments: [{ text: 'Viper', rgb: TERR }, { text: ' (Team): push mid now', rgb: GREEN }] },
      { segments: [{ text: '(dead) ', rgb: GREY }, { text: 'Echo', rgb: SEAL }, { text: ': two by the truck, watch out', rgb: GREY }] },
      { segments: [{ text: '(watching) ', rgb: GREY }, { text: 'Watcher', rgb: SPEC }, { text: ': nice shot', rgb: GREY }] },
      WHISPER_LINE,
    ],
  },
};
const FRAMES = [
  { map: 'MP6', label: 'bright (Desert Glory)' },
  { map: 'MP7', label: 'dark (Night Stalker)' },
] as const;
const VIEWS = ['modern', 'ps2'] as const;

/** The mean colour of a rectangle of a PNG (read in the page, which can decode it). */
async function meanColour(page: Page, png: Buffer, r: { x: number; y: number; width: number; height: number }): Promise<C> {
  return page.evaluate(async ({ b64, r }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, -r.x, -r.y);
    const d = g.getImageData(0, 0, r.width, r.height).data;
    let R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]!; G += d[i + 1]!; B += d[i + 2]!; }
    const n = d.length / 4;
    return [R / n, G / n, B / n] as [number, number, number];
  }, { b64: png.toString('base64'), r });
}
const lin = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c: C): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: C, b: C): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };
/** A HUD colour (0..128) drawn as the window draws text: x2 to the screen's 0..255, at the text's alpha over the background. */
const onScreen = (c: C, bg: C, alpha: number): C => c.map((v, i) => Math.min(255, v * 2) * alpha + bg[i]! * (1 - alpha)) as C;

test('round chat look sheet: A, B, B2, C1, C2 over a bright and a dark frame, Modern and PS2', async ({ page }, info) => {
  test.setTimeout(30 * 60_000);
  const out = process.env['S2U_ROUND_CHAT_LOOK_OUT'] ?? info.outputPath('look-1');
  mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 896 });
  const record: Record<string, unknown>[] = [];
  for (const f of FRAMES) for (const view of VIEWS) {
    await page.goto(`/testroom?map=${f.map}&mode=play&devmode&noarmory&view=${view}`);
    await page.waitForFunction(() => !!(window as any).__viewer?.feet(), undefined, { timeout: 240_000 });
    await expect(page.locator('#original-loading')).toBeHidden({ timeout: 120_000 });
    // Only the game's canvas: the test room's own panels hidden (the HUD is drawn on the canvas).
    await page.addStyleTag({ content: 'body > *:not(#view) { visibility: hidden !important; }' });
    await page.waitForTimeout(1500);
    const band = { x: 192, y: 0, width: 896, height: 230 };   // the message window's region at this viewport, both views
    const before = await page.screenshot({ clip: band });
    const bg = await meanColour(page, before, { x: 0, y: 0, width: band.width, height: band.height });
    for (const [key, o] of Object.entries(OPTIONS)) {
      expect(await page.evaluate((lines) => (window as any).__viewer.roundChatPreviewLines(lines), o.lines)).toBe(true);
      await page.waitForTimeout(400);
      const name = `${key}-${f.map}-${view}`;
      await page.screenshot({ path: join(out, `${name}.png`) });
      await page.screenshot({ path: join(out, `${name}-crop.png`), clip: band });
      const colours = [...new Set(o.lines.flatMap((l) => l.segments.map((s) => s.rgb.join(','))))].map((s) => s.split(',').map(Number) as C);
      record.push({
        option: key, title: o.title, map: f.map, frame: f.label, view, file: `${name}.png`, crop: `${name}-crop.png`,
        background: bg.map((v) => Math.round(v)),
        colours: colours.map((c) => ({
          hud: c, onScreenFull: onScreen(c, bg, 1).map(Math.round), onScreenAt0625: onScreen(c, bg, 0.625).map(Math.round),
          contrastFull: +contrast(onScreen(c, bg, 1), bg).toFixed(2), contrastAt0625: +contrast(onScreen(c, bg, 0.625), bg).toFixed(2),
        })),
      });
    }
  }
  writeFileSync(join(out, 'look.json'), JSON.stringify(record, null, 2));
});
