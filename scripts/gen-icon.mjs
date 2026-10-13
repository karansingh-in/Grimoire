// Generates the Grimoire launcher icon: a minimal flat notebook mark.
// Pure Node, no dependencies. Re-run with: node scripts/gen-icon.mjs
import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "android", "app", "src", "main", "res")

const BG = [11, 11, 13, 255]
const PAPER = [245, 245, 247, 255]
const CLEAR = [0, 0, 0, 0]

// Note card: x 196-316, y 140-372, corner radius 28.
// Text bars (transparent cutouts): x 218-294, h 9, at y 196 / 234 / 272.
function inCard(x, y) {
  if (x < 196 || x >= 316 || y < 140 || y >= 372) return false
  const r = 28
  const cx = x < 196 + r ? 196 + r : x >= 316 - r ? 316 - r - 1 : -1
  const cy = y < 140 + r ? 140 + r : y >= 372 - r ? 372 - r - 1 : -1
  if (cx >= 0 && cy >= 0) {
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
  }
  return true
}

function inBar(x, y) {
  if (x < 218 || x >= 294) return false
  return (
    (y >= 196 && y < 205) || (y >= 234 && y < 243) || (y >= 272 && y < 281)
  )
}

function render(size, foregroundOnly) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const fx = ((px + 0.5) * 512) / size
      const fy = ((py + 0.5) * 512) / size
      let color
      if (inCard(fx, fy) && !inBar(fx, fy)) color = PAPER
      else if (foregroundOnly) color = CLEAR
      else color = BG
      const offset = (py * size + px) * 4
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
      pixels[offset + 3] = color[3]
    }
  }
  return pixels
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, foregroundOnly) {
  const pixels = render(size, foregroundOnly)
  const rows = []
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [density, size] of Object.entries(densities)) {
  const dir = join(root, `mipmap-${density}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "ic_launcher.png"), png(size, false))
  writeFileSync(join(dir, "ic_launcher_round.png"), png(size, false))
  writeFileSync(join(dir, "ic_launcher_foreground.png"), png(size, true))
}

console.log("Launcher icons written.")
