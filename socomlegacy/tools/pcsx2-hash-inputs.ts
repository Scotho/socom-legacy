import { writeFileSync } from 'node:fs';
import { discTextureRecords } from './discTextureRecords';

/**
 * The raw inputs PCSX2's texture-replacement name is computed from, for every texture record on the disc
 * (`./discTextureRecords`), as NDJSON for the HD evidence scripts (plan 2026-10-31-hd-texture-pack-parity). Decoded
 * disc data: write outside the repository.
 * Usage: tsx tools/pcsx2-hash-inputs.ts <disc root> <out.ndjson>
 */
const [disc, outFile] = process.argv.slice(2);
if (!disc || !outFile) { console.error('usage: pcsx2-hash-inputs.ts <disc root> <out.ndjson>'); process.exit(2); }
const b64 = (b: Uint8Array | null) => b ? Buffer.from(b).toString('base64') : null;
const records = discTextureRecords(disc, (m) => console.error(m));
writeFileSync(outFile, records.map(({ rgba: _rgba, ...r }) => JSON.stringify({ ...r, pixels: b64(r.pixels), pal: b64(r.pal) })).join('\n') + '\n');
console.log(JSON.stringify({ records: records.length }));
