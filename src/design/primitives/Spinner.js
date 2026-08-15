/**
 * Spinner — busy indicator with an accessible label. Consumes ONLY design
 * tokens; uses the react-icons `fa` set. Contract: C18 (KAN-73).
 */
import React from 'react'
import { FaSpinner } from 'react-icons/fa'
import tokens from '../tokens'

/**
 * @param {{ label?: string }} props
 */
function Spinner({ label = 'Loading' }) {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    color: tokens.accent,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.body,
  }

  return (
    <span role="status" aria-live="polite" style={style}>
      <FaSpinner aria-hidden="true" />
      <span style={{ color: tokens.semantics.textMuted }}>{label}</span>
    </span>
  )
}

export default Spinner
