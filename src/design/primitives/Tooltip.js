/**
 * Tooltip — hover/focus label for its child. Consumes ONLY design tokens.
 * The trigger stays keyboard-focusable and reveals the tip. Contract: C18.
 */
import React, { useState } from 'react'
import tokens from '../tokens'

/**
 * @param {{ children?: React.ReactNode, label: string }} props
 */
function Tooltip({ children, label }) {
  const [open, setOpen] = useState(false)

  const wrapStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  }

  const tipStyle = {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: tokens.spacing.xs,
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    fontFamily: tokens.type.fontFamily,
    fontSize: tokens.scale.caption,
    color: tokens.semantics.text,
    background: tokens.neutral.surface2,
    border: `1px solid ${tokens.neutral.border}`,
    borderRadius: tokens.radii.card,
    boxShadow: tokens.shadows.subtle,
    whiteSpace: 'nowrap',
  }

  return (
    <span
      style={wrapStyle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby="tooltip-tip">{children}</span>
      {open ? (
        <span role="tooltip" id="tooltip-tip" style={tipStyle}>
          {label}
        </span>
      ) : null}
    </span>
  )
}

export default Tooltip
