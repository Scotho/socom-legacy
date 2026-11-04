// Before/after implementation check for the shared human mover. No original-console parity claim.
// --reference points at mover.ts exported from the pinned base, next to the current mover so its imports resolve.
// The reference and disc remain local. Run serially with other heavy checks on this host.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { simMapFromBytes, simClipsFromBytes } from '../packages/viewer/src/simMap.ts';
import { Walker } from '../packages/viewer/src/mover.ts';

export async function compareMovers({ root, reference, maps = ['MP2', 'MP6', 'MP7'], seeds = [7, 11, 23], ticks = 3600 }) {
  const { Walker: Original } = await import(pathToFileURL(resolve(reference)).href);
  const bytes = name => readFileSync(join(root, 'RUN', name));
  const clips = simClipsFromBytes(bytes('MOTION_P.ZAR'), bytes('READERC.ZAR'));
  const report = [];
  for (const stem of maps) {
    const map = simMapFromBytes(bytes(`${stem}.ZDB`), `RUN/${stem}.ZDB`);
    assert.ok(map.spawns, `${stem}: missing starting positions`);
    for (const seed of seeds) {
      let random = seed, frames = 0, replays = 0, contacts = 0, airborneTicks = 0, distance = 0;
      const hash = createHash('sha256');
      const next = () => { random = random * 16807 % 2147483647; return random / 2147483647; };
      const apply = (w, cmd) => {
        if (cmd.yaw !== null) w.state.yaw = cmd.yaw;
        if (cmd.stance) w.changeStance(cmd.stance);
        if (cmd.jump) w.jump();
        w.tick(cmd.input);
      };
      for (const start of [map.spawns.a, map.spawns.b]) {
        const before = new Original(map.grid), after = new Walker(map.grid);
        for (const w of [before, after]) { assert.ok(w.place(...start)); w.actionRoots = clips.roots; }
        let segment = [], saved = [];
        for (let t = 0; t < ticks; t++) {
          if (t % 300 === 0) { segment = []; saved = [before.saveState(), after.saveState()]; }
          const cmd = {
            yaw: t % 30 === 0 ? next() * 360 : null,
            stance: t % 151 === 0 ? ['stand', 'crouch', 'prone'][Math.floor(next() * 3)] : null,
            jump: t % 113 === 0,
            input: { forward: t % 240 < 180 ? 1 : -0.5, right: t % 180 < 90 ? 0.65 : -0.65, boost: false },
          };
          segment.push(cmd);
          const old = [before.state.x, before.state.z];
          apply(before, cmd); apply(after, cmd);
          assert.deepStrictEqual(after.saveState(), before.saveState(), `${stem}/${seed}/${t}`);
          hash.update(JSON.stringify(after.saveState())); frames++;
          contacts += after.wallHits().length; airborneTicks += Number(after.airborne);
          distance += Math.hypot(before.state.x - old[0], before.state.z - old[1]);
          if (t % 300 === 299 || t === ticks - 1) {
            const final = after.saveState();
            before.restoreState(saved[0]); after.restoreState(saved[1]);
            for (const replay of segment) {
              apply(before, replay); apply(after, replay);
              assert.deepStrictEqual(after.saveState(), before.saveState(), `${stem}/${seed}/${t} replay`);
              replays++;
            }
            assert.deepStrictEqual(after.saveState(), final, 'rollback replay changed result');
          }
        }
      }
      report.push({ stem, seed, frames, replays, contacts, airborneTicks, distance, hash: hash.digest('hex') });
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 1 ? process.argv[i + 1] : undefined; };
  const reference = arg('reference'), root = arg('root') ?? process.env.SOCOM_DISC;
  if (!reference || !root) throw new Error('Usage: node --import tsx tools/mover-parity.mjs --reference <base mover module> --root <disc root containing RUN>');
  console.log(JSON.stringify(await compareMovers({ root, reference }), null, 2));
}
