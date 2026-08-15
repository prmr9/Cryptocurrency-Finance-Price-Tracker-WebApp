/**
 * ErrorState — failure panel with an optional retry control. Consumes ONLY
 * design tokens; uses the react-icons `fa` set. Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import { FaExclamationTriangle } from 'react-icons/fa'
import tokens from '../tokens'

/**
 * @param {{ title?: string, message?: string, onRetry?: Function }} props
 */
function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  const [focused, setFocused] = useState(false)

  const style = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xxl,
    textAlign: 'center',
    fontFamily: tokens.type.fontFamily,
    color: tokens.semantics.text,
  }

  const retryStyle = {
    minHeight: tokens.spacing.control,
    padding: `0 ${tokens.spacing.lg}`,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.body,
    fontWeight: tokens.weights.medium,
    color: tokens.semantics.onAccent,
    background: tokens.accent,
    border: 'none',
    borderRadius: tokens.radii.pill,
    cursor: 'pointer',
    ...(focused ? tokens.focusRing : null),
  }

  return (
    <div role="alert" style={style}>
      <FaExclamationTriangle aria-hidden="true" size={32} color={tokens.semantics.negative} />
      <p style={{ fontWeight: tokens.weights.medium }}>{title}</p>
      {message ? (
        <p style={{ fontSize: tokens.scale.caption, color: tokens.semantics.textMuted }}>{message}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          style={retryStyle}
          onClick={() => onRetry()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}

export default ErrorState
