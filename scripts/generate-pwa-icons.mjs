/**
 * Gera ícones PWA a partir de public/icon-512.png.
 *
 * - "any" icons: a logo como está (fundo #030712, que é o bg real do app)
 * - "maskable" icons: logo centralizada com safe zone de 10% para que
 *   adaptive icons do Android (squircle/círculo) não cortem nada,
 *   sobre fundo brand #030712.
 * - apple-touch-icon: 180×180 com fundo sólido (iOS não aceita transparência)
 *
 * Rode: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__dirname, '..');
const SRC     = path.join(ROOT, 'public', 'icon-512.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

if (!existsSync(SRC)) {
  console.error(`✗ Source não encontrado: ${SRC}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

// Cor de fundo do app (gray-950) — o ícone já usa essa cor
const BRAND_BG = { r: 3, g: 7, b: 18, alpha: 1 };   // #030712

// ── Any icons ───────────────────────────────────────────────────────────────

const ANY_SIZES = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32,  name: 'favicon-32.png' },
  { size: 16,  name: 'favicon-16.png' },
];

console.log('→ Gerando ícones "any"…');
for (const { size, name } of ANY_SIZES) {
  await sharp(SRC)
    .resize(size, size, { fit: 'cover', background: BRAND_BG })
    .png({ quality: 95 })
    .toFile(path.join(OUT_DIR, name));
  console.log(`  ✓ icons/${name}`);
}

// ── Maskable icons (safe zone 10% = logo ocupa 80% do quadrado) ─────────────

const MASKABLE_SIZES = [
  { size: 192, name: 'icon-192-maskable.png' },
  { size: 512, name: 'icon-512-maskable.png' },
];

console.log('→ Gerando ícones "maskable"…');
for (const { size, name } of MASKABLE_SIZES) {
  const inner   = Math.round(size * 0.80);  // logo ocupa 80% → safe zone OK
  const padding = Math.round((size - inner) / 2);

  // Resize do logo para caber no inner area
  const logoBuf = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: BRAND_BG })
    .png()
    .toBuffer();

  // Composita sobre fundo brand sólido no tamanho final
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_BG },
  })
    .composite([{ input: logoBuf, top: padding, left: padding }])
    .png({ quality: 95 })
    .toFile(path.join(OUT_DIR, name));

  console.log(`  ✓ icons/${name} (maskable, safe zone ${Math.round((size - inner) / 2)}px)`);
}

// ── Copia também para raiz de public (compat. com referências antigas) ───────
console.log('→ Copiando compat. para public/…');
import { copyFile } from 'node:fs/promises';
await copyFile(path.join(OUT_DIR, 'icon-192.png'), path.join(ROOT, 'public', 'icon-192.png'));
await copyFile(path.join(OUT_DIR, 'icon-512.png'), path.join(ROOT, 'public', 'icon-512.png'));
console.log('  ✓ public/icon-192.png, public/icon-512.png atualizados');

console.log('\n✓ Pronto! Todos os ícones gerados em public/icons/');
