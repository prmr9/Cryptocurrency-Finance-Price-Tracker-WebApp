/**
 * Badge — small status pill (accent / positive / negative / neutral).
 * Consumes ONLY design tokens. Non-interactive. Contract: C18 (KAN-73).
 */
import React from 'react'
import tokens from '../tokens'

/**
 * @param {{ children?: React.ReactNode, tone?: 'accent'|'positive'|'negative'|'neutral' }} props
 */
function Badge({ children, tone = 'neutral' }) {
  const backgrounds = {
    accent: tokens.accent,
    positive: tokens.semantics.positive,
    negative: tokens.semantics.negative,
    neutral: tokens.neutral.surface2,
  }
  const isFilled = tone !== 'neutral'

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.caption,
    fontWeight: tokens.weights.medium,
    color: isFilled ? tokens.semantics.onAccent : tokens.semantics.text,
    background: backgrounds[tone],
    borderRadius: tokens.radii.pill,
  }

  return <span style={style}>{children}</span>
}

export default Badge
