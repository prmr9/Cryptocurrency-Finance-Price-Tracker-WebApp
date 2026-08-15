/**
 * IconButton — square icon-only control. Requires an accessible label.
 * Consumes ONLY design tokens. 32-36px control. Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import { FaRegCircle } from 'react-icons/fa'
import tokens from '../tokens'

/**
 * @param {{ icon?: React.ComponentType, label: string, onClick?: Function, disabled?: boolean }} props
 */
function IconButton({ icon: Icon = FaRegCircle, label, disabled = false, ...rest }) {
  const [focused, setFocused] = useState(false)

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: tokens.spacing.control,
    height: tokens.spacing.control,
    minHeight: tokens.spacing.control,
    color: tokens.semantics.text,
    background: tokens.neutral.surface,
    border: `1px solid ${tokens.neutral.border}`,
    borderRadius: tokens.radii.pill,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    ...(focused ? tokens.focusRing : null),
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      style={style}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...rest}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

export default IconButton
