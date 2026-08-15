/**
 * EmptyState — friendly "nothing here yet" panel. Consumes ONLY design tokens;
 * uses the react-icons `fa` set. Contract: C18 (KAN-73).
 */
import React from 'react'
import { FaRegFolderOpen } from 'react-icons/fa'
import tokens from '../tokens'

/**
 * @param {{ title?: string, message?: string, icon?: React.ComponentType }} props
 */
function EmptyState({ title = 'Nothing here yet', message, icon: Icon = FaRegFolderOpen }) {
  const style = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xxl,
    textAlign: 'center',
    fontFamily: tokens.type.fontFamily,
    color: tokens.semantics.textMuted,
  }

  return (
    <div style={style}>
      <Icon aria-hidden="true" size={32} />
      <p style={{ color: tokens.semantics.text, fontWeight: tokens.weights.medium }}>{title}</p>
      {message ? <p style={{ fontSize: tokens.scale.caption }}>{message}</p> : null}
    </div>
  )
}

export default EmptyState
