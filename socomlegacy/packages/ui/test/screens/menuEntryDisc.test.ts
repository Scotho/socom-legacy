import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands } from '../../src/screens/menuCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import type { BuiltDialog } from '../../src/screens/dialogParts';
import type { ScreenScripts } from '../../src/screens/screenScripts';
import type { MovieService } from '../../src/movie/movieCommands';
import { textFace } from '../text/fixtures';

/**
 * MENU-01a over the disc (a dev-disc test, W6.R8; web research 138 §3): the main menu opened on `RUN/UI/READERC.ZAR`
 * and `RUN/UIZANIM.ZAR` with every module of the path registered in PLAT-08's host -- the screens' rows (PLAT-10),
 * `SuspendMenuInput` (PLAT-11), the sound rows (PLAT-23) and this task's -- and ONLINE pressed: `dlgMenu` ->
 * `do_multi_or_medius` -> `dlgMPswitch` -> `dlgNetLogin` (M4; research 128 R128.1-R128.2) through the real command
 * bodies: no `not implemented` outcome until LOGIN's own ONSTART (whose rows are ONL-01's). The CROSS binding is
 * started as an event's would be (`startBinding`), PLAT-11's walk to the button being its own test. Names and valve
 * values only. The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR'];
const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];

function rig() {
  const readerc = zar('RUN/UI/READERC.ZAR'), readerx = zar('RUN/UI/READERX.ZAR');
  const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  const outcomes: { dialog: string; o: UiCommandOutcome }[] = [];
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  let opened = '', builtName = '';                                  // the dialog opened, then built, last (a switch names its target before the build)
  const lookup = dialogLookup([readerc, readerx]);
  const dispatch = host.dispatch.bind(host);                        // every outcome, tagged with that dialog
  host.dispatch = (cmd, time) => { const o = dispatch(cmd, time); outcomes.push({ dialog: builtName, o }); return o; };
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  const sound: UiSoundOutput & { log: string[] } = { log: [], play() {}, stopAll() { this.log.push('stopAll'); }, fadeAll() { this.log.push('fadeAll'); }, streaming(on) { this.log.push(`streaming ${on}`); } };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const uiVars = new UiVarManager();
  const events: number[] = [];
  const menuCommands = new MenuCommands({
    valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null,
    event: (kind) => { events.push(kind); m.shell()?.event(kind); },
  });
  menuCommands.register(host);
  let built: BuiltDialog | null = null;
  const scripts = (): ScreenScripts => { if (!built?.scripts) throw new Error('no dialog built'); return built.scripts; };
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, random, host, popups: slot, startDialog: 'dlgMenu.rdr',
    built: (b) => { parts.built(b); built = b; builtName = opened; }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  const run = (n = 1): string[] => { const seen: string[] = [m.shell()?.currentName ?? '']; for (let i = 0; i < n; i++) { m.frame(UI_TICK_SECONDS); const c = m.shell()?.currentName ?? ''; if (seen[seen.length - 1] !== c) seen.push(c); } return seen; };
  const notImplemented = (dialog?: string): string[] => {
    const out: string[] = [];
    for (const x of outcomes) if (x.o.kind === 'not-implemented' && (dialog === undefined || x.dialog === dialog)) out.push(`${x.dialog}: ${x.o.row.name} (${x.o.task})`);
    return out;
  };
  const tableHits = (name: string) => outcomes.filter((x) => x.o.kind === 'table' && x.o.row.name === name).length;
  return { m, run, outcomes, notImplemented, tableHits, sound, events, uiVars, scripts, menuCommands };
}

describe.skipIf(!HAVE_DISC)(`the main menu's commands over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('dlgMenu\'s ONSTART runs through the real bodies: no row is left to a later task; the card rows answer the empty card', () => {
    const t = rig();
    t.run(1);                                                       // CG's switch to MS: the build, ONSTART
    expect(t.m.shell()!.currentName).toBe('dlgMenu.rdr');
    t.run(90);                                                      // 3 s: SetMenuValve's second sequence, ActivateMenuBtns, has_memcard_changed's first polls
    expect(t.notImplemented()).toEqual([]);
    expect(t.outcomes.every((x) => x.dialog === 'dlgMenu.rdr')).toBe(true);
    for (const row of ['CleanupMissionMemory', 'GetNumSavedGames', 'MC_Exists', 'MC_Changed', 'FlushMenuHistory', 'SuspendMenuInput', 'ActivateButton']) {
      expect(t.tableHits(row), row).toBeGreaterThan(0);
    }
    expect(t.tableHits('MC_Exists')).toBe(2);                       // Ensure_MC_Dirs_Fast: `..` and the save folder
    expect(t.tableHits('MC_ChDir')).toBe(0);                        // neither exists on the empty card
    expect(t.m.valves.find('GotSaveGames')!.value).toBe(0);         // no save: NEW GAME is the top item (M3)
    expect(t.m.valves.find('MenuButtonChanged')!.value).toBe(1);
    expect(t.m.valves.find('memcard_error')?.value ?? 0).toBe(0);
    expect(t.events).toEqual([]);                                   // no MEMCARD_ERROR
  }, 120_000);

  it('ONLINE: do_multi_or_medius -> dlgMPswitch (StopStreaming: VagStreaming OFF) -> dlgNetLogin, every row on the way answered', () => {
    const t = rig();
    t.run(3);
    expect(t.scripts().startBinding('do_multi_or_medius', null)).toBe(true);
    const seen = t.run(150);                                        // 5 s: two switches with their fades, LOGIN's ONSTART and its 2-s WAIT
    expect(seen).toEqual(['dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.m.valves.find('ComeFromLan')!.value).toBe(0);
    expect(t.m.valves.find('CurrentMission')!.value).toBe(0);
    expect(t.sound.log).toContain('streaming false');
    expect(t.notImplemented('dlgMenu.rdr')).toEqual([]);
    expect(t.notImplemented('dlgMPswitch.rdr')).toEqual([]);
    // LOGIN's ONSTART (research 128 §2.3) runs this task's rows and ONL-01's: the latter are what is left.
    const hits = (name: string) => t.outcomes.filter((x) => x.dialog === 'dlgNetLogin.rdr' && x.o.kind === 'table' && x.o.row.name === name).length;
    for (const row of ['SuspendMenuInput', 'ClearUIVar', 'IsMemCardInserted', 'IsMemCardFormatted', 'MC_Changed', 'TestUIVar', 'PopUpDialog', 'KillPopUp']) expect(hits(row), row).toBeGreaterThan(0);
    expect([...new Set(t.notImplemented('dlgNetLogin.rdr').map((l) => l.split(': ')[1]))]).toEqual(['NetCnfInit (ONL-01)', 'NetGetInterfaceList (ONL-01)']);
  }, 120_000);

  it('the LAN item goes the same way (go_to_LAN_play, ComeFromLan = 1)', () => {
    const t = rig();
    t.run(3);
    expect(t.scripts().startBinding('go_to_LAN_play', null)).toBe(true);
    expect(t.run(150)).toEqual(['dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.m.valves.find('ComeFromLan')!.value).toBe(1);
  }, 120_000);
});
