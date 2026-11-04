/**
 * LATER 310's sweep, printed: every scene program on the disc whose IF / ELSEIF condition the effect runner now folds
 * through its EXPRESSION operators (`FUN_0025e960`), what it ran before and what it runs now, and the evaluator's edges
 * (`tools/effectConditionSweep.ts`; research 89 §18 holds the table). Reads the disc's map archives one at a time.
 *
 *   SOCOM_PC_ROOT=<desktop tree> npx tsx tools/sweep-effect-conditions.ts            # every map of RUN/*.ZDB
 *   SOCOM_DISC=<extracted disc> npx tsx tools/sweep-effect-conditions.ts MP62 MP11   # those maps
 */
import { discRun, formatEdges, formatTable, groupRows, mapStems, sweepDisc } from './effectConditionSweep';

const run = discRun();
if (!run) {
  console.error('no disc: set SOCOM_DISC (an extracted disc) or SOCOM_PC_ROOT (its game/disc)');
  process.exit(2);
}
const wanted = process.argv.slice(2).map((a) => a.toUpperCase());
const sweeps = sweepDisc(run, wanted.length ? wanted : mapStems(run));
const rows = groupRows(sweeps);
console.log(`maps ${sweeps.length}; IF/ELSEIF conditions ${sweeps.reduce((n, s) => n + s.conditions, 0)}; rows ${rows.length}`
  + ` (initial ${rows.filter((g) => g.change === 'initial').length}, state ${rows.filter((g) => g.change === 'state').length},`
  + ` not enumerated ${rows.filter((g) => g.change === 'unenumerated').length}, never ${rows.filter((g) => g.change === 'never').length})\n`);
console.log(formatTable(rows));
console.log(`\nedges\n${formatEdges(sweeps)}`);
const whiles = sweeps.flatMap((s) => s.whiles);
console.log(`\nconditional WHILEs with an operator (taken as false by the runner, not LATER 310's): ${whiles.length}`);
for (const w of whiles) console.log(`  ${w}`);
const errors = sweeps.flatMap((s) => s.errors.map((e) => `${s.map}: ${e}`));
console.log(`\nreader errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
