import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Group, Mesh, type Object3D } from 'three';
import { parseRdr, parseZdb, Zar, zdbMember } from '@s2u/archive';
import {
  ARMORY_LAYOUT, ARMORY_SETS, decodeUiSet, EMPTY_ITEM, flattenScene, parseAnimSets, parseUiLayout, readKitTable, UI_MODEL_FILES, UI_MODEL_FORM_READING,
  uiSet, weaponLibrary, type Loadout,
} from '@s2u/scene';
import { armoryModels, armoryNodes, modelPartStates } from '../src/armoryLayout';
import { cloneHeld, kitNodeVisible, showScopeNodes, SILENCER_NODE } from '../src/sights';
import { UiRunner } from '../src/uiScript';

/**
 * The 552's suppressor (the owner's play-test, 2026-10-04: "the 552 that you start with appears to have the model on
 * the character rendered as 552-SD"). `zweapon.rdr` gives the 552 (57) and the 552SD (67) one `ModelName`,
 * `sig_commando`, whose graph carries the suppressor as its own visual node, `silencer`. The kit's set-up
 * (`FUN_005c0250` D:L476159-476178) takes the kit's first primary (`FUN_003d1d10`), finds `silencer` (0x65f830) in the
 * held primary's model and shows it only for a suppressed item (`FUN_003c5ac0` D:L317149: 16, 33, 62, 67, 105) -- the
 * same shape as the thermal scope's swap (`FUN_005b82e0`). The ARMORY's preview of the 552 (`sig_commandoUI`) has its
 * own `silencer`, which `ShowAndSpin` turns off: the kind-0 reference reaches the model's node through the world the
 * build attaches every `MODELS` instance to (`./armoryLayout` `ARMORY_MODEL_PART_REF`, traced 2026-10-07).
 */

const kit = (...ids: number[]): Loadout => {
  const l = [...ids];
  while (l.length < 5) l.push(EMPTY_ITEM);
  return l as unknown as Loadout;
};
const gun = (...nodes: string[]): Group => {
  const g = new Group();
  for (const node of nodes) { const m = new Mesh(); m.userData.node = node; g.add(m); }
  return g;
};
const shown = (o: Object3D): string[] => o.children.filter((m) => m.visible).map((m) => m.userData.node as string);

describe('the 552\'s suppressor on the held model (FUN_005c0250, FUN_003c5ac0)', () => {
  it('the silencer node shows for a suppressed primary only: hidden on the 552 (57), shown on the 552SD (67)', () => {
    expect(SILENCER_NODE).toBe('silencer');
    // [loadout, held id, node, visible]
    const rows: [Loadout, number, string, boolean | null][] = [
      [kit(57, 6, 121), 57, SILENCER_NODE, false], [kit(67, 6, 121), 67, SILENCER_NODE, true],
      [kit(62, 16, 121), 62, SILENCER_NODE, true], [kit(54, 15), 54, SILENCER_NODE, false],
      [kit(57, 16, 121), 16, SILENCER_NODE, false],              // the kit's first primary decides, not the pistol in hand
      [kit(67, 6, 121), 67, 'commando_high', null],               // not a kit node: left alone
      [kit(102, 15, 195), 102, 'scope', false],                   // the thermal scope's swap unchanged
    ];
    for (const [l, id, node, want] of rows) expect([l, id, node, kitNodeVisible(node, l, id)]).toEqual([l, id, node, want]);
  });

  it('the held model\'s parts: the 552 draws commando_high alone, the 552SD commando_high and silencer', () => {
    const g = gun('commando_high', SILENCER_NODE);
    showScopeNodes(g, kit(57, 6, 121), 57);
    expect(shown(g)).toEqual(['commando_high']);
    showScopeNodes(g, kit(67, 6, 121), 67);
    expect(shown(g)).toEqual(['commando_high', SILENCER_NODE]);
  });

  it('a remote body\'s copy follows its own kit: a 552SD beside the page\'s 552, and the shared model untouched', () => {
    const shared = gun('commando_high', SILENCER_NODE);
    showScopeNodes(shared, kit(57, 6, 121), 57);                     // the page's own kit: the plain 552
    expect(shown(cloneHeld(shared, kit(67, 6, 121), 67))).toEqual(['commando_high', SILENCER_NODE]);
    expect(shown(shared)).toEqual(['commando_high']);
    showScopeNodes(shared, kit(67, 6, 121), 67);                     // the page's 552SD; a remote's 552
    expect(shown(cloneHeld(shared, kit(57, 6, 121), 57))).toEqual(['commando_high']);
  });
});

// ---- off the disc: SOCOM_DISC, else <SOCOM_PC_ROOT>/game/disc, else the served tree --------------------------------

const web = resolve(import.meta.dirname, '../../..');
const DISC = [
  process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : null,
  process.env.SOCOM_PC_ROOT ? join(resolve(process.env.SOCOM_PC_ROOT), 'game', 'disc') : null,
  resolve(web, 'public/maps'),
].find((d): d is string => d !== null && existsSync(join(d, 'RUN/ZWEAPON.ZAR')) && existsSync(join(d, 'RUN/MP2.ZDB')));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(DISC!, p)));

describe.skipIf(!DISC)('the 552 and the 552SD off the disc (zweapon.rdr, MP2\'s WEAP_GEO)', () => {
  it('both name sig_commando, the one model of 59 with a silencer node; the 552 draws it without, the 552SD with', () => {
    const t = readKitTable(read('RUN/ZWEAPON.ZAR'));
    expect([t.arsenal.items.get(57)?.model, t.arsenal.items.get(67)?.model]).toEqual(['sig_commando', 'sig_commando']);
    const b = read('RUN/MP2.ZDB'), zdb = parseZdb(b);
    const lib = weaponLibrary(Zar.parse(zdbMember(b, zdb, 'WEAP_GEO.ZED')), Zar.parse(zdbMember(b, zdb, 'WEAP_MDL.ZED')));
    expect(lib.names().filter((n) => lib.decode(n, 'all').parts.some((p) => p.node === SILENCER_NODE))).toEqual(['sig_commando']);
    // The held model as `./world` builds it: a mesh a packet, each carrying its node's name.
    const held = new Group();
    for (const part of lib.decode('sig_commando').parts) for (const _ of part.meshes) { const m = new Mesh(); m.userData.node = part.node; held.add(m); }
    showScopeNodes(held, kit(57, 6, 121), 57);
    expect([...new Set(shown(held))]).toEqual(['commando_high']);
    showScopeNodes(held, kit(67, 6, 121), 67);
    expect([...new Set(shown(held))]).toEqual(['commando_high', SILENCER_NODE]);
  });
});

describe.skipIf(!DISC)("the ARMORY's 552 preview off the disc (READERC, UIZANIM, UI_GEO, UI.ZED): ARMORY_MODEL_PART_REF", () => {
  it("ShowAndSpin turns silencer off for the 552 and never on; it is the first and only MODELS entry's node of that name", () => {
    const readerc = Zar.parse(read(ARMORY_LAYOUT.archive));
    const layout = parseUiLayout(parseRdr(readerc.data(readerc.root.children.find((k) => k.name.toLowerCase() === ARMORY_LAYOUT.member)!)));
    const sets = parseAnimSets(Zar.parse(read('RUN/UIZANIM.ZAR')));
    const ops = [...decodeUiSet(uiSet(sets, ARMORY_SETS.spin)).values(), ...decodeUiSet(uiSet(sets, ARMORY_SETS.screen)).values()]
      .flatMap((p) => p.sequences.flatMap((q) => q.ops));
    const switched = (name: string) => ops.filter((o) => o.op === 'active' && o.node === name);
    expect(switched(SILENCER_NODE).length).toBeGreaterThan(0);
    expect(switched(SILENCER_NODE).every((o) => o.op === 'active' && !o.on)).toBe(true);
    const at = ops.findIndex((o) => o.op === 'active' && o.node === SILENCER_NODE);
    expect(ops[at - 1]).toMatchObject({ op: 'active', node: 'Equipsig_commando', on: true });
    // Every node of every MODELS entry's model (FUN_00315d00 walks them all, visuals or not), exact names.
    const ui = weaponLibrary(Zar.parse(read(UI_MODEL_FILES.geo)), Zar.parse(read(UI_MODEL_FILES.mdl)), UI_MODEL_FORM_READING);
    const nodesOf = (m: string): string[] => flattenScene(ui.models, m).filter((f) => f.modelName === m).map((f) => f.node.name);
    const own = new Set(armoryNodes(layout).map((n) => n.name.toLowerCase()));
    const absent = [...new Set(ops.flatMap((o) => (o.op === 'active' && !own.has(o.node.toLowerCase()) ? [o.node] : [])))];
    const named = absent.filter((n) => layout.models.some((e) => nodesOf(e.model).includes(n)));
    expect(named).toEqual([SILENCER_NODE]);
    expect(layout.models.filter((e) => nodesOf(e.model).includes(SILENCER_NODE)).map((e) => [e.name, e.model])).toEqual([['Equipsig_commando', 'sig_commandoUI']]);
    expect(nodesOf('UIsig_commandoSD')).toContain('SigSilencer');              // the 552SD's own suppressor: another name
    // The menu's world (RUN/UI/UI.ZED) holds no node of the name ahead of the models.
    expect(Buffer.from(read('RUN/UI/UI.ZED')).includes('silencer')).toBe(false);
    // The rule on the disc's dialog: the 552 shown, silencer switched off -> sig_commandoUI drawn without it.
    const r = new UiRunner([], armoryNodes(layout), { command: () => true });
    r.node('Equipsig_commando').visible = true;
    r.node(SILENCER_NODE).visible = false;
    const shown = armoryModels(layout, (n) => (r.has(n) ? r.node(n) : undefined), modelPartStates(layout, r.nodes(), (m) => nodesOf(m)));
    expect(shown.map((m) => [m.entry.model, m.hidden])).toEqual([['sig_commandoUI', [SILENCER_NODE]]]);
  });
});
