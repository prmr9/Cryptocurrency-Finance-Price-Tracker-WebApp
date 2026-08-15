/**
 * Input — labelled text field. Consumes ONLY design tokens. 32-36px control.
 * Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import tokens from '../tokens'

/**
 * @param {{ id: string, label: string, value?: string, onChange?: Function, type?: string, placeholder?: string }} props
 */
function Input({ id, label, type = 'text', ...rest }) {
  const [focused, setFocused] = useState(false)

  const labelStyle = {
    display: 'block',
    marginBottom: tokens.spacing.xs,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.caption,
    fontWeight: tokens.weights.medium,
    color: tokens.semantics.textMuted,
  }

  const inputStyle = {
    minHeight: tokens.spacing.control,
    width: '100%',
    padding: `0 ${tokens.spacing.md}`,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.body,
    color: tokens.semantics.text,
    background: tokens.neutral.surface,
    border: `1px solid ${tokens.neutral.border}`,
    borderRadius: tokens.radii.card,
    ...(focused ? tokens.focusRing : null),
  }

  return (
    <span>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        style={inputStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
    </span>
  )
}

export default Input
