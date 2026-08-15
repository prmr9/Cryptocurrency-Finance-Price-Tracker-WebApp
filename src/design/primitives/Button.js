/**
 * Button — primary interactive control. Consumes ONLY design tokens.
 * Flat accent fill with AA-contrast on-accent text; 32-36px min-height.
 * Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import tokens from '../tokens'

/**
 * @param {{ children?: React.ReactNode, icon?: React.ComponentType, onClick?: Function, type?: string, disabled?: boolean, 'aria-label'?: string }} props
 */
function Button({ children, icon: Icon, type = 'button', disabled = false, ...rest }) {
  const [focused, setFocused] = useState(false)

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    minHeight: tokens.spacing.control,
    padding: `0 ${tokens.spacing.lg}`,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.body,
    fontWeight: tokens.weights.medium,
    color: tokens.semantics.onAccent,
    background: tokens.accent,
    border: 'none',
    borderRadius: tokens.radii.pill,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `background ${tokens.motion.durations.fast} ${tokens.motion.easings.standard}`,
    ...(focused ? tokens.focusRing : null),
  }

  return (
    <button
      type={type}
      disabled={disabled}
      style={style}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export default Button
