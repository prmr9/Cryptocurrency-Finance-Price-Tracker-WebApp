/**
 * Design tokens — the whole design law for the crypto/finance price tracker.
 *
 * Contract: C17 (KAN-73). Plain-JS + JSDoc module (no TypeScript, no build
 * step). This is the canonical, machine-inspectable source of design truth.
 * The live values are still the CSS custom properties in `src/index.css`;
 * convergence (rewiring the CSS onto these tokens) is downstream (Phase 2).
 *
 * Invariants enforced by `src/design/__tests__/tokens.test.js`:
 *  - polarity is 'dark-first' (see docs/design/polarity-decision.md).
 *  - the accent is a single FLAT color string — it replaces the former
 *    `--gradient-accent` (a linear-gradient) with the flat accent #ff37c7.
 *  - NO gradient anywhere; NO pure black (#000) or pure white (#fff).
 *  - `semantics.onAccent` is a non-pure-black neutral with WCAG-AA contrast
 *    (>= 4.5:1) against the accent.
 *
 * Values are sourced from `src/index.css` `:root`.
 */

/**
 * Recorded dark-vs-light polarity. Mirrors docs/design/polarity-decision.md.
 * @type {'dark-first'}
 */
const polarity = 'dark-first'

/**
 * Type family. Rubik is the app's shipped face (loaded in index.css).
 * @type {{ fontFamily: string, mono: string }}
 */
const type = {
  fontFamily: "'Rubik', system-ui, 'Segoe UI', sans-serif",
  mono: "source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace",
}

/**
 * Modular type-size scale (rem, 16px base). caption -> display.
 * @type {{ caption: string, body: string, title: string, heading: string, display: string }}
 */
const scale = {
  caption: '0.75rem', // 12px
  body: '1rem', // 16px
  title: '1.25rem', // 20px
  heading: '1.5rem', // 24px
  display: '2rem', // 32px
}

/**
 * Font weights. regular / medium / bold.
 * @type {{ regular: number, medium: number, bold: number }}
 */
const weights = {
  regular: 400,
  medium: 500,
  bold: 700,
}

/**
 * 4px-based spacing ramp. Keys are step numbers; values are px strings.
 * xs (4) -> xxl (32). Interactive controls draw their 32-36px min-height
 * from `control`.
 * @type {{ xs: string, sm: string, md: string, lg: string, xl: string, xxl: string, control: string }}
 */
const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  control: '34px', // control min-height; within the 32-36px band
}

/**
 * The single neutral ramp, authored dark-first: darkest background up to the
 * lightest text. NO pure black (#000) and NO pure white (#fff).
 * @type {{ bg: string, surface: string, surface2: string, border: string, textMuted: string, text: string }}
 */
const neutral = {
  bg: '#0d0d0f', // near-black background (not #000)
  surface: '#16161a',
  surface2: '#1f1f26',
  border: '#26262e',
  textMuted: '#9b9ba7',
  text: '#f5f5f7', // near-white text (not #fff)
}

/**
 * The FLAT accent — a single color string. This replaces the former
 * `--gradient-accent` linear-gradient used by the wordmark and Trade CTA.
 * @type {string}
 */
const accent = '#ff37c7'

/**
 * Supporting accent hue, kept as a solid color (never combined into a
 * gradient). Available for secondary emphasis.
 * @type {string}
 */
const accentAlt = '#8a4bff'

/**
 * Semantic roles. `onAccent` is the darkest neutral (NOT pure black), chosen
 * so text on the accent meets WCAG-AA (~6.1:1). positive/negative are the
 * 24h-change directions, tuned for the dark surface.
 * @type {{ positive: string, negative: string, text: string, textMuted: string, border: string, focus: string, onAccent: string }}
 */
const semantics = {
  positive: '#3ddc84',
  negative: '#ff5b5b',
  text: neutral.text,
  textMuted: neutral.textMuted,
  border: neutral.border,
  focus: accent,
  onAccent: neutral.bg, // #0d0d0f — AA-contrast on the flat accent
}

/**
 * Corner radii.
 * @type {{ pill: string, card: string }}
 */
const radii = {
  pill: '9999px',
  card: '20px',
}

/**
 * Elevation shadows. Built from a dark neutral (rgba), never pure black.
 * @type {{ subtle: string, card: string }}
 */
const shadows = {
  subtle: '0 1px 2px rgba(8, 8, 12, 0.4)',
  card: '0 8px 24px rgba(8, 8, 12, 0.5)',
}

/**
 * Motion durations and easings.
 * @type {{ durations: { fast: string, base: string, slow: string }, easings: { standard: string, emphasized: string } }}
 */
const motion = {
  durations: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
  },
  easings: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
  },
}

/**
 * Ready-to-spread focus-ring style, derived from the accent. Primitives apply
 * this on keyboard/focus state so the ring is consistent everywhere.
 * @type {{ outline: string, outlineOffset: string, boxShadow: string }}
 */
const focusRing = {
  outline: `2px solid ${accent}`,
  outlineOffset: '2px',
  boxShadow: `0 0 0 4px rgba(255, 55, 199, 0.35)`,
}

/**
 * @typedef {Object} DesignTokens
 * @property {'dark-first'} polarity
 * @property {typeof type} type
 * @property {typeof scale} scale
 * @property {typeof weights} weights
 * @property {typeof spacing} spacing
 * @property {typeof neutral} neutral
 * @property {string} accent
 * @property {string} accentAlt
 * @property {typeof semantics} semantics
 * @property {typeof radii} radii
 * @property {typeof shadows} shadows
 * @property {typeof motion} motion
 * @property {typeof focusRing} focusRing
 */

/** @type {DesignTokens} */
const tokens = {
  polarity,
  type,
  scale,
  weights,
  spacing,
  neutral,
  accent,
  accentAlt,
  semantics,
  radii,
  shadows,
  motion,
  focusRing,
}

export {
  polarity,
  type,
  scale,
  weights,
  spacing,
  neutral,
  accent,
  accentAlt,
  semantics,
  radii,
  shadows,
  motion,
  focusRing,
}

export default tokens
