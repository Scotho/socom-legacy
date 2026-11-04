import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import type { PadSlotName } from '../../src/input/padStates';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost, type BuiltDialog } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands, type MenuCardIo } from '../../src/screens/menuCommands';
import { NetLoginCommands, type NetCnfIop, type NetCnfListView } from '../../src/screens/netLoginCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import type { ScreenScripts } from '../../src/screens/screenScripts';
import type { MovieService } from '../../src/movie/movieCommands';
import type { CaptionSource } from '../../src/text/captions';
import type { TextFace } from '../../src/text/face';
import type { UiDrawItem } from '../../src/compositor/drawList';
import { textFace } from '../text/fixtures';

/**
 * The LOGIN TO SOCOM II ONLINE rig over the disc (ONL-01; web research 144 §6): `dlgNetLogin.rdr` opened on
 * `RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR` with every module of the path registered in PLAT-08's host -- the screens'
 * rows (PLAT-10), PLAT-11's menu input (its pad a test's snapshot), PLAT-23's sound rows (a synthetic table),
 * MENU-01a's card rows over a fake `CMemCardIO` (both slots inserted and formatted), and ONL-01's NetCnf rows over a
 * fake eznetcnf (one combination on `mc0:`, none on `mc1:`, as the page's virtual card holds after OT.R3's first-use
 * write) -- so the dialog's own ANIMATIONS run as the original's would. `menuEntryDisc.test.ts`'s rig, extended with
 * the pad, the faces and the captions a frame needs. The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`.
 */
export const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
export const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR'];
export const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];

/** The one combination the page's card holds after the first-use write (research 136 §1): the row LOGIN lists. */
export const LOGIN_ENTRY = { flags: 0, key: 'Combination1', name: 'Setting 1', hardware: 'SCE/Ethernet (Network Adaptor)' } as const;

export interface NetLoginRigOptions {
  /** The faces (the drawn tests hand in the disc's); a fixture face by default. */
  face?: (name: string) => TextFace | null;
  captions?: CaptionSource | null;
  hasTexture?: (name: string) => boolean;
  /** What eznetcnf lists per device; by default one combination on `mc0:`, none on `mc1:`. */
  lists?: Record<string, NetCnfListView>;
  /** The card each port answers (`MenuCardIo`); by default both inserted and formatted. */
  card?: MenuCardIo;
  startDialog?: string;
  /** OT.R20's hold on LOGIN's connect; absent, the owner's constant (`LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER`). */
  connectHoldSeconds?: number;
}

export function netLoginRig(o: NetLoginRigOptions = {}) {
  const readerc = zar('RUN/UI/READERC.ZAR'), readerx = zar('RUN/UI/READERX.ZAR');
  const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  const outcomes: { dialog: string; o: UiCommandOutcome }[] = [];
  const fixture = textFace();
  const face = o.face ?? (() => fixture);
  const uiVars = new UiVarManager();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face, captions: o.captions ?? null, uiVars, hasTexture: o.hasTexture });
  const sound: UiSoundOutput & { log: string[] } = { log: [], play(name) { this.log.push(`play ${String(name)}`); }, stopAll() { this.log.push('stopAll'); }, fadeAll() { this.log.push('fadeAll'); }, streaming(on) { this.log.push(`streaming ${on}`); } };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cues.sound(cmd); } });   // the zAnim SOUND command (PLAT-23)
  let opened = '', builtName = '';
  const lookup = dialogLookup([readerc, readerx]);
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd, time) => { const r = dispatch(cmd, time); outcomes.push({ dialog: builtName, o: r }); return r; };
  // PLAT-11: the pad is the test's snapshot for one frame (`press`), idle otherwise.
  let held: PadSlotName | null = null;
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set<PadSlotName>(held ? [held] : []), stickX: 0, stickY: 0 }) };
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const events: number[] = [];
  const inserted = { result: 0, type: 2, format: 1 };
  const card: MenuCardIo = o.card ?? { getInfo: () => inserted, getDir: () => ({ result: -4 }), chdir: () => ({ result: -4 }), mkdir: () => -4 };
  const menuCommands = new MenuCommands({
    valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null,
    event: (kind) => { events.push(kind); m.shell()?.event(kind); }, card,
  });
  menuCommands.register(host);
  const lists = o.lists ?? { 'mc0:': { result: 1, entries: [LOGIN_ENTRY] }, 'mc1:': { result: 0, entries: [] } };
  const iopCalls: string[] = [];
  const iop: NetCnfIop = {
    combinationList: (d) => { iopCalls.push(`list ${d}`); return lists[d] ?? { result: 0, entries: [] }; },
    selectCombination: (d, k) => { iopCalls.push(`select ${d} ${k}`); return lists[d]?.entries.some((e) => e.key === k) ? 0 : -1; },
    interfaces: () => [LOGIN_ENTRY.hardware],
  };
  const netLogin = new NetLoginCommands({
    valves: () => m.valves, uiVars, iop, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null,
    event: (kind) => { events.push(kind); m.shell()?.event(kind); },
    ...(o.connectHoldSeconds === undefined ? {} : { connectHoldSeconds: o.connectHoldSeconds }),
  });
  netLogin.register(host);
  let built: BuiltDialog | null = null;
  const scripts = (): ScreenScripts => { if (!built?.scripts) throw new Error('no dialog built'); return built.scripts; };
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  let last: UiDrawItem[] = [];
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, random, host, popups: slot, startDialog: o.startDialog ?? 'dlgNetLogin.rdr',
    build: { face, captions: o.captions ?? null },
    built: (b) => { parts.built(b); built = b; builtName = opened; }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  const frame = (): void => { last = m.frame(UI_TICK_SECONDS); };
  /** `n` frames; the dialog names seen, in order. */
  const run = (n = 1): string[] => { const seen: string[] = [m.shell()?.currentName ?? '']; for (let i = 0; i < n; i++) { frame(); const c = m.shell()?.currentName ?? ''; if (seen[seen.length - 1] !== c) seen.push(c); } return seen; };
  /** One button down for one frame (FALLING), up the next (RISING), then `settle` idle frames. */
  const press = (name: PadSlotName, settle = 2): void => { held = name; frame(); held = null; for (let i = 0; i < settle; i++) frame(); };
  const notImplemented = (dialog?: string): string[] => {
    const out: string[] = [];
    for (const x of outcomes) if (x.o.kind === 'not-implemented' && (dialog === undefined || x.dialog === dialog)) out.push(`${x.dialog}: ${x.o.row.name} (${x.o.task})`);
    return out;
  };
  const tableHits = (name: string): number => outcomes.filter((x) => x.o.kind === 'table' && x.o.row.name === name).length;
  /** The ring's focused control, or ''. */
  const focused = (): string => input.ring()?.focused?.name ?? '';
  /** A TEXT node's codes as a string (the captions' decoded text, research 111). */
  const text = (node: string): string => {
    const n = findText(m.shell()?.screen.root, node);
    return n ? String.fromCharCode(...n) : '';
  };
  return { m, parts, input, uiVars, run, frame, press, outcomes, notImplemented, tableHits, sound, events, iopCalls, scripts, menuCommands, netLogin, focused, text, last: () => last };
}

function findText(root: { name: string; children: { name: string; children: unknown[]; content: unknown }[] } | undefined, name: string): number[] | null {
  if (!root) return null;
  const stack: unknown[] = [...root.children];
  while (stack.length) {
    const n = stack.shift() as { name: string; children: unknown[]; content: { kind: string; text?: { codes: number[] } } | null };
    if (n.name.toLowerCase() === name.toLowerCase()) return n.content?.kind === 'text' ? n.content.text?.codes ?? null : null;
    stack.push(...n.children);
  }
  return null;
}
