/**
 * Tag — removable chip. Consumes ONLY design tokens. When removable it exposes
 * an accessible remove control (32-36px). Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import tokens from '../tokens'

/**
 * @param {{ children?: React.ReactNode, onRemove?: Function, label?: string }} props
 */
function Tag({ children, onRemove, label }) {
  const [focused, setFocused] = useState(false)

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.caption,
    color: tokens.semantics.text,
    background: tokens.neutral.surface2,
    border: `1px solid ${tokens.neutral.border}`,
    borderRadius: tokens.radii.pill,
  }

  const removeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.spacing.control,
    width: tokens.spacing.control,
    color: tokens.semantics.textMuted,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    ...(focused ? tokens.focusRing : null),
  }

  return (
    <span style={style}>
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={label ? `Remove ${label}` : 'Remove'}
          style={removeStyle}
          onClick={() => onRemove()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <FaTimes aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

export default Tag
