import { THEME_TRIM } from './adapters/options';
import { BACKDROP_URL } from './backdrop';
import { THEMES, hex } from './render/theme';
import { SAMPLE_DATA, THEME_PANEL_ROW, type Adapters, type DiscSource, type DiscState, type OptCat, type OptRow, type Room, type RoomFilter } from './state';

/**
 * SAMPLE DATA -- the S2U Briefing design system's "Console launcher" prototype's sample values, verbatim: its room
 * names, counts and pings, its Options rows and values, its persona, its timings (the disc read in 1.2 s, the sign-in
 * in 0.9 s). The owner's direction: "Room names, counts, pings and Options values in the prototype are sample data;
 * use what the server and emulator report." So these adapters carry `SAMPLE_DATA` and the page says so (the header's
 * "Prototype states" tag); the real adapters, the server's and the emulator's, replace them in slice 2. Nothing here
 * is a value of the original game.
 */

/* The prototype's ROOMS, as it wrote them (`ping` in ms, the two sides as `seals` / `terr`, `art` the sample picture). */
const ROOMS = [
  { name: 'Alpha', map: 'Frostfire', mode: 'Suppression', n: 16, cap: 16, ping: 32, seals: 8, terr: 8 },
  { name: 'Bravo', map: 'Crossroads', mode: 'Suppression', n: 8, cap: 16, ping: 48, seals: 4, terr: 4, art: true },
  { name: 'Charlie', map: 'Blizzard', mode: 'Demolition', n: 7, cap: 8, ping: 96, seals: 4, terr: 3 },
  { name: 'Delta', map: 'Sandstorm', mode: 'Extraction', n: 5, cap: 12, ping: 41, seals: 3, terr: 2 },
  { name: 'Echo', map: 'Fish Hook', mode: 'Demolition', n: 3, cap: 8, ping: 164, seals: 2, terr: 1 },
  { name: 'Foxtrot', map: 'Abandoned', mode: 'Suppression', n: 2, cap: 16, ping: 38, seals: 1, terr: 1 },
];
const FILTERS = ['All modes', 'Suppression', 'Demolition', 'Extraction', 'Open slots'];

const PCT = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];

/**
 * LR-5 (review-lr-5 F3): Appearance in the sample, as the live adapter draws it (`adapters/options` `appearance`): the
 * artifact's seven themes and its two pictures as picks (`theme:<i>`, `backdrop:<i>`; the picked one by the held index),
 * then the moved rows (Backdrop motion, Launcher sounds and their volume) and the clock. SAMPLE DATA: the values are the
 * sample's, held in memory.
 */
const PICKED_NOTE = 'Saved to this browser. Applies now.';
const THEME_ABOUT = 'The launcher’s colours and the sheets behind it. The game is not changed.';
const PICTURE_ABOUT = 'What sits behind the wave: nothing, or the Crossroads picture darkened.';
const SAMPLE_PICTURES = [{ label: 'None', hint: 'Wave only' }, { label: 'Crossroads', hint: 'Darkened behind the wave', thumb: BACKDROP_URL }] as const;
const OFF_ON_SAMPLE = ['Off', 'On'] as const;
/** LR-13 (LR.R16 (2)): the sample's "Theme & background" panel (the live adapter's `panel('theme')`): the theme and picture picks. */
function themePanelRows(held: (id: string) => number): OptRow[] {
  const pick = (group: string, i: number, label: string, about: string, extra: NonNullable<OptRow['pick']> extends infer P ? Partial<P> : never, section?: string): OptRow =>
    ({ id: `${group}:${i}`, label, action: 'Pick', about, note: PICKED_NOTE, pick: { group, picked: held(group) === i, ...extra }, ...(section !== undefined ? { section } : {}) });
  return [
    ...THEMES.map((t, i) => pick('theme', i, t.label, THEME_ABOUT, { hint: t.note, swatch: [t.top, hex(t.sheet), t.gold ? THEME_TRIM : hex(t.glow)] as const }, i === 0 ? 'Theme' : undefined)),
    ...SAMPLE_PICTURES.map((p, i) => pick('backdrop', i, p.label, PICTURE_ABOUT, { hint: p.hint, ...('thumb' in p ? { thumb: p.thumb } : {}) }, i === 0 ? 'Background picture' : undefined)),
  ];
}
function appearanceRows(held: (id: string) => number): OptRow[] {
  return [
    // LR-13 (LR.R16 (2)): the link to the panel, its words the artifact's (the theme, then the picture or "Wave only").
    { id: THEME_PANEL_ROW, label: 'Theme & background', link: true, action: `${THEMES[held('theme')]?.label ?? ''} · ${held('backdrop') === 0 ? SAMPLE_PICTURES[0].hint : SAMPLE_PICTURES[1].label}`, about: 'The launcher’s colours and what sits behind the wave: pick a theme and a background picture.', note: PICKED_NOTE },
    { id: 'drift', label: 'Backdrop motion', values: OFF_ON_SAMPLE, def: 0, about: 'A slow drift across the backdrop picture. Always off when your system asks for reduced motion.', note: 'Applies now.' },
    { id: 'clock', label: 'Clock', values: ['24-hour', '12-hour'], def: 0, about: 'The clock in the launcher’s header, 24-hour or 12-hour.', note: 'Applies now.' },
    { id: 'sounds', label: 'Launcher sounds', values: OFF_ON_SAMPLE, def: 1, about: 'Short sounds as you move, choose and go back in the launcher. The game’s own sound is not changed.', note: 'Applies now.' },
    { id: 'soundVolume', label: 'Launcher sound volume', values: Array.from({ length: 11 }, (_, i) => `${i * 10}%`), def: 7, about: 'How loud the launcher’s sounds are.', note: 'Applies now.' },
  ];
}

/* The prototype's OPT_CATS, verbatim. */
export const SAMPLE_OPT_CATS: readonly OptCat[] = [
  { id: 'display', label: 'Display', icon: 'display', rows: [
    { id: 'res', label: 'Internal resolution', values: ['1× · 480p', '2× · 720p', '3× · 1080p', '4× · 1440p'], def: 2, about: 'How sharply the game is drawn. Higher looks cleaner on a big TV but needs a faster computer.', note: 'Takes effect the next time you press START.' },
    { id: 'aspect', label: 'Aspect ratio', values: ['4:3 original', '16:9 widescreen'], def: 1, about: 'Widescreen fills a modern TV. Original keeps the 2003 frame with bars at the sides.', note: 'Takes effect the next time you press START.' },
    { id: 'fps', label: 'Frame rate', values: ['30 FPS', '60 FPS'], def: 1, about: 'SOCOM II ran at 30 frames a second on the PS2. 60 is smoother where your computer can hold it.', note: 'Takes effect the next time you press START.' },
    { id: 'smooth', label: 'Picture smoothing', values: ['Sharp', 'Smooth'], def: 0, about: 'Sharp keeps hard pixel edges. Smooth softens them, closer to an old TV.', note: 'Takes effect the next time you press START.' },
    { id: 'scan', label: 'Scanline overlay', values: ['Off', 'On'], def: 1, about: 'Faint horizontal lines over the launcher, like the briefing room’s CRT.', note: 'Applies now.' },
    { id: 'uiscale', label: 'Interface size', values: ['100%', '115%', '130%'], def: 0, about: 'Makes every word and control in the launcher larger. Use it if you sit far from the screen.', note: 'Applies now.' },
    { id: 'drift', label: 'Backdrop motion', values: ['Off', 'On'], def: 1, about: 'A slow drift across the backdrop picture. Always off when your system asks for reduced motion.', note: 'Applies now.' },   // def 1: the prototype's own value, verbatim (OPT_CATS); the sample's Appearance and the live adapter default it to 0
  ] },
  { id: 'audio', label: 'Audio', icon: 'volume', rows: [
    { id: 'master', label: 'Master volume', values: PCT, def: 8, about: 'Overall loudness of the game.', note: 'Saved to this browser.' },
    { id: 'music', label: 'Music', values: PCT, def: 6, about: 'Menu and mission music.', note: 'Saved to your memory card.' },
    { id: 'sfx', label: 'Effects', values: PCT, def: 8, about: 'Weapons, footsteps and the world.', note: 'Saved to your memory card.' },
    { id: 'voice', label: 'Voice chat volume', values: PCT, def: 8, about: 'How loud your teammates are.', note: 'Saved to your memory card.' },
  ] },
  { id: 'controller', label: 'Controller', icon: 'pad', rows: [
    { id: 'dead', label: 'Stick dead zone', values: ['16%', '20%', '24%', '28%', '32%'], def: 2, about: 'How far the stick moves before anything happens. Raise it if your aim drifts on its own.', note: 'Saved to this browser.' },
    { id: 'vib', label: 'Vibration', values: ['Off', 'On'], def: 1, about: 'Rumble when you fire and take hits, where your controller supports it.', note: 'Saved to this browser.' },
    { id: 'invert', label: 'Invert look', values: ['Off', 'On'], def: 0, about: 'Pushing up looks down.', note: 'Saved to your memory card.' },
    { id: 'remap', label: 'Button mapping', action: 'Remap', hint: 'Choose what each button does', about: 'Choose which button does what, action by action.', note: 'Opens the mapping screen.' },
  ] },
  { id: 'network', label: 'Network', icon: 'network', rows: [
    { id: 'pingshow', label: 'Show ping in rooms', values: ['Off', 'On'], def: 1, about: 'Shows each room’s connection quality in the room list.', note: 'Saved to this browser.' },
    { id: 'test', label: 'Connection test', action: 'Run test', hint: 'Checks reach and latency', about: 'Checks that the server can be reached and how long a round trip takes.', note: 'Takes a few seconds.' },
  ] },
  { id: 'account', label: 'Account', icon: 'user', rows: [
    { id: 'remember', label: 'Remember me on this browser', values: ['Off', 'On'], def: 0, about: 'Keeps you signed in after you close the browser. Leave it off on a shared computer.', note: 'Off by default.', needsSignIn: true },
    { id: 'signout', label: 'Sign out', action: 'Sign out', about: 'Signs you out of the server on this browser.', note: 'Your memory card is not changed.', needsSignIn: true },
  ] },
  { id: 'app', label: 'App', icon: 'install', rows: [
    { id: 'install-app', label: 'Install app', action: 'Open', about: 'Add SOCOM II Legacy to this device with its own icon and window.', note: 'The browser offers installation where supported.' },
    { id: 'disc-kept', label: 'Remove downloaded content', action: 'Remove', locked: 'Nothing stored', about: 'Remove disc files kept in this browser.', note: 'Memory cards, profiles and preferences are kept.' },
    { id: 'scan', label: 'Scanline overlay', values: ['Off', 'On'], def: 1, about: 'Faint horizontal lines over the launcher.', note: 'Applies now.' },
  ] },
  // LR-5: Appearance (Backdrop motion moved here from App), the picked ones at the defaults.
  { id: 'appearance', label: 'Appearance', icon: 'palette', rows: appearanceRows(() => 0) },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/**
 * SAMPLE DATA, not the prototype's (CX-10a): the folder the sample "Choose disc folder" reads, for the browser spec and
 * the screenshots -- a name only, in `../discSource` `discLabel`'s form; read in the prototype's 1.2 s, as its image.
 */
const SAMPLE_FOLDER = 'SOCOM2';

/** The prototype's sample adapters: a fresh set per call (each test and the page its own). */
export function sampleAdapters(): Adapters {
  let disc: DiscState = 'ready';
  let discKind: 'image' | 'folder' = 'image';
  // SAMPLE DATA, not the prototype's (CX-16): the dropdown's active source, the image's to start with, as the live page's.
  let source: DiscSource = 'image';
  let signedIn = true;
  let pad = true;
  let mic = false;
  const persona = 'SPECTER';
  const rooms: Room[] = ROOMS.map((r) => ({
    id: r.name, name: r.name, map: r.map, mode: r.mode, n: r.n, cap: r.cap, pingMs: r.ping,
    sides: { seals: r.seals, terr: r.terr }, ...(r.art ? { art: BACKDROP_URL } : {}),
  }));
  const filters: RoomFilter[] = FILTERS.map((label, f) => ({
    label,
    keep: (r: Room) => (f === 0 ? true : f === 4 ? r.cap !== null && r.n < r.cap : r.mode === label),
  }));
  const values = new Map<string, number>();
  for (const c of SAMPLE_OPT_CATS) for (const r of c.rows) if (r.values) values.set(r.id, r.def ?? 0);
  values.set('theme', 0); values.set('backdrop', 0);                 // the picks' groups (LR-5)
  const rowOf = (id: string) => SAMPLE_OPT_CATS.flatMap((c) => c.rows).find((r) => r.id === id);
  const totals = () => ({ players: rooms.reduce((a, r) => a + r.n, 0), rooms: rooms.length });

  return {
    data: SAMPLE_DATA,
    disc: {
      state: () => disc,
      title: () => (discKind === 'folder' ? SAMPLE_FOLDER : 'SOCOM II'),
      kind: () => discKind,
      label: () => (discKind === 'folder' ? `the disc folder ${SAMPLE_FOLDER}` : ''),
      source: () => source,
      setSource(src) { source = src; },
      async choose() {
        disc = 'reading';
        discKind = 'image';
        source = 'image';
        await sleep(1200);
        disc = 'ready';
        return true;
      },
      async chooseFolder() {
        disc = 'reading';
        discKind = 'folder';
        source = 'folder';
        await sleep(1200);
        disc = 'ready';
        return true;
      },
    },
    pad: { connected: () => pad, setConnected(on) { pad = on; } },
    mic: { on: () => mic, async toggle() { mic = !mic; return mic; } },
    card: { persona: () => persona, slot: () => 1, personas: () => 1 },
    session: {
      signedIn: () => signedIn,
      persona: () => persona,
      async signIn() {
        await sleep(900);
        signedIn = true;
        return { ok: true };
      },
      async signOut() { signedIn = false; },
    },
    rooms: { list: () => rooms, filters: () => filters, updated: () => 'just now', async refresh() { /* sample: nothing to fetch */ } },
    options: {
      categories: () => SAMPLE_OPT_CATS.map((c) => (c.id === 'appearance' ? { ...c, rows: appearanceRows((g) => values.get(g) ?? 0) } : c)),
      panel: (id) => (id === 'theme' ? { id: 'theme', label: 'Theme & background', icon: 'palette', rows: themePanelRows((g) => values.get(g) ?? 0) } : null),
      value: (id) => values.get(id) ?? 0,
      set(id, v) { values.set(id, v); },
      reset(id) { values.set(id, rowOf(id)?.def ?? 0); },
      async action(id) {
        if (id === 'test') return 'Server reached · 48 ms round trip (sample)';
        const p = /^(theme|backdrop):(\d+)$/.exec(id);                 // LR-5: a pick, said as the live adapter says it
        if (p) {
          const at = Number(p[2]);
          values.set(p[1]!, at);
          return `${p[1] === 'theme' ? 'Theme' : 'Background'}: ${p[1] === 'theme' ? THEMES[at]?.label : SAMPLE_PICTURES[at]?.label}`;
        }
        if (id === 'remap') return 'Button mapping: not drawn in this prototype';
        return null;
      },
    },
    replays: { count: () => 0, async refresh() { /* sample: none */ } },
    server: {
      status: () => ({ word: 'ONLINE', ready: true, line: 'Online' }),
      totals,
      pages: () => [],
      async refresh() { /* sample: nothing to fetch */ },
      openPage() { /* sample: the toast says where it would go */ },
    },
    states: {
      rows: () => [['Disc', disc === 'ready' ? 'Ready' : 'Empty'], ['Signed in', signedIn ? 'Yes' : 'No'], ['Controller', pad ? 'Connected' : 'None yet']],
      flip(i) {
        if (i === 0) disc = disc === 'ready' ? 'empty' : 'ready';
        else if (i === 1) signedIn = !signedIn;
        else if (i === 2) pad = !pad;
      },
    },
  };
}
