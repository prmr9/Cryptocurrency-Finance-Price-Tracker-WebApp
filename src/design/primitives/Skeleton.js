/**
 * Skeleton — placeholder block for loading content. Consumes ONLY design
 * tokens. Non-interactive; hidden from the accessibility tree. Contract: C18.
 */
import React from 'react'
import tokens from '../tokens'

/**
 * @param {{ width?: string, height?: string, radius?: string }} props
 */
function Skeleton({ width = '100%', height = tokens.spacing.lg, radius = tokens.radii.card }) {
  const style = {
    display: 'block',
    width,
    height,
    background: tokens.neutral.surface2,
    borderRadius: radius,
    opacity: 0.6,
  }

  return <span aria-hidden="true" style={style} />
}

export default Skeleton
