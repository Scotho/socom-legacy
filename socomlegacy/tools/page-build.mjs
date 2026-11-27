#!/usr/bin/env node
// The page build's launcher (LATER 1158; product track, deploy tooling): `npm run build` runs `vite build` through this
// file so that a small source-building host has the heap the build needs (the rule: tools/pageBuildHeap.mjs). The fix
// sits in the build the release's own commit carries, not only in update-host.sh: a host's update-host.sh refreshes
// itself only after a build succeeds, so a fix there alone never reaches a host whose build fails. This file is only
// ever run, never imported: it has no "run directly?" guard (the review of b3beed75d1, finding 1).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { buildKilledMessage, memInfoMb, pageBuildHeapMb, usableMemoryMb } from './pageBuildHeap.mjs';

const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');
const usableMb = usableMemoryMb(totalmem(), process.constrainedMemory?.());
const defaultMb = Math.floor(getHeapStatistics().heap_size_limit / 1048576);
// LATER 1210: the memory available and the swap free now (Linux's /proc/meminfo; elsewhere null, the share alone).
let meminfo;
try { meminfo = readFileSync('/proc/meminfo', 'utf8'); } catch { meminfo = undefined; }
const mem = memInfoMb(meminfo);
const heap = pageBuildHeapMb(process.env.NODE_OPTIONS, usableMb, defaultMb, mem);
console.error(heap === null
  ? `page build: Node's heap as it is (${/--max[-_]old[-_]space[-_]size/.test(process.env.NODE_OPTIONS ?? '') ? 'NODE_OPTIONS sets it' : `default ${defaultMb} MB`}; usable ${usableMb} MB)`
  : `page build: Node's heap ${heap} MB (default ${defaultMb} MB; usable ${usableMb} MB${mem ? `; available ${mem.availableMb} MB, swap free ${mem.swapFreeMb} MB` : ''}; LATER 1158, 1210)`);
const run = spawnSync(process.execPath, [...(heap === null ? [] : [`--max-old-space-size=${heap}`]), vite, 'build', ...process.argv.slice(2)], { stdio: 'inherit' });
if (run.error) { console.error(`page build: ${run.error.message}`); process.exit(1); }
// LATER 1210: a kill is named (FIREHUGE2's OOM kill printed only `build failed`) and still exits 1, never 128 + its number:
// update-host.sh reads 137 (and 124) as a step that timed out (`why`, `timed_out`), and a memory kill is no timeout (the
// review of 854159ae78, finding 1).
if (run.signal) { console.error(buildKilledMessage(run.signal, heap, mem)); process.exit(1); }
process.exit(run.status ?? 1);
