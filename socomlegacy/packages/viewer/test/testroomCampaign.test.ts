import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_ARCHIVES } from '@s2u/archive';
import {
  campaignEntry, campaignInstrumentOn, campaignPathsOf, campaignStand, campaignStemOf, M51_INSERTION_MEASURED, standSlots,
} from '../src/testroomCampaign';
import { wrapYaw } from '../src/yaw';

/** The test room on a development build with the bare `?devmode`: where the instrument is on. */
const ON = { devBuild: true, search: '?mode=play&devmode&noarmory&map=M51', pathname: '/testroom' };
const DISC = ['RUN/MP2.ZDB', 'RUN/M51.ZDB', 'RUN/M52.ZDB', 'RUN/READERM.ZAR'];

describe('the campaign instrument is the devmode test room only', () => {
  it('is on with a development build, ?devmode and /testroom', () => {
    expect(campaignInstrumentOn(ON)).toBe(true);
    expect(campaignInstrumentOn({ ...ON, pathname: '/socomlegacy/testroom/' })).toBe(true);
  });

  it('is off without devmode, off the test room, and on a build that is not a development one', () => {
    expect(campaignInstrumentOn({ ...ON, search: '?mode=play&map=M51' })).toBe(false);
    expect(campaignInstrumentOn({ ...ON, pathname: '/' })).toBe(false);
    expect(campaignInstrumentOn({ ...ON, pathname: '/forge' })).toBe(false);
    expect(campaignInstrumentOn({ ...ON, devBuild: false })).toBe(false);
  });
});

describe('campaignEntry', () => {
  it('matches a campaign stem the source holds, case aside, and names RUN/<stem>.ZDB', () => {
    expect(campaignStemOf('m51')).toBe('M51');
    expect(campaignStemOf('MP2')).toBeNull();
    expect(campaignStemOf('M99')).toBeNull();
    expect(campaignEntry('m51', DISC, 'Seeding Chaos', ON)).toEqual({ archive: 'M51', path: 'RUN/M51.ZDB', name: 'Seeding Chaos' });
    expect(campaignEntry('M52', DISC, 'M52', ON)?.path).toBe('RUN/M52.ZDB');
  });

  it('refuses a stem the source does not hold, a multiplayer stem, and any stem off the instrument', () => {
    expect(campaignEntry('M53', DISC, 'M53', ON)).toBeNull();
    expect(campaignEntry('MP2', DISC, 'Frostfire', ON)).toBeNull();
    expect(campaignEntry('M51', DISC, 'M51', { ...ON, search: '?map=M51' })).toBeNull();
    expect(campaignEntry('M51', DISC, 'M51', { ...ON, pathname: '/' })).toBeNull();
    expect(campaignEntry('M51', DISC, 'M51', { ...ON, devBuild: false })).toBeNull();
  });

  it('takes the campaign paths out of a listing, in the disc case of the path', () => {
    expect(campaignPathsOf(['RUN/MP2.ZDB', 'run/m51.zdb', 'RUN/M83.ZDB', 'RUN/M84.ZDB'])).toEqual(['run/m51.zdb', 'RUN/M83.ZDB']);
    expect(campaignPathsOf(CAMPAIGN_ARCHIVES)).toHaveLength(12);
  });
});

describe('standSlots', () => {
  it('builds index 0 of side 0 and side 1 at the spot, on the floor', () => {
    const slots = standSlots({ x: 1, y: 2, z: 3, yaw: 90 });
    expect(slots.map((s) => [s.side, s.index])).toEqual(expect.arrayContaining([[0, 0], [1, 0]]));
    expect(slots).toHaveLength(2);
    for (const s of slots) {
      expect(s.position).toEqual([1, 2, 3]);
      expect(s.onFloor).toBe(true);
    }
  });

  it('gives the room the page yaw back: room.ts spawn sets Pose.yaw = wrapYaw(-step * 45)', () => {
    // packages/match/src/room.ts `spawn`: "step k points along (sin 45k, -cos 45k); `Pose.yaw` faces (-sin yaw, -cos yaw)".
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const [slot] = standSlots({ x: 0, y: 0, z: 0, yaw });
      expect(wrapYaw(-slot!.step * 45), `yaw ${yaw}`).toBe(yaw);
      const r = (yaw * Math.PI) / 180;
      expect(slot!.facing[0]).toBeCloseTo(-Math.sin(r), 9);   // the slot's facing is the pose's
      expect(slot!.facing[1]).toBeCloseTo(-Math.cos(r), 9);
    }
  });
});

describe('M51_INSERTION_MEASURED', () => {
  it('is the console spawn feet of research 82 / 201 (spawn_pcsx2.rdram)', () => {
    expect([M51_INSERTION_MEASURED.x, M51_INSERTION_MEASURED.y, M51_INSERTION_MEASURED.z]).toEqual([939.44, -145.87, 857.07]);
  });

  it('faces +z: the console camera of research 82 §1.1 looks from eye to target along +z, which is Pose.yaw 180', () => {
    // research 82 §1.1: eye (939.439, -126.264, 832.160), target (939.439, -130.489, 858.341). The page faces
    // (-sin yaw, -cos yaw) (yaw.ts; room.ts spawn), so yaw = atan2(-dx, -dz).
    const dx = 939.439 - 939.439, dz = 858.341 - 832.160;
    const yaw = wrapYaw((Math.atan2(-dx, -dz) * 180) / Math.PI);
    expect(yaw).toBeCloseTo(180, 9);
    expect(M51_INSERTION_MEASURED.yaw).toBe(180);
    const r = (M51_INSERTION_MEASURED.yaw * Math.PI) / 180;
    expect(-Math.cos(r)).toBeCloseTo(1, 9);                       // +z
    expect(standSlots(M51_INSERTION_MEASURED)[0]!.step).toBe(4);
  });
});

describe('campaignStand', () => {
  const layout = standSlots({ x: 5, y: 5, z: 5, yaw: 0 });

  it('changes nothing for a multiplayer stem, or a campaign stem whose slots are not empty', () => {
    expect(campaignStand('MP2', [], null)).toBeNull();
    expect(campaignStand('M51', layout, null)).toBeNull();
  });

  it('stands M51 at its measured insertion, and an at= spot overrides it', () => {
    const measured = campaignStand('M51', [], null);
    expect(measured && 'slots' in measured ? measured.slots[0]!.position : null).toEqual([939.44, -145.87, 857.07]);
    const asked = campaignStand('M51', [], { x: 960, y: -140.48, z: 696, yaw: 270 });
    expect(asked && 'slots' in asked ? asked.slots[0]!.position : null).toEqual([960, -140.48, 696]);
  });

  it('refuses a campaign stem with no measured stand and no at=, with a line that says so -- no guessed spawn', () => {
    const r = campaignStand('M52', [], null);
    expect(r && 'refused' in r ? r.refused : '').toMatch(/M52.*at=/);
    const at = campaignStand('M52', [], { x: 1, y: 2, z: 3, yaw: 0 });
    expect(at && 'slots' in at ? at.slots.length : 0).toBe(2);
  });
});

describe('the served probe, shared by the forge and the test room (forge/servedPaths)', () => {
  it('keeps a campaign file the tree answers for, and drops a dev server page (HTML), a 404 and a failed fetch', async () => {
    const { servedCampaignPaths } = await import('../src/forge/servedPaths');
    const asked: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      asked.push(`${init?.method} ${url}`);
      if (url.endsWith('M51.ZDB')) return new Response(null, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
      if (url.endsWith('M52.ZDB')) return new Response(null, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.endsWith('M53.ZDB')) throw new Error('offline');
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    expect(await servedCampaignPaths('/maps', fake)).toEqual(['RUN/M51.ZDB']);
    expect(asked).toHaveLength(12);
    expect(asked[0]).toBe('HEAD /maps/RUN/M51.ZDB');
  });
});

describe('main.ts wires the stand (source inspection)', () => {
  const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');
  const GATE = ['import', 'meta', 'env', 'DEV'].join('.');          // spelled as devPanelGate.test.ts spells it

  it('asks the worker for the campaign list only with the instrument on, and lists the wanted mission after the allowlist', () => {
    expect(main).toContain("ask({ kind: 'index', id: wantedIndex, source: from, ...(CAMPAIGN_ON ? { campaign: true } : {}) });");
    expect(main).toContain('showMaps(message.maps, message.campaign ?? []);');
    expect(main).toMatch(/const mission = campaignEntry\(wanted, campaign, [^\n]*, CAMPAIGN_GATE\);\n\s+const ordered = \[\.\.\.sortByPopularity\(allowed\), \.\.\.\(mission \? \[mission\] : \[\]\)\];/);
    expect(main).toContain(`const CAMPAIGN_GATE = { devBuild: ${GATE}, search: SEARCH,`);
  });

  it('plays a campaign load offline and stands round 1 before the room is made, or refuses on the page', () => {
    expect(main).toContain('} else if (NET.url && !campaignLoad && !customLoad) {');   // FP-6 F2: a custom map offline too
    const start = main.indexOf('const soloMap = simMapOfLoaded(map);');
    const room = main.indexOf('solo = new LoopbackMatch(soloMap, simClipsOfPlay(playClips), {');
    expect(start).toBeGreaterThan(0);
    expect(room).toBeGreaterThan(start);
    const between = main.slice(start, room);
    expect(between).toContain('campaignStand(stem, soloMap.slots, campaignAsk ?? null)');
    expect(between).toContain("if (stand && 'refused' in stand) { ui.setStatus(stand.refused, 'error'); return; }");
    expect(between).toContain('if (stand) soloMap.slots = stand.slots;');
    // The &at= spot is read through the development module, never a static import of devSpot (devPanel.test.ts).
    expect(main).toContain(`${GATE} && CAMPAIGN_ON   // folded away in a release\n  ? import('./devSpot')`);
  });
});
