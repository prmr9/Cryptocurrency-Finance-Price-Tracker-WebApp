/**
 * KAN-73 — automated guard for the design-token law (C17).
 *
 * Asserts the token module encodes the whole design law, is dark-first, uses a
 * FLAT accent (not a gradient), contains NO gradient and NO pure black/white,
 * and that on-accent text meets WCAG-AA contrast (>= 4.5:1). It also confirms
 * the polarity-decision doc records the explicit dark-first default so C16's
 * doc and the code's `polarity` field stay in lockstep.
 */
const fs = require('fs')
const path = require('path')
const tokens = require('../tokens').default

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const POLARITY_DOC = path.join(REPO_ROOT, 'docs', 'design', 'polarity-decision.md')

/** WCAG relative luminance for an sRGB hex color. */
function luminance(hex) {
  const m = hex.replace('#', '')
  const rgb = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255)
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

describe('src/design/tokens.js — design law (C17)', () => {
  it('encodes every required group of the design law', () => {
    for (const group of [
      'type',
      'scale',
      'weights',
      'spacing',
      'neutral',
      'accent',
      'semantics',
      'radii',
      'shadows',
      'motion',
    ]) {
      expect(tokens[group]).toBeDefined()
    }
  })

  it('is dark-first (mirrors the polarity-decision doc)', () => {
    expect(tokens.polarity).toBe('dark-first')
  })

  it('records the same dark-first decision in docs/design/polarity-decision.md', () => {
    expect(fs.existsSync(POLARITY_DOC)).toBe(true)
    const doc = fs.readFileSync(POLARITY_DOC, 'utf8')
    expect(doc).toMatch(/dark-first/)
    // Explicit dark-vs-light polarity language present.
    expect(doc).toMatch(/dark-vs-light/i)
  })

  it('uses a single FLAT accent equal to #ff37c7 (not a gradient)', () => {
    expect(typeof tokens.accent).toBe('string')
    expect(tokens.accent).toBe('#ff37c7')
  })

  it('contains NO gradient anywhere', () => {
    const blob = JSON.stringify(tokens)
    expect(blob).not.toMatch(/gradient/i)
  })

  it('contains NO pure black and NO pure white', () => {
    const blob = JSON.stringify(tokens)
    expect(blob).not.toMatch(/#fff\b/i)
    expect(blob).not.toMatch(/#ffffff\b/i)
    expect(blob).not.toMatch(/#000\b/i)
    expect(blob).not.toMatch(/#000000\b/i)
    expect(blob).not.toMatch(/rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i)
    expect(blob).not.toMatch(/rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i)
  })

  it('has a neutral ramp, positive/negative semantics, radii, shadows, motion', () => {
    expect(tokens.neutral.bg).toBeDefined()
    expect(tokens.neutral.text).toBeDefined()
    expect(tokens.semantics.positive).toBeDefined()
    expect(tokens.semantics.negative).toBeDefined()
    expect(tokens.radii.pill).toBeDefined()
    expect(tokens.shadows.subtle).toBeDefined()
    expect(tokens.motion.durations).toBeDefined()
  })

  it('on-accent text meets WCAG-AA contrast and is a non-pure-black neutral', () => {
    expect(tokens.semantics.onAccent).not.toBe('#000')
    expect(tokens.semantics.onAccent).not.toBe('#000000')
    const ratio = contrastRatio(tokens.semantics.onAccent, tokens.accent)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})
