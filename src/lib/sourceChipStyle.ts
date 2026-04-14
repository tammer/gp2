/** Deterministic hash for stable colors per source name. */
function hashString(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(31, h) + input.charCodeAt(i)
  }
  return h >>> 0
}

function hslToRgb(h360: number, sPct: number, lPct: number): [number, number, number] {
  const h = h360 / 360
  const s = sPct / 100
  const l = lPct / 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hue2rgb(p, q, h + 1 / 3)
  const g = hue2rgb(p, q, h)
  const b = hue2rgb(p, q, h - 1 / 3)
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

const CHIP_TEXT_COLOR = '#ffffff'

/**
 * Background from hashed hue + bounded S/L; label text is always white.
 * Lightness is capped so chips stay dark enough for white text (roughly mid-20s–high-30s %).
 */
export function getSourceChipColors(source: string): {
  backgroundColor: string
  color: string
} {
  const seed = hashString(source.trim() || '\0')
  const hue = seed % 360
  const sat = 48 + ((seed >>> 8) % 30)
  // HSL lightness % — keep below ~40% so backgrounds never read as “pastel” / too light.
  const light = 24 + ((seed >>> 16) % 14)
  const [r, g, b] = hslToRgb(hue, sat, light)
  return {
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
    color: CHIP_TEXT_COLOR,
  }
}
