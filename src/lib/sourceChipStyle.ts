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

function channelToLinear(c: number): number {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(rgb: [number, number, number]): number {
  const r = channelToLinear(rgb[0])
  const g = channelToLinear(rgb[1])
  const b = channelToLinear(rgb[2])
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(lumText: number, lumBg: number): number {
  const L1 = Math.max(lumText, lumBg)
  const L2 = Math.min(lumText, lumBg)
  return (L1 + 0.05) / (L2 + 0.05)
}

const LUM_WHITE = 1
const LUM_BLACK = 0
const NEAR_WHITE = '#f4f6f8'
const NEAR_BLACK = '#0d1117'

/**
 * Background from hashed hue + bounded S/L; text is near-black or near-white
 * whichever yields higher WCAG-style contrast vs the background.
 */
export function getSourceChipColors(source: string): {
  backgroundColor: string
  color: string
} {
  const seed = hashString(source.trim() || '\0')
  const hue = seed % 360
  const sat = 48 + ((seed >>> 8) % 30)
  const light = 34 + ((seed >>> 16) % 24)

  const rgb = hslToRgb(hue, sat, light)
  const lumBg = relativeLuminance(rgb)

  const ratioWhite = contrastRatio(LUM_WHITE, lumBg)
  const ratioBlack = contrastRatio(lumBg, LUM_BLACK)
  const color = ratioBlack >= ratioWhite ? NEAR_BLACK : NEAR_WHITE

  const [r, g, b] = rgb
  return {
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
    color,
  }
}
