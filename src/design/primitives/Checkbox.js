/**
 * Checkbox — labelled boolean control. Consumes ONLY design tokens.
 * Control (label row) sits within 32-36px. Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import tokens from '../tokens'

/**
 * @param {{ id: string, label: string, checked?: boolean, onChange?: Function }} props
 */
function Checkbox({ id, label, ...rest }) {
  const [focused, setFocused] = useState(false)

  const rowStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: tokens.spacing.control,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.body,
    color: tokens.semantics.text,
  }

  const boxStyle = {
    width: tokens.spacing.lg,
    height: tokens.spacing.lg,
    accentColor: tokens.accent,
    ...(focused ? tokens.focusRing : null),
  }

  return (
    <label htmlFor={id} style={rowStyle}>
      <input
        id={id}
        type="checkbox"
        style={boxStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {label}
    </label>
  )
}

export default Checkbox
