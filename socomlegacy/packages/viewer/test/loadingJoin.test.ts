import { describe, expect, it } from 'vitest';
import {
  LOAD_NET_HOLD_CEILING_PLACEHOLDER, LoadingJoin, joinVerdict, pageLanes, type JoinLanes, type PageFacts,
} from '../src/loadingJoin';

/** Every lane done, in a networked play page that has its welcome. */
const ready: JoinLanes = {
  playOn: true, scene: 'done', walkWarmed: true, play: 'clips', armory: 'ready', effects: true, sound: true,
  url: true, net: 'online',
};

describe('joinVerdict: the lanes the loading screen holds on (research 125 §5)', () => {
  it('is ready only when every lane is done, and names the lanes it waits on', () => {
    expect(joinVerdict(ready)).toEqual({ state: 'ready' });
    expect(joinVerdict({ ...ready, scene: 'pending', sound: false })).toEqual({ state: 'waiting', on: ['scene', 'sound'] });
    expect(joinVerdict({ ...ready, effects: false })).toEqual({ state: 'waiting', on: ['effects'] });
    expect(joinVerdict({ ...ready, walkWarmed: false })).toEqual({ state: 'waiting', on: ['player'] });
    expect(joinVerdict({ ...ready, armory: 'pending' })).toEqual({ state: 'waiting', on: ['armory'] });
    expect(joinVerdict({ ...ready, net: 'connecting' })).toEqual({ state: 'waiting', on: ['connection'] });
  });

  it('a refused join fails at once with the server\'s reason (the original leaves the load for dlgNetError)', () => {
    expect(joinVerdict({ ...ready, scene: 'pending', net: 'refused', reason: 'the room is full' }))
      .toEqual({ state: 'failed', reason: 'refused: the room is full' });
    expect(joinVerdict({ ...ready, net: 'refused' })).toEqual({ state: 'failed', reason: 'refused: by the server' });
  });

  it('a URL whose match could not be made at all fails rather than waiting on a client that does not exist', () => {
    expect(joinVerdict({ ...ready, net: null })).toEqual({ state: 'failed', reason: 'the match could not be joined' });
    expect(joinVerdict({ ...ready, net: 'off' })).toEqual({ state: 'failed', reason: 'the match could not be joined' });
  });

  it('a silent server: the net client\'s own retry state ends the hold, not the connection', () => {
    expect(joinVerdict({ ...ready, net: 'connecting' }).state).toBe('waiting');
    expect(joinVerdict({ ...ready, net: 'retrying' })).toEqual({ state: 'ready' });
    // ...and the local lanes still hold the screen while the line reports unreachable.
    expect(joinVerdict({ ...ready, net: 'retrying', scene: 'pending' })).toEqual({ state: 'waiting', on: ['scene'] });
  });

  it('no URL: the connection lane is not asked (offline and the page\'s own room)', () => {
    expect(joinVerdict({ ...ready, url: false, net: 'offline' })).toEqual({ state: 'ready' });
    expect(joinVerdict({ ...ready, url: false, net: null })).toEqual({ state: 'ready' });
  });

  it('the play answer without clips (no MOTION_P.ZAR) is done; only an unanswered request holds', () => {
    expect(joinVerdict({ ...ready, play: 'none' })).toEqual({ state: 'ready' });
    expect(joinVerdict({ ...ready, play: 'pending' })).toEqual({ state: 'waiting', on: ['player'] });
    expect(joinVerdict({ ...ready, playOn: false, play: 'pending', walkWarmed: false, armory: 'pending' })).toEqual({ state: 'ready' });
  });

  it('a world whose warm-up failed is done (the failure is surfaced where main surfaces it)', () => {
    expect(joinVerdict({ ...ready, scene: 'failed' })).toEqual({ state: 'ready' });
  });

  it('an ARMORY with no context does not block', () => {
    expect(joinVerdict({ ...ready, armory: 'none' })).toEqual({ state: 'ready' });
    expect(joinVerdict({ ...ready, armory: 'off' })).toEqual({ state: 'ready' });
  });
});

describe('LoadingJoin: the hold over the original loading presentation', () => {
  it('does not reveal decoded scenery or enter before every required lane is ready', () => {
    const j = new LoadingJoin(); j.begin(3);
    expect(j.frame(3, { ...ready, scene: 'pending' }, 100)).toBe('hold');
    expect(j.frame(3, { ...ready, sound: false }, 100)).toBe('hold');
    expect(j.blocked).toBe(true);
    expect(j.frame(3, ready, 101)).toBe('hold');
    expect(j.frame(3, ready, 101.49)).toBe('hold');
    expect(j.frame(3, ready, 101.501)).toBe('released');
    expect(j.blocked).toBe(false);
  });

  it('waits through a long load and restarts the original completion hold if readiness is lost', () => {
    const j = new LoadingJoin(); j.begin(4);
    expect(j.frame(4, { ...ready, net: 'connecting' }, 60)).toBe('hold');
    expect(j.frame(4, ready, 61)).toBe('hold');
    expect(j.frame(4, { ...ready, net: 'connecting' }, 61.4)).toBe('hold');
    expect(j.frame(4, ready, 63)).toBe('hold');
    expect(j.frame(4, ready, 63.501)).toBe('released');
  });

  it('a refused join releases the screen at once through failed, the reason kept for the page', () => {
    const j = new LoadingJoin(); j.begin(7);
    expect(j.frame(7, { ...ready, scene: 'pending', net: 'refused', reason: 'version mismatch' }, 10)).toBe('failed');
    expect(j.blocked).toBe(false);
    expect(j.reason).toBe('refused: version mismatch');
    expect(j.frame(7, ready, 11)).toBe('idle');
  });

  it('a server that never answers: connecting holds, retrying lets the screen go after the completion hold', () => {
    const j = new LoadingJoin(); j.begin(8);
    expect(j.frame(8, { ...ready, net: 'connecting' }, 0)).toBe('hold');
    expect(j.frame(8, { ...ready, net: 'connecting' }, 15)).toBe('hold');   // inside LOAD_NET_HOLD_CEILING_PLACEHOLDER
    expect(j.frame(8, { ...ready, net: 'retrying' }, 16)).toBe('hold');
    expect(j.frame(8, { ...ready, net: 'retrying' }, 16.6)).toBe('released');
  });

  it('play mode without MOTION_P.ZAR releases once the play request is answered', () => {
    const j = new LoadingJoin(); j.begin(9);
    expect(j.frame(9, { ...ready, play: 'pending' }, 0)).toBe('hold');
    expect(j.frame(9, { ...ready, play: 'none' }, 1)).toBe('hold');
    expect(j.frame(9, { ...ready, play: 'none' }, 1.6)).toBe('released');
  });

  it('ignores stale completions and releases on a failed current request', () => {
    const j = new LoadingJoin(); j.begin(5); j.begin(6);
    expect(j.frame(5, ready, 900)).toBe('idle');
    j.failed(5); expect(j.blocked).toBe(true);
    j.failed(6); expect(j.blocked).toBe(false);
    expect(j.frame(6, ready, 901)).toBe('idle');
  });
});

describe('ONL-18b: the load reported once, at the release (the page\'s `loaded`, both paths through LoadingJoin)', () => {
  it('the report runs on the frame that releases, once -- never while it holds, never again after, never on a failure', () => {
    const j = new LoadingJoin();
    let reports = 0;
    j.begin(3, () => { reports++; });
    expect(j.frame(3, { ...ready, scene: 'pending' }, 100)).toBe('hold');
    expect(j.frame(3, ready, 100.2)).toBe('hold');
    expect(reports).toBe(0);
    expect(j.frame(3, ready, 100.8)).toBe('released');
    expect(reports).toBe(1);
    expect(j.frame(3, ready, 101)).toBe('idle');
    expect(reports).toBe(1);
    // A load that fails (refused) or is replaced reports nothing; the next load reports its own release.
    let failedReports = 0;
    j.begin(4, () => { failedReports++; });
    expect(j.frame(4, { ...ready, net: 'refused', reason: 'x' }, 0)).toBe('failed');
    j.begin(5, () => { failedReports++; }); j.begin(6, () => { reports++; });
    expect(j.frame(5, ready, 0)).toBe('idle');
    j.frame(6, ready, 0); j.frame(6, ready, 0.6);
    expect(failedReports).toBe(0);
    expect(reports).toBe(2);
  });
});

describe('LOAD-HOLD: a load with the host\'s barrier (research 322 B1; the front end\'s match, `./lobbyMatch`)', () => {
  it('reports when every other lane is in, holds on the barrier, and releases on it once its own 0.5 s has run -- the report once', () => {
    // Was (LOAD-HOLD): the 0.5 s counted from the barrier (released at 141.6); ROUND1-COUNT: the room's round 1 already
    // comes its 0.5 s after the host's barrier, so the page's own count runs from its assets and the round releases it.
    const j = new LoadingJoin();
    let reports = 0;
    j.begin(3, () => { reports++; });
    expect(j.frame(3, { ...ready, scene: 'pending', barrier: false }, 100)).toBe('hold');
    expect(reports).toBe(0);
    expect(j.frame(3, { ...ready, barrier: false }, 101)).toBe('hold');        // the page's own load done: minor state 2 (D:L55699-55702)
    expect(reports).toBe(1);
    expect(j.frame(3, { ...ready, barrier: false }, 140)).toBe('hold');        // the room still waits for another seat
    expect(j.frame(3, { ...ready, barrier: true }, 141)).toBe('released');     // round 1's start: the 0.5 s long counted
    expect(reports).toBe(1);
    expect(joinVerdict({ ...ready, barrier: false })).toEqual({ state: 'waiting', on: ['barrier'] });
    // The barrier passed before the assets: the report at the assets, the release 0.5 s later.
    j.begin(4, () => { reports++; });
    expect(j.frame(4, { ...ready, scene: 'pending', barrier: true }, 0)).toBe('hold');
    expect(j.frame(4, { ...ready, barrier: true }, 1)).toBe('hold');
    expect(reports).toBe(2);
    expect(j.frame(4, { ...ready, barrier: true }, 1.6)).toBe('released');
    expect(reports).toBe(2);
  });

  it('ROUND1-COUNT: round 1 heard within 0.5 s of the assets -- the release at the assets + 0.5 s, max(assets, barrier) + 0.5 in the original\'s terms', () => {
    // The original counts its 0.5 s from the later of its own load and the host's barrier (`FUN_001f5e70` D:L55657-55659 online,
    // D:L55603-55604 offline, zeroes the counter at the load's end; D:L55748-55755 counts it once `+0xd0` is set); the room sends round 1 its
    // 0.5 s after the barrier (server `ROUND1_AFTER_BARRIER_S_READING`), so max(assets + 0.5, round 1) is the same moment.
    const j = new LoadingJoin();
    let reports = 0;
    j.begin(7, () => { reports++; });
    expect(j.frame(7, { ...ready, barrier: false }, 10)).toBe('hold');         // the assets in at 10 s: reported
    expect(reports).toBe(1);
    expect(j.frame(7, { ...ready, barrier: true }, 10.2)).toBe('hold');        // round 1 heard at 10.2 s: 0.2 s counted
    expect(j.frame(7, { ...ready, barrier: true }, 10.45)).toBe('hold');
    expect(j.frame(7, { ...ready, barrier: true }, 10.55)).toBe('released');
    expect(reports).toBe(1);
    // A lane lost while held on the barrier starts the page's count again from its return (the load's end anew).
    j.begin(8, () => { reports++; });
    expect(j.frame(8, { ...ready, barrier: false }, 20)).toBe('hold');
    expect(j.frame(8, { ...ready, net: 'connecting', barrier: false }, 21)).toBe('hold');
    expect(j.frame(8, { ...ready, barrier: false }, 22)).toBe('hold');
    expect(j.frame(8, { ...ready, barrier: true }, 22.3)).toBe('hold');
    expect(j.frame(8, { ...ready, barrier: true }, 22.6)).toBe('released');
  });

  it('ROUND1-COUNT: a load with no barrier lane (the test room, `./main`) still counts its 0.5 s from the frame every lane is in', () => {
    const j = new LoadingJoin();
    j.begin(9);
    expect(j.frame(9, { ...ready, scene: 'pending' }, 0)).toBe('hold');
    expect(j.frame(9, ready, 1)).toBe('hold');
    expect(j.frame(9, ready, 1.4)).toBe('hold');
    expect(j.frame(9, ready, 1.6)).toBe('released');
  });
});

/** The page's facts on a frame of load 4, every lane in, its client made for load 4 and welcomed. */
const WORLD = { name: 'the world' }, OLD_WORLD = { name: 'the previous world' };
const facts: PageFacts = {
  load: 4, playOn: true, view: WORLD, worldWarmed: WORLD, worldWarmFailed: null, playAnswer: 'clips', walkWarmed: true,
  noArmory: false, loadedArmory: 4, armoryReady: true, loadedEffects: 4, loadedSound: 4,
  url: true, netLoad: 4, status: { state: 'online' },
};

describe('pageLanes: the page\'s facts to the lanes (F1/F2 of the PR #10 carry review)', () => {
  it('every fact in for this load is ready', () => {
    expect(joinVerdict(pageLanes(facts))).toEqual({ state: 'ready' });
  });

  it('between the load and show(): a URL set and no client attempted for this load waits on the connection', () => {
    // `net` is null on every online load until `show` calls `connectNet`, once the decoded map is back.
    const first = pageLanes({ ...facts, view: null, worldWarmed: null, netLoad: -1, status: null });
    expect(first.net).toBe('unasked');
    expect(joinVerdict(first)).toEqual({ state: 'waiting', on: ['scene', 'connection'] });
    expect(joinVerdict(pageLanes({ ...facts, netLoad: -1, status: null }))).toEqual({ state: 'waiting', on: ['connection'] });
  });

  it('a map switch: the previous load\'s client never answers for the new one', () => {
    expect(joinVerdict(pageLanes({ ...facts, netLoad: 3, status: { state: 'refused', reason: 'the room is full' } })))
      .toEqual({ state: 'waiting', on: ['connection'] });
    expect(joinVerdict(pageLanes({ ...facts, netLoad: 3, status: { state: 'online' } })))
      .toEqual({ state: 'waiting', on: ['connection'] });
    expect(joinVerdict(pageLanes({ ...facts, netLoad: 3, status: { state: 'retrying' } })))
      .toEqual({ state: 'waiting', on: ['connection'] });
  });

  it('the client this load attempted: made and refused fails with the reason; not made at all (the catch) fails', () => {
    expect(joinVerdict(pageLanes({ ...facts, status: { state: 'refused', reason: 'version mismatch' } })))
      .toEqual({ state: 'failed', reason: 'refused: version mismatch' });
    expect(joinVerdict(pageLanes({ ...facts, status: null }))).toEqual({ state: 'failed', reason: 'the match could not be joined' });
    expect(joinVerdict(pageLanes({ ...facts, status: { state: 'connecting' } }))).toEqual({ state: 'waiting', on: ['connection'] });
  });

  it('no URL: the connection is not asked, whatever client is or is not there', () => {
    expect(joinVerdict(pageLanes({ ...facts, url: false, netLoad: -1, status: null }))).toEqual({ state: 'ready' });
    expect(joinVerdict(pageLanes({ ...facts, url: false, netLoad: 3, status: { state: 'refused' } }))).toEqual({ state: 'ready' });
  });

  it('the scene: pending without a view or before its warm-up, done when warmed, failed when its warm-up rejected', () => {
    expect(pageLanes({ ...facts, view: null }).scene).toBe('pending');
    expect(pageLanes({ ...facts, worldWarmed: OLD_WORLD }).scene).toBe('pending');
    expect(pageLanes({ ...facts, worldWarmed: OLD_WORLD, worldWarmFailed: WORLD }).scene).toBe('failed');
    expect(pageLanes(facts).scene).toBe('done');
  });

  it('the ARMORY: off without play or with ?noarmory, pending until this load\'s answer, then ready or none', () => {
    expect(pageLanes({ ...facts, noArmory: true }).armory).toBe('off');
    expect(pageLanes({ ...facts, playOn: false }).armory).toBe('off');
    expect(pageLanes({ ...facts, loadedArmory: 3 }).armory).toBe('pending');
    expect(pageLanes({ ...facts, armoryReady: false }).armory).toBe('none');
    expect(pageLanes(facts).armory).toBe('ready');
  });

  it('effects and sound are this load\'s answers; the play answer and the walk\'s warm-up pass through', () => {
    expect(joinVerdict(pageLanes({ ...facts, loadedEffects: 3, loadedSound: 3 }))).toEqual({ state: 'waiting', on: ['effects', 'sound'] });
    expect(joinVerdict(pageLanes({ ...facts, playAnswer: 'pending' }))).toEqual({ state: 'waiting', on: ['player'] });
    expect(joinVerdict(pageLanes({ ...facts, walkWarmed: false }))).toEqual({ state: 'waiting', on: ['player'] });
    expect(pageLanes({ ...facts, status: { state: 'refused', reason: 'full' } }).reason).toBe('full');
  });
});

describe('the hold\'s ceiling on a server that opens and never welcomes (F3, LOAD_NET_HOLD_CEILING_PLACEHOLDER)', () => {
  it('connecting holds up to the ceiling, then the screen releases after the completion hold', () => {
    const j = new LoadingJoin(); j.begin(10);
    const connecting = { ...ready, net: 'connecting' as const };
    expect(j.frame(10, connecting, 100)).toBe('hold');
    expect(j.frame(10, connecting, 100 + LOAD_NET_HOLD_CEILING_PLACEHOLDER - 0.01)).toBe('hold');
    expect(j.frame(10, connecting, 100 + LOAD_NET_HOLD_CEILING_PLACEHOLDER + 0.01)).toBe('hold');
    expect(j.frame(10, connecting, 100 + LOAD_NET_HOLD_CEILING_PLACEHOLDER + 0.6)).toBe('released');
  });

  it('the ceiling counts from this load\'s client, not from the load: the decode before it is not counted', () => {
    const j = new LoadingJoin(); j.begin(11);
    expect(j.frame(11, { ...ready, net: 'unasked' }, 0)).toBe('hold');
    expect(j.frame(11, { ...ready, net: 'unasked' }, LOAD_NET_HOLD_CEILING_PLACEHOLDER + 5)).toBe('hold');
    expect(j.frame(11, { ...ready, net: 'connecting' }, LOAD_NET_HOLD_CEILING_PLACEHOLDER + 6)).toBe('hold');
    expect(j.frame(11, { ...ready, net: 'connecting' }, LOAD_NET_HOLD_CEILING_PLACEHOLDER + 7)).toBe('hold');
  });

  it('a new load starts its own ceiling', () => {
    const j = new LoadingJoin(); j.begin(12);
    j.frame(12, { ...ready, net: 'connecting' }, 0);
    j.begin(13);
    expect(j.frame(13, { ...ready, net: 'connecting' }, LOAD_NET_HOLD_CEILING_PLACEHOLDER + 1)).toBe('hold');
    expect(j.frame(13, { ...ready, net: 'connecting' }, LOAD_NET_HOLD_CEILING_PLACEHOLDER + 2)).toBe('hold');
  });
});
