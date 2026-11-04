import type { HudElement } from '../src/hud';

/**
 * PAR-48c (PARITY-2; issue #138's closing bar): what a spectator's and a dead player's HUD draws and hides, as one check
 * the rendered specs (`./spectatorHud.spec.ts` on `/testroom`, `./spectatorHudMenu.spec.ts` on the front end's match)
 * and its unit test (`../test/spectatorHudSet.test.ts`) share -- so the unit test proves the specs' own check fails on
 * an element taken away or a hidden one drawn. Pure, and nothing of `../src/hud` at run time (three.js stays out of the
 * specs' Node side): the names are its `HudElement`s, and the unit test holds each list against its own sets
 * (`SPECTATOR_HIDES`, `SCOREBOARD_HIDES`, `OWN_BODY_HIDES`) and the placeholders `PORT_GAPS` stands for.
 *
 * The sets are research 282's reading (reviewed; the original's dispatch `FUN_001f7ff0` D:L56564-56600, research 282 §1
 * and §5's table; research 276 §7's element table), not measured against the original: no capture of a spectator's
 * console exists. Where the original draws what the port cannot yet (a named placeholder), the check asks what the port
 * draws and says so (`PORT_GAPS`); when a placeholder is settled the unit test goes red and this file follows it.
 */

/** A step of the rendered checks: the view's path and what is up. */
export type SpectatorHudStep =
  /** A lobby spectator (`FUN_001f9160` D:L56863-56896) in the free camera, on a scenic view, following a player. */
  | 'free' | 'scenic' | 'follow'
  /** A spectator with SELECT held (`FUN_0022be20`; D:L56808-56827). */
  | 'scoreboard'
  /** A dead player watching a teammate (`FUN_001f9f20` D:L57174-57183). */
  | 'teammate'
  /** A dead player on his own body (`FUN_001f97b0` D:L57112-57118). */
  | 'own';

/** What a step is judged on, read off the page's `Hud.state()` (`readOf`) and its reticle where the page has a read. */
export interface SpectatorHudRead {
  /** `Hud.state().visible`: anything drawn. */
  visible: boolean;
  /** The elements drawn (`Hud.state().rects`' keys: what the frame's quads carry). */
  drawn: readonly string[];
  /** The view's path (`HudSpectatorView.path`, absent 'spectator'); null: the walker's HUD. */
  path: 'spectator' | 'teammate' | 'own' | null;
  /** The viewed body's name on the info box (`HudSpectatorView.followed.name`); null: none. */
  followed: string | null;
  /** The help lines' share of their alpha (`Hud.state().timing.help`; absent 1). */
  help: number | null;
  /** The reticle drawn (`/testroom`'s `reticle().visible`); null: the page has no read (the front end's match hook). */
  reticle: boolean | null;
  /**
   * LATER 117: the weapon box's icon bitmap drawn (`Hud.state().icon`); null: none drawn, or a page whose read has none.
   * The console seat's note: presence alone would pass a page drawing the dead player's own icon on a teammate, so the
   * `teammate` step compares it with the watched teammate's held item's (`spectatorHudFindings`' `icon`).
   */
  icon: string | null;
}

/** The part of `Hud.state()` (`HudView`) a read takes: structural, so a page's JSON answer fits it. */
export interface HudStateLike {
  visible: boolean;
  rects: Partial<Record<string, unknown>>;
  model: { spectator?: { path?: 'spectator' | 'teammate' | 'own'; followed: { name: string } | null } | null };
  timing: { help?: number };
  /** LATER 117: `HudView.icon`, the weapon box's icon bitmap drawn; absent: none. */
  icon?: string | null;
}

/** A page's `Hud.state()` (and its reticle, null with no read) as the check reads it. */
export function readOf(view: HudStateLike, reticle: boolean | null): SpectatorHudRead {
  const v = view.model.spectator ?? null;
  return {
    visible: view.visible, drawn: Object.keys(view.rects).filter((k) => view.rects[k] !== undefined),
    path: v ? v.path ?? 'spectator' : null, followed: v?.followed?.name ?? null, help: view.timing.help ?? null, reticle,
    icon: view.icon ?? null,
  };
}

/**
 * The placeholders that leave the port short of the original, as booleans the unit test holds against `../src/hud`:
 * - `followedBar`: the followed body's health bar (`FUN_00238500` D:L85555-85556) -- LATER 119: drawn on a follow and on a
 *   teammate from the room's part bytes (SPECTATOR_FOLLOWED_HEALTH_READING, research 282 §4; was: not drawn).
 * - `ownInfo`: the spectator's own object's bar and name in free and scenic (SPECTATOR_OWN_INFO_PLACEHOLDER, §4).
 * - `number`: the number at (587, 433) for a seat viewing another (SPECTATOR_INFO_NUMBER_PLACEHOLDER, §6).
 * (Was also `teammateWeaponBox`, DEAD_WATCH_WEAPON_BOX_PLACEHOLDER -- retired by LATER 117: the `teammate` step asks the
 * box's panel and the watched teammate's icon, `TEAMMATE_BOX`.)
 */
export const PORT_GAPS = { followedBar: true, ownInfo: false, number: false } as const;

/** The weapon box (`FUN_00237de0`, hidden by the hide-all D:L56340; its show refuses a spectator, D:L85354). */
export const WEAPON_BOX: readonly HudElement[] = ['panel', 'rounds', 'mags', 'icon', 'firemode'];
/**
 * LATER 117 (research 282 §9): what a dead player watching a teammate keeps of the box -- the panel and its child the
 * icon, the teammate's held item's (`FUN_00237e50` D:L57180, D:L85358); its group `+0x270` (rounds, MAGS, the fire-mode
 * cells) is hidden when the viewed actor is not the local one (D:L85367-85371). `TEAMMATE_HIDES` in `../src/hud`.
 */
export const TEAMMATE_BOX: readonly HudElement[] = ['panel', 'icon'];
/** The compass ring and the marks' parent (`FUN_00212260`, D:L56359; D:L68360-68369); a dead body's own too (D:L57115). */
export const COMPASS: readonly HudElement[] = ['compass', 'marks'];
/**
 * The prompts `+0x174d0` and their children, the bomb's hold bar among them (D:L56325; PB-8); the C4 fuse bar with them
 * (OT.R64, an adaptation the HUD hides in the same group, `SPECTATOR_HIDES`).
 */
export const PROMPTS: readonly HudElement[] = ['action', 'actionSides', 'actionCaption', 'holdBar', 'c4FuseBar'];
/** The stance word `+0x11ca0` (D:L56328), the ZOOM line `+0x744` (D:L56338) and the scope's range `+0x165a0` (D:L56326). */
export const VIEW_LINES: readonly HudElement[] = ['stance', 'zoom', 'scopeRange'];
/** What the hide-all `FUN_001f77c0` (D:L56312-56361) takes from a seat viewing another: research 282 §1 (`SPECTATOR_HIDES` less the number). */
export const SPECTATOR_HIDDEN: readonly HudElement[] = [...WEAPON_BOX, ...COMPASS, ...PROMPTS, ...VIEW_LINES];
/**
 * What SELECT held takes away (D:L56808-56827, research 282 §1: the weapon box, the info box D:L56811, the compass, the
 * panel D:L56813, the prompts, the help lines D:L56817-56823, the timer, the number D:L56826; the voice element with the
 * info box, D:L85523): `SCOREBOARD_HIDES`.
 */
export const SCOREBOARD_HIDDEN: readonly HudElement[] = [
  'panel', 'rounds', 'mags', 'icon', 'firemode', 'compass', 'marks', 'action', 'actionSides', 'actionCaption', 'timer',
  'holdBar', 'c4FuseBar', 'bar', 'name', 'box', 'range', 'spectatorInfo', 'help', 'voice',
];

/** Why each element is asked drawn or hidden: the line of research 282 or 276 §7 that says so. */
const WHY: Partial<Record<string, string>> = {
  timer: 'the round timer, shown each frame with the SPECTATOR HUD option on (D:L56803-56806; research 282 §1)',
  box: "the info box, shown by the spectator's and the watching paths (D:L56875-56879, D:L57176-57179; research 282 §1)",
  name: "the viewed body's name on the info box (`FUN_00238500` D:L85558-85576; research 282 §4)",
  bar: "the info box bar: the followed body's (SPECTATOR_FOLLOWED_HEALTH_READING); the own object's not drawn while SPECTATOR_OWN_INFO_PLACEHOLDER stands (research 282 §4)",
  range: 'the number: not drawn while SPECTATOR_INFO_NUMBER_PLACEHOLDER stands (research 282 §6)',
  spectatorInfo: "the CSpectatorInfo panel `+0x18280`, a spectator seat's only (D:L56875-56879, D:L57116-57118, D:L57181-57183; research 282 §2)",
  help: "the help lines: the spectator's four (D:L56869-56872, D:L56881-56895; research 282 §3), a dead player's six (FUN_001f97b0 D:L56996-57107, FUN_001f9f20 D:L57149-57173; research 282 §8)",
  scoreboard: 'the scoreboard, SELECT held (`FUN_0022be20`; research 282 §5)',
  compass: 'the compass ring (`FUN_00212260` D:L56359; a dead body of his own, D:L57115)',
  marks: "the compass's marks (`FUN_00212260` D:L56359; D:L68360-68369)",
  action: 'the prompts (D:L56325)',
  actionSides: "the prompt's side words, its children, hidden with it (D:L56325)",
  actionCaption: "the prompt's caption, its child, hidden with it (D:L56325)",
  holdBar: "the prompts' hold bar (D:L56325; PB-8)",
  c4FuseBar: 'the C4 fuse bar, hidden with the prompts (OT.R64, an adaptation; research 209 section 17)',
  stance: 'the stance word (D:L56328)', zoom: 'the ZOOM line (D:L56338)', scopeRange: "the scope's range (D:L56326)",
  panel: 'the weapon box (D:L56340)', rounds: 'the weapon box (D:L56340)', mags: 'the weapon box (D:L56340)',
  icon: 'the weapon box (D:L56340)', firemode: 'the weapon box (D:L56340)',
};
const why = (e: string): string => WHY[e] ?? 'research 282 §5';
/** LATER 117: on a teammate the box is the watched one's (research 282 §9), its own lines. */
const WHY_TEAMMATE: Partial<Record<string, string>> = {
  panel: "the watched teammate's weapon box, shown (`FUN_00237e50` D:L57180, D:L85358; research 282 §9)",
  icon: "the watched teammate's held item's icon (`FUN_00237760` D:L85245-85249; research 282 §9)",
  rounds: "the box's group `+0x270`, hidden on a teammate (D:L85367-85371; research 282 §9)",
  mags: "the box's group `+0x270`, hidden on a teammate (D:L85367-85371; research 282 §9)",
  firemode: "the box's group `+0x270`, hidden on a teammate (D:L85367-85371; research 282 §9)",
};
const whyAt = (step: SpectatorHudStep, e: string): string => (step === 'teammate' ? WHY_TEAMMATE[e] : undefined) ?? why(e);

/** What the rendered checks ask of the help lines: lit now (`'shown'`), or drawn exactly while their clock lights them (`'clock'`). */
export type HelpCheck = 'shown' | 'clock';

/** The expectation of one step: drawn, hidden, and the path. */
function expectation(step: SpectatorHudStep): { path: 'spectator' | 'teammate' | 'own'; shown: string[]; hidden: string[]; help: boolean; followed: boolean | null } {
  // LATER 119: the followed body's bar drawn (its health from the room's bytes); while the gap stood, asked hidden.
  const bar = PORT_GAPS.followedBar ? { shown: ['bar'], hidden: [] } : { shown: [], hidden: ['bar'] }, number = PORT_GAPS.number ? [] : ['range'];
  switch (step) {
    case 'free': case 'scenic':
      return {
        path: 'spectator', shown: ['timer', 'box', 'spectatorInfo', ...(PORT_GAPS.ownInfo ? ['name', 'bar'] : [])],
        hidden: [...SPECTATOR_HIDDEN, ...number, ...(PORT_GAPS.ownInfo ? [] : ['name', 'bar']), 'scoreboard'], help: true, followed: false,
      };
    case 'follow':
      return { path: 'spectator', shown: ['timer', 'box', 'name', 'spectatorInfo', ...bar.shown], hidden: [...SPECTATOR_HIDDEN, ...number, ...bar.hidden, 'scoreboard'], help: true, followed: true };
    case 'scoreboard':
      return { path: 'spectator', shown: ['scoreboard'], hidden: [...new Set([...SCOREBOARD_HIDDEN, ...SPECTATOR_HIDDEN])], help: false, followed: null };
    case 'teammate':
      return {
        path: 'teammate', shown: ['timer', 'box', 'name', ...TEAMMATE_BOX, ...bar.shown],   // LATER 117: the panel and the teammate's icon
        hidden: [...SPECTATOR_HIDDEN.filter((e) => !TEAMMATE_BOX.includes(e)), ...number, ...bar.hidden, 'spectatorInfo', 'scoreboard'],
        help: true, followed: true,                     // LATER 118: the watching lines (D:L57149-57173)
      };
    case 'own':
      // The walker's HUD (`FUN_001f7a90` D:L57112) less the compass (D:L57115) and the panel (a player, D:L57116-57118).
      // The weapon box is the walker's, on its own fade: not asked here.
      // LATER 118: the dead's own lines (D:L56996-57107).
      return { path: 'own', shown: ['timer', 'box'], hidden: [...COMPASS, 'spectatorInfo', 'scoreboard'], help: true, followed: null };
  }
}

/**
 * The findings of one step: empty when the HUD drew what the step asks and hid what it hides; else one line an element
 * (named in quotes) or a fact, with its source. `help` (the spectator's free, scenic and follow steps, and since LATER 118
 * the dead's `teammate` and `own`: the original writes and shows the same six widgets for a dead player, `FUN_001f9f20`
 * D:L57149-57173, D:L57191-57205; `FUN_001f97b0` D:L56996-57107, D:L57120-57135; research 282 §8): `'clock'` (the
 * default) asks the lines drawn exactly while `read.help` lights them (`SPECTATOR_HELP`: 10 s, then a 0.5 s fade, from the
 * view's arrival, a dead player's death edge and each round's start) -- a line drawn past its clock is a finding;
 * `'shown'` asks them lit and drawn. A dead player's teammate step can land past the fade (he cycles after his death):
 * keep it on `'clock'`. `followed`: the names the viewed body may have. The reticle is judged where the page reads it,
 * but on a dead body of his own (research 282 §5: the original's `FUN_001f7a90` shows it, the page's `reticleShown`
 * hides it while dead -- not this check's). LATER 117: `icon`, on the `teammate` step, the watched teammate's held item's
 * icon bitmap (a spec reads it off that teammate's own page, its `Hud.state().model.weaponIcon`): the drawn icon
 * (`read.icon`) must be it -- a page drawing the dead player's own there is a finding; absent, presence alone is judged.
 */
export function spectatorHudFindings(
  read: SpectatorHudRead, step: SpectatorHudStep, opts: { help?: HelpCheck; followed?: readonly string[]; icon?: string } = {},
): string[] {
  const out: string[] = [];
  const want = expectation(step);
  const has = new Set(read.drawn);
  if (!read.visible) out.push(`${step}: the HUD is not drawn (Hud.state().visible false)`);
  if (read.path !== want.path) out.push(`${step}: the view's path is ${JSON.stringify(read.path)}, not '${want.path}' (FUN_001f7ff0 D:L56564-56600; research 282 §1)`);
  if (want.followed === true && read.followed === null) out.push(`${step}: no followed body named on the info box (${why('name')})`);
  if (want.followed === false && read.followed !== null) out.push(`${step}: a followed body (${read.followed}) in a view that follows none`);
  if (want.followed === true && read.followed !== null && opts.followed && !opts.followed.includes(read.followed)) {
    out.push(`${step}: the followed body is ${read.followed}, not one of ${opts.followed.join(', ')}`);
  }
  for (const e of want.shown) if (!has.has(e)) out.push(`${step}: '${e}' not drawn -- ${whyAt(step, e)}`);
  for (const e of want.hidden) if (has.has(e)) out.push(`${step}: '${e}' drawn, hidden here -- ${whyAt(step, e)}`);
  // LATER 117 (the console seat's note): the icon is the watched teammate's held item's, never the dead player's own.
  if (step === 'teammate' && opts.icon !== undefined && has.has('icon') && read.icon !== opts.icon) {
    out.push(`${step}: 'icon' is ${read.icon ?? 'unread'}, not the watched teammate's ${opts.icon} -- ${whyAt(step, 'icon')}`);
  }
  if (want.help) {
    const lit = (read.help ?? 1) > 0;
    if ((opts.help ?? 'clock') === 'shown') {
      if (!lit) out.push(`${step}: 'help' faded (timing.help ${read.help}) where the step asks it lit -- ${why('help')}`);
      if (!has.has('help')) out.push(`${step}: 'help' not drawn -- ${why('help')}`);
    } else if (lit !== has.has('help')) {
      out.push(has.has('help')
        ? `${step}: 'help' drawn past its clock (timing.help ${read.help}) -- ${why('help')}`
        : `${step}: 'help' not drawn with its clock at ${read.help} -- ${why('help')}`);
    }
  }
  if (step !== 'own' && read.reticle === true) out.push(`${step}: the reticle drawn -- the hide-all hides its root +0x11df0 (D:L56327; research 282 §1)`);
  return out;
}
