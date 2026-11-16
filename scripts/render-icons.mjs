// Régénère les icônes PNG de l'app à partir de la source vectorielle public/icon.svg.
//
//   node scripts/render-icons.mjs [source.svg] [dossier-de-sortie]
//
// Par défaut : public/icon.svg -> public/. Rendu par Chromium (Playwright), puis
// réencodage en PNG RGB sans canal alpha : iOS remplace la transparence par du noir,
// donc les icônes doivent être opaques. Pas de coins arrondis dans les fichiers :
// iOS et Android appliquent leur propre masque.
//
// La version « maskable » (Android) garde le fond #fond jusqu'aux bords et réduit le
// groupe #motif pour qu'il tienne dans le cercle central de 80 % (zone sûre).
//
// Playwright n'est pas une dépendance du projet : il est pris s'il est installé
// (localement ou globalement). Sinon : npm i -D playwright && npx playwright install chromium
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(process.argv[2] ?? path.join(root, 'public/icon.svg'))
const outDir = path.resolve(process.argv[3] ?? path.join(root, 'public'))

/** Réduction du #motif pour la version maskable (rayon utile ≤ 40 % du côté). */
const MASKABLE_SCALE = 0.88

const TARGETS = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
]

async function loadChromium() {
  try {
    return (await import('playwright')).chromium
  } catch {
    // Pas trouvé en import ESM : on essaie la résolution CommonJS (NODE_PATH, global).
  }
  try {
    return createRequire(import.meta.url)('playwright').chromium
  } catch {
    console.error('Playwright est introuvable. Installe-le : npm i -D playwright && npx playwright install chromium')
    process.exit(1)
  }
}

// ---------------------------------------------------------------- PNG (lecture / écriture)

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, crc])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Décode un PNG 8 bits RGB ou RGBA non entrelacé (ce que produit Chromium). */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('pas un PNG')
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const depth = data[8]
      colorType = data[9]
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) {
        throw new Error(`PNG non pris en charge (profondeur ${depth}, type ${colorType})`)
      }
    } else if (type === 'IDAT') idat.push(data)
    off += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0
      const b = y > 0 ? px[row - stride + x] : 0
      const c = x >= bpp && y > 0 ? px[row - stride + x - bpp] : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
      px[row + x] = (line[x] + pred) & 0xff
    }
  }
  return { width, height, channels: bpp, px }
}

/** Encode des pixels RGB en PNG (filtre choisi ligne par ligne). */
function encodeRgbPng(width, height, rgb) {
  const stride = width * 3
  const rows = []
  for (let y = 0; y < height; y++) {
    let best = null
    let bestScore = Infinity
    for (let filter = 0; filter < 5; filter++) {
      const line = Buffer.alloc(stride + 1)
      line[0] = filter
      let score = 0
      for (let x = 0; x < stride; x++) {
        const i = y * stride + x
        const a = x >= 3 ? rgb[i - 3] : 0
        const b = y > 0 ? rgb[i - stride] : 0
        const c = x >= 3 && y > 0 ? rgb[i - stride - 3] : 0
        const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
        const v = (rgb[i] - pred) & 0xff
        line[x + 1] = v
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) {
        bestScore = score
        best = line
      }
    }
    rows.push(best)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 bits par canal
  ihdr[9] = 2 // RGB, pas d'alpha
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** RGBA -> RGB, en refusant tout pixel qui ne serait pas parfaitement opaque. */
function toOpaqueRgb({ width, height, channels, px }, label) {
  if (channels === 3) return px
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    if (px[i + 3] !== 255) {
      const n = i / 4
      throw new Error(`${label} : pixel transparent en (${n % width}, ${Math.floor(n / width)})`)
    }
    rgb[j] = px[i]
    rgb[j + 1] = px[i + 1]
    rgb[j + 2] = px[i + 2]
  }
  return rgb
}

// ---------------------------------------------------------------- Rendu

const svg = await readFile(source, 'utf8')
if (!svg.includes('id="motif"')) throw new Error(`${source} : groupe id="motif" introuvable (nécessaire pour la version maskable)`)

const chromium = await loadChromium()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const target of TARGETS) {
    const { size } = target
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<!doctype html><html><head><style>
        html, body { margin: 0; padding: 0; overflow: hidden; background: #FFF4E6; }
        svg { display: block; width: ${size}px; height: ${size}px; }
      </style></head><body>${svg}</body></html>`,
    )
    if (target.maskable) {
      await page.evaluate((scale) => {
        document.getElementById('motif').setAttribute('transform', `translate(512 512) scale(${scale}) translate(-512 -512)`)
      }, MASKABLE_SCALE)
    }
    const shot = await page.screenshot({ type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } })
    const decoded = decodePng(shot)
    if (decoded.width !== size || decoded.height !== size) {
      throw new Error(`${target.file} : rendu en ${decoded.width}×${decoded.height} au lieu de ${size}×${size}`)
    }
    const png = encodeRgbPng(size, size, toOpaqueRgb(decoded, target.file))
    const dest = path.join(outDir, target.file)
    await writeFile(dest, png)

    // Relecture du fichier écrit : bonne taille, RGB sans alpha.
    const check = decodePng(await readFile(dest))
    if (check.width !== size || check.height !== size || check.channels !== 3) throw new Error(`${dest} : vérification échouée`)
    console.log(`${target.file.padEnd(24)} ${size}×${size}  RGB opaque  ${(png.length / 1024).toFixed(1)} Ko`)
  }
} finally {
  await browser.close()
}
