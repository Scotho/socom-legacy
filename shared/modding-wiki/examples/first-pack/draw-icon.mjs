// Draws the example pack's icon: a made-up 256x256 PNG (a disc, its left half filled -- "half damage"), so the
// example holds no game data and no third-party art (the modding wiki's no-game-data rule). Plain Node.js, no packages.
//
//   node draw-icon.mjs              writes pack/icon.png beside this script
//   node draw-icon.mjs <file.png>   writes it there instead
//
// Thunderstore wants a 256x256 PNG called icon.png at the package's root. Replace it with your own art for your pack.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 256;
const BACKGROUND = [0x1e, 0x25, 0x2e];
const INK = [0xe0, 0x8a, 0x2c];

/** The colour of one pixel: a disc of radius 100 at the centre, filled on its left half, a 10-pixel ring on its right. */
function pixel(x, y) {
  const dx = x + 0.5 - SIZE / 2;
  const dy = y + 0.5 - SIZE / 2;
  const r = Math.hypot(dx, dy);
  if (r > 100) return BACKGROUND;
  if (dx < 0 || r > 90 || Math.abs(dx) < 3) return INK;
  return BACKGROUND;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: its length, its type, its data and the CRC of type and data. */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function drawIcon() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0); // width
  header.writeUInt32BE(SIZE, 4); // height
  header[8] = 8; // 8 bits a channel
  header[9] = 2; // RGB
  const rows = Buffer.alloc(SIZE * (1 + SIZE * 3)); // each row: filter byte 0, then RGB
  for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 3);
    for (let x = 0; x < SIZE; x++) rows.set(pixel(x, y), row + 1 + x * 3);
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const out = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'pack', 'icon.png');
writeFileSync(out, drawIcon());
console.log(`wrote ${out} (${SIZE}x${SIZE})`);
