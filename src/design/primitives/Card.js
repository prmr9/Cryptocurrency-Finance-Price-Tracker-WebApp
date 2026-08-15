/**
 * Card — elevated surface container. Consumes ONLY design tokens.
 * Non-interactive. Contract: C18 (KAN-73).
 */
import React from 'react'
import tokens from '../tokens'

/**
 * @param {{ children?: React.ReactNode }} props
 */
function Card({ children }) {
  const style = {
    padding: tokens.spacing.xl,
    background: tokens.neutral.surface,
    border: `1px solid ${tokens.neutral.border}`,
    borderRadius: tokens.radii.card,
    boxShadow: tokens.shadows.card,
    color: tokens.semantics.text,
    fontFamily: tokens.type.fontFamily,
  }

  return <div style={style}>{children}</div>
}

export default Card
