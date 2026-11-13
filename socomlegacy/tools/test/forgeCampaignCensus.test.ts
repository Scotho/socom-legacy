import { describe, expect, it } from 'vitest';
import { ACTION_TYPE_CODES, ACTION_TYPE_UNKNOWN } from '../../packages/viewer/src/mapActions';
import {
  ACTION_TYPES, buildCampaignReport, CAMPAIGN_KINDS, campaignCountsOf, failedKindMap, renderCampaignTable, type CampaignMapFacts,
} from '../forgeCampaignCensus';

/** FX-7 (the Forge export sprint; product track): the campaign census's counting on synthetic maps -- no disc. */

const m16 = (n: number): Float32Array => new Float32Array(16 * n);

function facts(over: Partial<CampaignMapFacts> = {}): CampaignMapFacts {
  return {
    stem: 'M51', campaign: true,
    props: [
      { modelName: 'crate', matrices: m16(3) },
      { modelName: 'crate', matrices: m16(1) },   // a LOD twin: the same prototype, a second entry
      { modelName: 'barrel', matrices: m16(2) },
    ],
    doors: [{}, {}], turrets: [{}], gates: [], cranes: [],
    actions: [
      { type: 'DOOR', typeCode: 0 }, { type: 'DOOR', typeCode: 0 }, { type: 'ACT_BREACH', typeCode: 5 },
      { type: '', typeCode: 8 }, { type: 'TRIGGER', typeCode: 8 },
    ],
    meta: {
      scene: { destructibles: [{ anim: 'access1' }, { anim: 'access1' }, { anim: 'tank' }], programs: [{}, {}, {}, {}], unplaced: ['ghost'] },
      autostart: [{}], fireNodes: new Map([['gun', []]]),
    },
    tac: { zones: [{ kind: 1 }, { kind: 1 }, { kind: 3 }], points: [{ kind: 2 }], lines: [{ type: 4 }] },
    ai: { spawns: [{}, {}] },
    escortees: [{}],
    scenicViews: [],
    bombStart: undefined,
    forgeCensus: { door: 2, turret: 1, hostage: 1, ladder: 1, gate: 0, barrier: 2, flare: 0 },
    hullLadders: 4,
    ...over,
  };
}

describe('the action type table', () => {
  it('names every code of ACTION_TYPE_CODES and the unknown, in code order', () => {
    expect(ACTION_TYPES.map((t) => t.code)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const [name, code] of Object.entries(ACTION_TYPE_CODES)) expect(ACTION_TYPES[code]!.name).toBe(name);
    expect(ACTION_TYPES[ACTION_TYPE_UNKNOWN]!.name).toBe('UNKNOWN');
    expect(ACTION_TYPES[ACTION_TYPE_UNKNOWN]!.prompt).toBe(false);
  });

  it('marks DOOR, SWITCH and MPBOMB acted on and the rest parsed only', () => {
    expect(ACTION_TYPES.filter((t) => t.actedOn).map((t) => t.name)).toEqual(['DOOR', 'SWITCH', 'MPBOMB']);
    for (const t of ACTION_TYPES) expect(t.actedOn).toBe(t.consumers.length > 0);
  });
});

describe('campaignCountsOf', () => {
  it('counts every kind the readers expose on one map', () => {
    const c = campaignCountsOf(facts());
    expect(c.status).toBe('ok');
    expect(c.kinds.propPrototypes).toBe(2);
    expect(c.kinds.propEntries).toBe(3);
    expect(c.kinds.propPlacements).toBe(6);
    expect(c.kinds.doors).toBe(2);
    expect(c.kinds.turrets).toBe(1);
    expect(c.kinds.leverGates).toBe(0);
    expect(c.kinds.forgeGates).toBe(0);
    expect(c.kinds.forgeBarriers).toBe(2);
    expect(c.kinds.ladderProps).toBe(1);
    expect(c.kinds.hullLadders).toBe(4);
    expect(c.kinds.destructibles).toBe(3);
    expect(c.kinds.destructibleAnims).toBe(2);
    expect(c.kinds.unplacedDestructibles).toBe(1);
    expect(c.kinds.hostages).toBe(1);
    expect(c.kinds.escortees).toBe(1);
    expect(c.kinds.mapActions).toBe(5);
    expect(c.kinds.scenePrograms).toBe(4);
    expect(c.kinds.autostart).toBe(1);
    expect(c.kinds.fireNodes).toBe(1);
    expect(c.kinds.tacZones).toBe(3);
    expect(c.kinds.tacPoints).toBe(1);
    expect(c.kinds.tacLines).toBe(1);
    expect(c.kinds.aiSpawns).toBe(2);
    expect(c.kinds.scenicViews).toBe(0);
    expect(c.kinds.bombStart).toBe(0);
    expect(Object.keys(c.kinds)).toEqual(CAMPAIGN_KINDS.map((k) => k.key));
  });

  it('counts the actions by type code, and an unknown type by its own name', () => {
    const c = campaignCountsOf(facts());
    expect(c.actionTypes).toEqual({ '0 DOOR': 2, '5 ACT_BREACH': 1, '8 UNKNOWN (none)': 1, '8 UNKNOWN TRIGGER': 1 });
    expect(c.tacZoneKinds).toEqual({ 1: 2, 3: 1 });
    expect(c.tacPointKinds).toEqual({ 2: 1 });
  });

  it('reads an absent reader as zero', () => {
    const c = campaignCountsOf(facts({ doors: undefined, actions: undefined, meta: undefined, tac: null, ai: undefined, escortees: undefined }));
    expect(c.kinds.doors).toBe(0);
    expect(c.kinds.mapActions).toBe(0);
    expect(c.kinds.destructibles).toBe(0);
    expect(c.kinds.tacZones).toBe(0);
    expect(c.actionTypes).toEqual({});
  });
});

describe('buildCampaignReport', () => {
  it('names the kinds and action types the campaign holds that no multiplayer map does', () => {
    const mp = facts({ stem: 'MP2', campaign: false, actions: [{ type: 'DOOR', typeCode: 0 }], escortees: [], forgeCensus: { door: 2, turret: 1, hostage: 0, ladder: 1, gate: 0, barrier: 2, flare: 0 } });
    const report = buildCampaignReport([campaignCountsOf(facts()), failedKindMap('M52', true, 'boom'), campaignCountsOf(mp)]);
    expect(report.campaignMaps).toEqual(['M51', 'M52']);
    expect(report.multiplayerMaps).toEqual(['MP2']);
    expect(report.failed).toEqual(['M52']);
    expect(report.campaignOnly!.kinds).toEqual(['hostages', 'escortees']);
    expect(report.campaignOnly!.actionTypes).toEqual(['5 ACT_BREACH', '8 UNKNOWN (none)', '8 UNKNOWN TRIGGER']);
    expect(report.campaignTotals.doors).toBe(2);
    const text = renderCampaignTable(report);
    expect(text).toMatch(/M51/);
    expect(text).toMatch(/M52: FAILED: boom/);
    expect(text).toMatch(/5 ACT_BREACH/);
    expect(text).toMatch(/parsed only/);
  });

  it('leaves the comparison out when no multiplayer map was read', () => {
    const report = buildCampaignReport([campaignCountsOf(facts())]);
    expect(report.campaignOnly).toBeNull();
  });
});
