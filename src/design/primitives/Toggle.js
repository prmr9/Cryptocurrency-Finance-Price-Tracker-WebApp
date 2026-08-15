/**
 * Toggle — labelled on/off switch (role=switch). Consumes ONLY design tokens.
 * 32-36px control. Contract: C18 (KAN-73).
 */
import React, { useState } from 'react'
import tokens from '../tokens'

/**
 * @param {{ id: string, label: string, checked?: boolean, onChange?: Function }} props
 */
function Toggle({ id, label, checked = false, onChange }) {
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

  const trackStyle = {
    position: 'relative',
    width: '52px',
    height: tokens.spacing.control,
    padding: 0,
    background: checked ? tokens.accent : tokens.neutral.surface2,
    border: `1px solid ${tokens.neutral.border}`,
    borderRadius: tokens.radii.pill,
    cursor: 'pointer',
    transition: `background ${tokens.motion.durations.fast} ${tokens.motion.easings.standard}`,
    ...(focused ? tokens.focusRing : null),
  }

  const knobStyle = {
    position: 'absolute',
    top: '3px',
    left: checked ? '22px' : '3px',
    width: '26px',
    height: '26px',
    background: checked ? tokens.semantics.onAccent : tokens.neutral.textMuted,
    borderRadius: tokens.radii.pill,
    transition: `left ${tokens.motion.durations.fast} ${tokens.motion.easings.standard}`,
  }

  return (
    <label htmlFor={id} style={rowStyle}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        style={trackStyle}
        onClick={() => onChange && onChange(!checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span style={knobStyle} />
      </button>
      {label}
    </label>
  )
}

export default Toggle
