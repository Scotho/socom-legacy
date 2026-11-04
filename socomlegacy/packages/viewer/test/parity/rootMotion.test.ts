import { beforeAll, describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { clipsFromPack, motionTableFromArchive } from '../../src/motionTable';
import { deathPose } from '../../src/remotePlayers';
import { oneShotSeconds } from '../../src/locomotion';
/** Research 230 section 5: death clip clock, reading, pending review.
 * FUN_0028c4f0 D:L134236-134275 and key conversion D:L134881-134901:
 * one-shot duration is playback*((n-1)/n)^2, not playback.
 * Initial phase skipping, scheduler quantization and world displacement need an original capture.
 * This test exercises the actual deathPose API against disc data and the source clock model only.
 * D20 (PAR-23): a plain `it` since 2026-10-12 -- deathPose runs on the one-shot clock (FUN_0028cc10 D:L134482-134495
 * sets the stop (n-1)/n); before, an expected failure.
 */
const pack = fixture('RUN/MOTION_P.ZAR'), reader = fixture('RUN/READERC.ZAR');
describe.skipIf(!pack || !reader)(`research 230: death clock${!pack || !reader ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
    if (!pack || !reader)
        it.skip(FIXTURES_ABSENT, () => { });
    const table = reader ? motionTableFromArchive(reader) : null;
    const names = table ? [...table.keys()].filter(name => name.startsWith('death_')) : [];
    const clips = pack ? clipsFromPack(pack, names) : [];
    const observed = new Map<string, {
        actual: number;
        expected: number;
    }>();
    beforeAll(() => {
        expect(table).not.toBeNull();
        expect(clips.length).toBeGreaterThanOrEqual(22);
        for (const clip of clips) {
            const entry = table!.get(clip.name);
            expect(entry).toBeDefined();
            expect(clip.frameCount).toBeGreaterThan(1);
            expect(entry!.playback).not.toBeNull();
            const pose = deathPose(clip.name, oneShotSeconds(entry!.playback!, clip.frameCount), { clips, table: [...table!] });
            expect(pose).not.toBeNull();
            observed.set(clip.name, { actual: pose!.frame, expected: clip.frameCount - 1 });
        }
    });
    for (const clip of clips) {
        it(`${clip.name} reaches its last key at the one-shot source-model end`, () => {
            const row = observed.get(clip.name)!;
            expect(row.actual).toBeCloseTo(row.expected, 6);
        });
    }
    // The review's finding 3: the end alone passes any clock that runs fast (the frame caps at n-1). Mid-clip, the frame
    // at t is t*n^2/(T*(n-1)) (FUN_0028c4f0's phase over FUN_0028d670's key), on every real clip, not only its end.
    for (const clip of clips) {
        it(`${clip.name} is on the one-shot clock mid-clip (half its one-shot end)`, () => {
            const entry = table!.get(clip.name)!;
            const n = clip.frameCount, T = entry.playback!, end = oneShotSeconds(T, n);
            const pose = deathPose(clip.name, end / 2, { clips, table: [...table!] })!;
            expect(pose.frame).toBeCloseTo(((end / 2) * n * n) / (T * (n - 1)), 6);
        });
    }
});
