import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { frontEndSoundTable, soundScriptRoot, streamMember } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost, type BuiltDialog } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands } from '../../src/screens/menuCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import type { MovieService } from '../../src/movie/movieCommands';
import { textFace } from '../text/fixtures';

/**
 * The menus' music over the disc (MENU-MUSIC; a dev-disc test, W6.R8; web research 152 §2): a screen opened on
 * `RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR` with PLAT-23's cues over the disc's own front-end table (`sounds.rdr`'s
 * HUDUI, SMUS, UIVOICE) as both the zAnim `SOUND` command and the three sound rows, and MENU-01a's rows (`RebootIOP`).
 * What each start plays is the scripts': `dlgMenu` none (its `MUS_MENU_THEME` is in `CallMusicPressDemo`, which no
 * binding and no call reaches: the menu's sound is MENULOOP's own track); SOCOM II ONLINE (`dlgWorldOfSOCOM`
 * `CallMusic`) and OPTIONS (`dlgOptions_Menu` `Call_Music`) `VagStreaming(ON)` then `MUS_ONLINE_MENU`; their exits
 * `StopAllSounds` and `VagStreaming(OFF)`. Names and orders only. The disc is `SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`; with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/SOUNDRDR.ZAR'];
const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

function rig(startDialog: string) {
  const readerc = zar('RUN/UI/READERC.ZAR'), readerx = zar('RUN/UI/READERX.ZAR');
  const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
  const table = frontEndSoundTable(soundScriptRoot(new Uint8Array(readFileSync(join(DISC, 'RUN/SOUNDRDR.ZAR')))), new Map());
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  const log: string[] = [];
  let frame = 0;
  const out: UiSoundOutput = {
    // Only the music and the three rows: the HUDUI one-shots (no bank given here) are not this test's.
    play: (p) => { if (p.kind === 'stream') log.push(`${frame} stream ${p.resolution.name} ${streamMember(p.resolution.object)} vol ${p.vol} pan ${p.pan} loop ${p.resolution.object.loop}`); },
    stopAll: () => log.push(`${frame} stopAll`), fadeAll: () => log.push(`${frame} fadeAll`), streaming: (on) => log.push(`${frame} streaming ${on}`),
  };
  const cues = new UiSoundCues(table, { teletype: '', back: '', selection: '' }, [], out);
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face });
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cues.sound(cmd); } });
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd, time) => { if (/^RebootIOP$/i.test(cmd.fn ?? '')) log.push(`${frame} RebootIOP`); return dispatch(cmd, time); };
  const lookup = dialogLookup([readerc, readerx]);
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  const uiVars = new UiVarManager();
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); } }).register(host);
  let built: BuiltDialog | null = null;
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  m = new FrontEndMachine({
    dialog: (n) => lookup(n), sets, random, host, popups: slot, startDialog,
    built: (b) => { parts.built(b); built = b; }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  const run = (n: number): void => { for (let i = 0; i < n; i++) { frame++; m.frame(UI_TICK_SECONDS); } };
  const binding = (name: string): boolean => { if (!built?.scripts) throw new Error('no dialog built'); return built.scripts.startBinding(name, null); };
  return { m, run, log, binding, cues };
}
/** The log without its frame numbers. */
const what = (log: string[]): string[] => log.map((l) => l.replace(/^\d+ /, ''));

describe.skipIf(!HAVE_DISC)(`the menus' music over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('dlgMenu\'s start plays no music: no VagStreaming(ON), no stream in its first 5 s (MUS_MENU_THEME is CallMusicPressDemo\'s, bound to nothing)', () => {
    const t = rig('dlgMenu.rdr');
    t.run(150);
    expect(t.m.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(what(t.log)).toEqual([]);
  }, 120_000);

  it('SOCOM II ONLINE (dlgWorldOfSOCOM) at its start: VagStreaming(ON), then MUS_ONLINE_MENU -- MUUI0003.VPK at 0x400, pan -1, looped', () => {
    const t = rig('dlgWorldOfSOCOM.rdr');
    t.run(30);
    expect(t.m.shell()!.currentName).toBe('dlgWorldOfSOCOM.rdr');
    expect(what(t.log)).toEqual(['streaming true', 'stream MUS_ONLINE_MENU MUUI0003.VPK vol 1024 pan -1 loop true']);
    // OPTIONS on it (Goto_Options): StopAllSounds, VagStreaming(OFF) before the switch -- the screen's exit stops its music.
    expect(t.binding('Goto_Options')).toBe(true);
    t.run(5);
    expect(what(t.log).slice(2)).toEqual(['stopAll', 'streaming false']);
  }, 120_000);

  it('OPTIONS (dlgOptions_Menu) at its start: RebootIOP, a 0.25 s wait, VagStreaming(ON), MUS_ONLINE_MENU; TRIANGLE back stops it before dlgMenu', () => {
    const t = rig('dlgOptions_Menu.rdr');
    t.run(30);
    expect(what(t.log)).toEqual(['RebootIOP', 'streaming true', 'stream MUS_ONLINE_MENU MUUI0003.VPK vol 1024 pan -1 loop true']);
    const at = (s: string): number => Number(t.log.find((l) => l.endsWith(s))!.split(' ')[0]);
    expect(at('streaming true') - at('RebootIOP')).toBeGreaterThanOrEqual(7);   // WAIT 0.25 at 30 ticks a second
    expect(t.binding('Triangle_Back')).toBe(true);                               // nothing changed: no popup, the else branch
    t.run(60);
    expect(what(t.log).slice(3)).toEqual(['stopAll', 'streaming false']);
    expect(t.m.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(what(t.log).slice(5)).toEqual([]);                                    // and dlgMenu starts none
  }, 120_000);
});
