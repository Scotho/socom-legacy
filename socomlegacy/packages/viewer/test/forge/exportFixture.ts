import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { InstalledRulesPack } from '@s2u/creator-contracts';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { emptyLayout } from '../../src/forge/layout';
import { sealForgeRules, type ForgeLayout } from '../../src/forge/rulesAuthoring';
import { VAULT_SPEC, vaultLayout } from './rulesFixture';

/**
 * FX-11a's fixtures (product track; a browser adaptation, no original): the layouts an export is held over -- a
 * disc-only layout on Frostfire (`MP2`, disc prop ids named, never their bytes), the Vault layout with its rules draft
 * (`./rulesFixture`), a layout that requires another creator's pack, and (the review's findings B and C) a posed layout
 * with its own rules, a layout playing an installed rules pack's mode, a layout on another pack's map and a blank floor
 * lent a game map's props -- each as Save sees it. Every value is synthetic: no byte of the game's data.
 */

export const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** A disc-only layout over a retail map: disc prop ids, two spawns, no `requires`. */
export const discYard = (): ForgeLayout => ({
  ...emptyLayout({ kind: 'map', archive: 'MP2' }), name: 'Yard',
  pieces: [{ asset: 'MP2:crate', m: at(120, 0, -40) }, { asset: 'MP2:crate', m: at(-80, 0, 60) }, { asset: 'MP2:barrel', m: at(10, 0, 10) }],
  spawns: [{ team: 'A', p: [-300, 0, 200], yaw: 0 }, { team: 'B', p: [300, 0, -200], yaw: 0 }],
});

/** Another creator's pack the dependent layout requires (an exact reference; its hash a stand-in no file needs). */
export const DEPENDENCY = Object.freeze({ id: 'fuse.crates', version: '1.2.0', hash: 'a'.repeat(64) });
/** That pack's store team, as the caller proves it (the store's download name). */
export const DEPENDENCY_TEAM = 'Fuse';

/** A layout that requires another pack: the disc yard with `requires` naming it. */
export const dependentYard = (): ForgeLayout => ({ ...discYard(), name: 'Crate yard', requires: [{ ...DEPENDENCY }] });

/** The Vault layout with its rules draft, sealed as the facade seals every rules edit. */
export const rulesYard = (): Promise<ForgeLayout> => vaultLayout();

const deg = (d: number): number => (d * Math.PI) / 180;
/**
 * A piece tilted and scaled as the Inspector sets one (three's `YXZ`: pitch 15, yaw 45, roll 30; scale 2/1/0.5; as
 * `recordV3.test.ts`'s FX-1 case), at (40, 0, -20).
 */
export const posedMatrix = (): number[] =>
  new Matrix4().compose(new Vector3(40, 0, -20), new Quaternion().setFromEuler(new Euler(deg(15), deg(45), deg(30), 'YXZ')), new Vector3(2, 1, 0.5)).elements.slice();
/** The record's pose row for that piece, the fourth of the posed yard's (`[piece, pitch, roll, sx, sy, sz]`). */
export const POSED_ROW: readonly number[] = Object.freeze([3, 15, 30, 2, 1, 0.5]);

/**
 * The review's finding B: the disc yard (two spawns) with a fourth piece tilted and scaled, and the Vault's rules draft on
 * it (its zone, its mode, its reward configured to 9), sealed as the facade seals every rules edit.
 */
export async function posedYard(): Promise<ForgeLayout> {
  const yard = discYard();
  let l: ForgeLayout = { ...yard, name: 'Posed yard', pieces: [...yard.pieces, { asset: 'MP2:crate', m: posedMatrix() }] };
  l = planForgeLayout(l, 'zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, []);
  l = planForgeLayout(l, 'rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' }, []);
  l = planForgeLayout(l, 'rules.set', { spec: JSON.parse(JSON.stringify(VAULT_SPEC)) as Record<string, unknown> }, []);
  l = planForgeLayout(l, 'rules.config.set', { params: { reward: 9 } }, []);
  return sealForgeRules(l);
}

/** The installed rules pack's store team, as the caller proves it. */
export const INSTALLED_RULES_TEAM = 'Vault_Works';
/**
 * The review's finding C (1): a layout playing a mode an installed rules pack offers -- the Vault with its draft taken off
 * and installed instead (`matchRules.test.ts`'s installed case), so the layout's `requires` names that pack and its mode
 * is that pack's, as `checkForgeRules` demands.
 */
export async function installedRulesYard(): Promise<{ layout: ForgeLayout; installed: InstalledRulesPack[] }> {
  const { rules, ...bare } = await vaultLayout();
  return { layout: { ...bare, name: 'Borrowed vault' }, installed: [{ ref: rules!.pack, spec: rules!.spec }] };
}

/** Another creator's map pack a layout stands on (an exact reference; its hash a stand-in no file needs). */
export const CONTENT_MAP = Object.freeze({ id: 'fuse.maps', version: '2.0.0', hash: 'b'.repeat(64) });
export const CONTENT_MAP_TEAM = 'Fuse';
/**
 * The review's finding C (2): a layout on that pack's map `yard` (`ContentLayoutBase`, its library a game map's archive
 * stem), two spawns; `recordOfLayout` writes the base's pack into the record's `requires`, as `checkCreatorRecord` demands.
 */
export const contentYard = (): ForgeLayout => ({
  ...emptyLayout({ kind: 'content', ref: { ...CONTENT_MAP }, mapId: 'yard', library: 'MP2' }), name: 'On the yard',
  spawns: [{ team: 'A', p: [-30, 0, 20], yaw: 0 }, { team: 'B', p: [30, 0, -20], yaw: 0 }],
});

/** The review's finding A: a blank floor lent a game map's props (its library an archive stem, not the forge's own floor). */
export const lentFloor = (): ForgeLayout => ({
  ...emptyLayout({ kind: 'blank', library: 'MP2' }), name: 'Lent floor',
  spawns: [{ team: 'A', p: [-30, 0, 20], yaw: 0 }, { team: 'B', p: [30, 0, -20], yaw: 0 }],
});
