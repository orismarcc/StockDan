/**
 * Gera ícones PWA do StockDan a partir do SVG da marca:
 * fundo verde #22c55e (green-500) com cubo branco centralizado.
 *
 * - "any"      → logo sobre fundo verde puro
 * - "maskable" → logo sobre fundo verde com safe zone 10%
 * - "apple-touch-icon" → 180x180 verde sólido (iOS)
 * - favicon.ico → 16x32px RGBA embedded-PNG
 *
 * Rode: npm run pwa:icons
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// ── SVG da marca (cubo 3-D branco, mesma path do Sidebar e Login) ──────────
function brandSvg(size) {
  const pad  = Math.round(size * 0.18)          // ~18% de padding
  const icon = size - pad * 2
  const sw   = Math.max(1, Math.round(icon / 13)) // stroke proporcional
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#22c55e"/>
    <svg x="${pad}" y="${pad}" width="${icon}" height="${icon}" viewBox="0 0 24 24"
      fill="none" stroke="white" stroke-width="${sw}"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7"/>
    </svg>
  </svg>`)
}

// ── Gera PNG a partir do SVG ────────────────────────────────────────────────
async function makePng(size) {
  return sharp(brandSvg(size), { density: 300 })
    .resize(size, size)
    .ensureAlpha()
    .png({ quality: 95 })
    .toBuffer()
}

// ── Ícones "any" (logo quadrada, rx proporcional) ───────────────────────────
const ANY_SIZES = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32,  name: 'favicon-32.png' },
  { size: 16,  name: 'favicon-16.png' },
]

console.log('→ Gerando ícones "any"…')
for (const { size, name } of ANY_SIZES) {
  const buf = await makePng(size)
  writeFileSync(path.join(OUT_DIR, name), buf)
  console.log(`  ✓ icons/${name}`)
}

// ── Ícones "maskable" (safe zone 10% com fundo verde preenchendo tudo) ──────
console.log('→ Gerando ícones "maskable"…')
const MASKABLE = [
  { size: 192, name: 'icon-192-maskable.png' },
  { size: 512, name: 'icon-512-maskable.png' },
]
for (const { size, name } of MASKABLE) {
  const inner   = Math.round(size * 0.80)
  const padding = Math.round((size - inner) / 2)
  const innerBuf = await makePng(inner)
  const buf = await sharp({
    create: { width: size, height: size, channels: 4,
              background: { r: 34, g: 197, b: 94, alpha: 1 } },  // #22c55e
  })
    .composite([{ input: innerBuf, top: padding, left: padding }])
    .png({ quality: 95 })
    .toBuffer()
  writeFileSync(path.join(OUT_DIR, name), buf)
  console.log(`  ✓ icons/${name} (safe zone ${padding}px)`)
}

// ── Copia icon-192/512 para raiz (compatibilidade) ───────────────────────────
import { copyFileSync } from 'node:fs'
copyFileSync(path.join(OUT_DIR, 'icon-192.png'), path.join(ROOT, 'public', 'icon-192.png'))
copyFileSync(path.join(OUT_DIR, 'icon-512.png'), path.join(ROOT, 'public', 'icon-512.png'))
console.log('  ✓ public/icon-192.png e icon-512.png atualizados')

// ── favicon.ico (16 + 32, RGBA para Turbopack) ───────────────────────────────
console.log('→ Gerando favicon.ico…')
const png16 = await makePng(16)
const png32 = await makePng(32)

const headerSize = 6, entrySize = 16, dataOffset = headerSize + 2 * entrySize

const header = Buffer.alloc(headerSize)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(2, 4)

const e16 = Buffer.alloc(entrySize)
e16.writeUInt8(16,0); e16.writeUInt8(16,1); e16.writeUInt8(0,2); e16.writeUInt8(0,3)
e16.writeUInt16LE(1,4); e16.writeUInt16LE(32,6)
e16.writeUInt32LE(png16.length, 8); e16.writeUInt32LE(dataOffset, 12)

const e32 = Buffer.alloc(entrySize)
e32.writeUInt8(32,0); e32.writeUInt8(32,1); e32.writeUInt8(0,2); e32.writeUInt8(0,3)
e32.writeUInt16LE(1,4); e32.writeUInt16LE(32,6)
e32.writeUInt32LE(png32.length, 8); e32.writeUInt32LE(dataOffset + png16.length, 12)

const ico = Buffer.concat([header, e16, e32, png16, png32])
writeFileSync(path.join(ROOT, 'app', 'favicon.ico'), ico)
console.log(`  ✓ app/favicon.ico (${ico.length} bytes)`)

console.log('\n✓ Todos os ícones gerados com identidade StockDan (verde + cubo branco)')
