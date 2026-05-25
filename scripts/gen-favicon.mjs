import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = path.join(ROOT, 'public', 'icon-512.png');

// Turbopack requer PNG em RGBA (4 canais) dentro do ICO — usa .ensureAlpha()
const [png16, png32] = await Promise.all([
  sharp(SRC).resize(16, 16, { fit: 'cover' }).ensureAlpha().png().toBuffer(),
  sharp(SRC).resize(32, 32, { fit: 'cover' }).ensureAlpha().png().toBuffer(),
]);

// ICO: ICONDIR (6 bytes) + 2x ICONDIRENTRY (16 bytes each) + PNG data
// dataOffset = 6 + 2*16 = 38
const headerSize = 6;
const entrySize  = 16;
const dataOffset = headerSize + 2 * entrySize; // 38

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = 1 (ICO)
header.writeUInt16LE(2, 4); // count = 2

const entry16 = Buffer.alloc(entrySize);
entry16.writeUInt8(16, 0);
entry16.writeUInt8(16, 1);
entry16.writeUInt8(0,  2);
entry16.writeUInt8(0,  3);
entry16.writeUInt16LE(1,  4);
entry16.writeUInt16LE(32, 6);
entry16.writeUInt32LE(png16.length, 8);
entry16.writeUInt32LE(dataOffset, 12);

const offset32 = dataOffset + png16.length;
const entry32 = Buffer.alloc(entrySize);
entry32.writeUInt8(32, 0);
entry32.writeUInt8(32, 1);
entry32.writeUInt8(0,  2);
entry32.writeUInt8(0,  3);
entry32.writeUInt16LE(1,  4);
entry32.writeUInt16LE(32, 6);
entry32.writeUInt32LE(png32.length, 8);
entry32.writeUInt32LE(offset32, 12);

const ico = Buffer.concat([header, entry16, entry32, png16, png32]);
const outPath = path.join(ROOT, 'app', 'favicon.ico');
writeFileSync(outPath, ico);
console.log(`✓ favicon.ico: ${ico.length} bytes (16px + 32px embedded PNG)`);
