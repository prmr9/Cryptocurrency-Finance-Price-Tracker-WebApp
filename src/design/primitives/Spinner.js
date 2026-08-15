/**
 * Spinner — busy indicator with an accessible label. Consumes ONLY design
 * tokens; uses the react-icons `fa` set. Contract: C18 (KAN-73).
 */
import React, { useEffect, useRef } from 'react'
import { FaSpinner } from 'react-icons/fa'
import tokens from '../tokens'

/**
 * @param {{ label?: string }} props
 */
function Spinner({ label = 'Loading' }) {
  const iconRef = useRef(null)

  useEffect(() => {
    const node = iconRef.current
    if (!node || typeof node.animate !== 'function') return undefined
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return undefined
    const animation = node.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 900, iterations: Infinity, easing: 'linear' },
    )
    return () => animation.cancel()
  }, [])

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
      <span ref={iconRef} aria-hidden="true" style={{ display: 'inline-flex' }}>
        <FaSpinner />
      </span>
      <span style={{ color: tokens.semantics.textMuted }}>{label}</span>
    </span>
  )
}

export default Spinner
