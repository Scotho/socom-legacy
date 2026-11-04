import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar, parseRdr } from '@s2u/archive';
import { UI_MODEL_FILES, UI_MODEL_FORM_READING, parseAnimSets, weaponLibrary } from '@s2u/scene';
import { buildDialogScreen } from '../../src/compositor/index';
import { modelNodes, type UiModelGeometry } from '../../src/compositor/models';
import type { UiNode } from '../../src/compositor/scene';
import { loadDialog } from '../../src/dialog';
import { screenNodeTree } from '../../src/screens/screenScripts';

/**
 * NODE_NAME_MATCH_READING over the disc (a dev-disc test; web research 106 §8, research 269 §4.2): the menu's
 * find-by-name is `strlen` then `strcmp` (`FUN_00315d00` D:L215255-215290, through `FUN_00269230` D:L114366-114413
 * and `FUN_0026f4e0` D:L118182-118230), so two nodes whose names differ only by case are two. Every dialog of
 * `RUN/UI/READERC.ZAR` and `READERX.ZAR` built to its screen: which hold such a pair, and that each `SCRIPT_LIBRARY`
 * reference naming a node of its screen reaches the node spelled exactly, and none names a node only by folding case
 * (the screens built with their `MODELS` entries, decoded from `UI_GEO.ZED` / `UI_MDL.ZED` as the page's
 * `readMenuArt` decodes them). Names and counts only. The disc is
 * `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with neither every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR', UI_MODEL_FILES.geo, UI_MODEL_FILES.mdl];
const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

/** `findNode`'s walk: a level's children, then each child's own. */
function* nodesOf(root: UiNode): Generator<UiNode> {
  for (const c of root.children) yield c;
  for (const c of root.children) yield* nodesOf(c);
}

describe.skipIf(!HAVE_DISC)(`node names that differ only by case, over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('only dlgLadderLobby.rdr holds such pairs (the legend\'s medal_* and the foot\'s Medal_*); every script reference reaches its exact spelling, none only by folding (models included)', () => {
    const sets = new Map(parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets.map((s) => [s.name.toLowerCase(), s] as const));
    const library = weaponLibrary(zar(UI_MODEL_FILES.geo), zar(UI_MODEL_FILES.mdl), UI_MODEL_FORM_READING);
    // The page's model lookup (`viewer/src/menuArt.ts` `readMenuArt`): the entry's MODEL name to the library's model.
    const model = (name: string): UiModelGeometry | null => {
      const found = library.names().find((n) => n.toLowerCase() === name.toLowerCase());
      if (!found) return null;
      const d = library.decode(found, 'high');
      return { name: d.name, parts: d.parts.map((q) => ({ node: q.node, meshes: q.meshes.map((m) => ({ positions: m.positions, uvs: m.uvs, colors: m.colors, indices: m.indices, texture: m.textureName, cull: m.cull })) })) };
    };
    const collisions: string[] = [];
    const wrong: string[] = [];
    const foldOnly: string[] = [];
    let dialogs = 0, exact = 0, refs = 0, withModels = 0;
    for (const archive of ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR']) {
      const z = zar(archive);
      for (const k of z.root.children) {
        const design = loadDialog(parseRdr(z.data(k)));
        const screen = buildDialogScreen(design, { model });
        dialogs++;
        if (screen.models.length) withModels++;
        const nodes = [...nodesOf(screen.root)];
        const names = [...nodes.map((n) => n.name), ...screen.models.flatMap((m) => modelNodes(m).map((n) => n.name))];
        const groups = new Map<string, Set<string>>();
        for (const n of names) groups.set(n.toLowerCase(), (groups.get(n.toLowerCase()) ?? new Set()).add(n));
        for (const g of groups.values()) if (g.size > 1) collisions.push(`${k.name}: ${[...g].sort().join(' / ')}`);
        const tree = screenNodeTree(screen);
        for (const s of design.scripts) for (const a of sets.get(s.toLowerCase())?.anims ?? []) for (const ref of a.nodeRefs) {
          refs++;
          if (!names.includes(ref.name) && names.some((n) => n.toLowerCase() === ref.name.toLowerCase())) foldOnly.push(`${k.name} ${s}:${a.name}:${ref.name}`);
          const spelled = nodes.find((n) => n.name === ref.name);
          if (!spelled) continue;
          exact++;
          const view = tree.node(ref.name)!;
          const was = spelled.visible;
          view.active = !was;                                   // the view writes through to the node it resolved
          if (spelled.visible === was) wrong.push(`${k.name} ${s}:${a.name}:${ref.name}`);
          view.active = was;
        }
      }
    }
    expect(dialogs).toBe(114);
    expect(withModels).toBeGreaterThan(0);
    expect(exact).toBeGreaterThan(0);
    // No reference reaches a node only by folding case: exact matching (NODE_NAME_MATCH_READING) changes no binding.
    expect([refs > 0, foldOnly]).toEqual([true, []]);
    expect(collisions).toEqual([
      'dlgLadderLobby.rdr: Medal_Blue / medal_blue', 'dlgLadderLobby.rdr: Medal_Bronze / medal_bronze',
      'dlgLadderLobby.rdr: Medal_Silver / medal_silver', 'dlgLadderLobby.rdr: Medal_Gold / medal_gold',
      'dlgLadderLobby.rdr: Medal_Black / medal_black',
    ]);
    expect(wrong).toEqual([]);
  });
});
