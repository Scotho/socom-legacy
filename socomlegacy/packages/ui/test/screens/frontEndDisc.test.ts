import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import type { DialogDesign } from '../../src/dialog';

/**
 * PLAT-10 over the disc (a dev-disc test, W6.R8; web research 115 §5, §7): the front end assembled on
 * `RUN/UI/READERC.ZAR` + `READERX.ZAR` and `RUN/UIZANIM.ZAR`, stepped at PLAT-12's 29.97 Hz tick. The title gate's
 * first dialog opens and `UIanim.rdr`'s `menu_fade_up` takes MENUFADER from 1 to 0 in 1.5 s (R115.6); every dialog
 * builds and runs as a start dialog. Names, counts and the fader's values only. The disc is `SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`; with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR'];
const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

describe.skipIf(!HAVE_DISC)(`the front end over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  const setup = () => {
    const readerc = zar('RUN/UI/READERC.ZAR'), readerx = zar('RUN/UI/READERX.ZAR');
    const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
    let seed = 1;
    const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
    return { readerc, readerx, sets, random, dialog: dialogLookup([readerc, readerx]) };
  };

  it('dlgIntroScreen.rdr opens; menu_fade_up lowers MENUFADER from 1 to 0 over 1.5 s (linear, R115.6)', () => {
    const { sets, random, dialog } = setup();
    const m = new FrontEndMachine({ dialog, sets, random });
    m.boot();
    m.frame(UI_TICK_SECONDS);                                     // CG's switch to MS: the build, ONSTART
    const g = m.shell()!;
    expect(g.currentName).toBe('dlgIntroScreen.rdr');
    const fader = findNode(g.screen.root, 'MENUFADER')!;
    const at: number[] = [];
    for (let t = 1; t <= 50; t++) { m.frame(UI_TICK_SECONDS); at[t] = fader.opacity; }
    // Half way (0.75 s = 22.5 ticks) about 0.5; done by 1.5 s (45 ticks) and held at 0.
    expect(at[22]!).toBeGreaterThan(0.45);
    expect(at[23]!).toBeLessThan(0.55);
    expect(at[44]!).toBeLessThan(0.05);
    expect(at[50]).toBe(0);
    expect(g.faderAlpha).toBe(0);
  });

  it('every dialog of READERC and READERX builds as a start dialog and runs 30 frames; nine carry a movie background', () => {
    const { readerc, readerx, sets, random, dialog } = setup();
    const names = [...readerc.root.children, ...readerx.root.children].map((k) => k.name);
    expect(names).toHaveLength(114);
    const movies: string[] = [];
    for (const name of names) {
      const m = new FrontEndMachine({
        dialog, sets, random, startDialog: name,
        movie: {
          service: { background: { on: () => true, off: () => true }, play() {} },
          frame: () => 'menu', unload() {}, load: (bg: DialogDesign['background']) => { if (bg && bg.type !== 0) movies.push(name); },
        },
      });
      m.boot();
      for (let i = 0; i < 30; i++) m.frame(UI_TICK_SECONDS);
      expect(m.shell()?.design ?? null).not.toBeNull();
    }
    expect(new Set(movies).size).toBe(9);
  });
});
