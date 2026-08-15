/**
 * Select — labelled dropdown. Consumes ONLY design tokens. 32-36px control.
 * Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import tokens from '../tokens'

/**
 * @param {{ id: string, label: string, value?: string, onChange?: Function, options?: Array<{value: string, label: string}>, children?: React.ReactNode }} props
 */
function Select({ id, label, options, children, ...rest }) {
  const [focused, setFocused] = useState(false)

  const labelStyle = {
    display: 'block',
    marginBottom: tokens.spacing.xs,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.caption,
    fontWeight: tokens.weights.medium,
    color: tokens.semantics.textMuted,
  }

  const selectStyle = {
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
      <select
        id={id}
        style={selectStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
    </span>
  )
}

export default Select
