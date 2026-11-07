import { BOMB_SITE_REACH, newLayout, type ForgeGameType, type Layout, type LayoutBase } from './layout';
import { EXTRACTION_ZONE_SIZE } from './extractionZones';

/**
 * The blank floor's presets (the owner, 2026-11-06; a browser adaptation, FG.R2 -- the game has no editor): a blank
 * floor set up to play a mode at once, with what the room's own rule for that mode reads (`./objectives`
 * `forgeTypeUnplayable`, `./page` `blankWhy`):
 * - DEMOLITION (2): the bomb's start and a site for each team (`bombReady`), and a spawn a team.
 * - EXTRACTION (4): a hostage -- its character lent by a disc map that has hostages, as a blank floor's must be -- an
 *   extraction zone (Safety), and a spawn a team.
 * - ESCORT (3): three hostages, the VIPs (`sealCheck` counts three), a zone named Safety (the room's placeholder escort
 *   script stages in it), and a spawn a team.
 * - SUPPRESSION (5): a spawn a team.
 * - BREACH (1): the bomb's start with the SEALs and the SEALs' site on the Terrorists' side (`./objectives`
 *   `breachReady`: the room's BREACH reads StartBomb and the SEALs' site, which these stand for), and a spawn a team.
 *   Untested against a run.
 *
 * Where each stands is the editor's (no original): the two sides apart along x, the SEALs at -x and the Terrorists at +x,
 * each facing the other; the objectives on the side that must reach them.
 */
export interface BlankPreset { value: string; label: string; type: ForgeGameType }

export const BLANK_PRESETS: readonly BlankPreset[] = [
  { value: 'blank:1', label: 'New Empty Map · Breach', type: 1 },
  { value: 'blank:2', label: 'New Empty Map · Demolition', type: 2 },
  { value: 'blank:3', label: 'New Empty Map · Escort', type: 3 },
  { value: 'blank:4', label: 'New Empty Map · Extraction', type: 4 },
  { value: 'blank:5', label: 'New Empty Map · Suppression', type: 5 },
];

/** The base select's value's preset, or null for a plain base. */
export const blankPresetOf = (value: string): BlankPreset | null => BLANK_PRESETS.find((p) => p.value === value) ?? null;

/** How far each side's spawn stands from the centre, along x (world units; an editor's value). */
export const PRESET_SIDE_X = 200;

/** A hostage's lent body: the disc map (`source`) whose hostage character (`character`) it wears. */
export interface PresetHostage { source: string; character: string }

type V3 = [number, number, number];

/**
 * The preset's layout on `base` (a blank floor): the spawns, and the mode's objectives. `hostage` lends the hostages'
 * body (a blank floor has none of its own); without it they are placed bare and the type says it cannot play yet.
 */
export function presetLayout(base: LayoutBase, type: ForgeGameType, hostage: PresetHostage | null): Layout {
  const l = newLayout(base);
  // Spawn markers face along -z at yaw 0 (`./pieces` `slotMark`): -pi/2 turns that to +x, pi/2 to -x -- each side
  // facing the other across the centre.
  l.spawns = [
    { team: 'A', p: [-PRESET_SIDE_X, 0, 0], yaw: -Math.PI / 2 },
    { team: 'B', p: [PRESET_SIDE_X, 0, 0], yaw: Math.PI / 2 },
  ];
  const body = (name: string): NonNullable<Layout['hostages']>[number] => ({
    p: [0, 0, 0], yaw: 0, name, ...(hostage ? { source: hostage.source, character: hostage.character } : {}),
  });
  const at = (h: NonNullable<Layout['hostages']>[number], p: V3): NonNullable<Layout['hostages']>[number] => ({ ...h, p });
  switch (type) {
    case 2: {
      // The bomb between the sides; the SEALs plant on the Terrorists' side (team 0), the Terrorists on the SEALs' (1).
      const site = (team: 0 | 1, p: V3) => ({ team, at: p, yaw: 0, range: BOMB_SITE_REACH, elevation: BOMB_SITE_REACH });
      l.objectives = { gameType: 2, bomb: { start: [0, 0, 0], sites: [site(0, [PRESET_SIDE_X + 60, 0, 120]), site(1, [-PRESET_SIDE_X - 60, 0, 120])] } };
      break;
    }
    case 1: {
      // The SEALs carry the bomb in from their side to the one site, on the Terrorists' (team 0: the SEALs plant).
      const site = { team: 0 as const, at: [PRESET_SIDE_X + 60, 0, 0] as V3, yaw: 0, range: BOMB_SITE_REACH, elevation: BOMB_SITE_REACH };
      l.objectives = { gameType: 1, bomb: { start: [-PRESET_SIDE_X + 40, 0, 0], sites: [site] } };
      break;
    }
    case 4:
      // A hostage held on the Terrorists' side; the SEALs bring it to the Safety zone behind their own spawn.
      l.objectives = { gameType: 4 };
      l.hostages = [at(body('Hostage1'), [PRESET_SIDE_X + 40, 0, -120])];
      l.extractionZones = [{ name: 'Safety', at: [-PRESET_SIDE_X - 60, 0, -120], size: [EXTRACTION_ZONE_SIZE, EXTRACTION_ZONE_SIZE] }];
      break;
    case 3:
      // The three VIPs with the SEALs; Safety across on the Terrorists' side.
      l.objectives = { gameType: 3 };
      l.hostages = [1, 2, 3].map((n, i) => at(body(`Hostage${n}`), [-PRESET_SIDE_X + 30, 0, -40 + i * 40]));
      l.extractionZones = [{ name: 'Safety', at: [PRESET_SIDE_X + 60, 0, -120], size: [EXTRACTION_ZONE_SIZE, EXTRACTION_ZONE_SIZE] }];
      break;
    default:
      l.objectives = { gameType: type };
  }
  return l;
}
