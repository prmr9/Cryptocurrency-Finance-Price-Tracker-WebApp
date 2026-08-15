/**
 * KAN-73 — automated guard for the primitive set (C18).
 *
 * Asserts: the barrel exports exactly the 15 primitives Button…ErrorState, each
 * has a source file, every primitive imports from '../tokens' and NONE import
 * from src/api/* or hooks, icon-bearing primitives use the react-icons `fa`
 * set, interactive controls render a 32-36px min-height, and react-icons is
 * still a declared dependency (no new dependency added).
 */
const fs = require('fs')
const path = require('path')
const React = require('react')
const { render } = require('@testing-library/react')

const PRIMS_DIR = path.resolve(__dirname, '..', 'primitives')
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

const EXPECTED = [
  'Button',
  'IconButton',
  'Input',
  'Select',
  'Checkbox',
  'Radio',
  'Toggle',
  'Badge',
  'Tag',
  'Card',
  'Spinner',
  'Skeleton',
  'Tooltip',
  'EmptyState',
  'ErrorState',
]

const barrel = require('../primitives')

describe('src/design/primitives — the 15-primitive set (C18)', () => {
  it('exports exactly the 15 primitives Button…ErrorState from the barrel', () => {
    const exported = Object.keys(barrel)
    // The set is exactly the 15 named primitives (barrel key order is not
    // guaranteed by the transpiler, so compare as sorted sets).
    expect([...exported].sort()).toEqual([...EXPECTED].sort())
    expect(exported).toHaveLength(15)
    // Button through ErrorState — both endpoints are present and callable.
    expect(barrel.Button).toBeDefined()
    expect(barrel.ErrorState).toBeDefined()
  })

  it('has a source file for each primitive', () => {
    for (const name of EXPECTED) {
      expect(fs.existsSync(path.join(PRIMS_DIR, `${name}.js`))).toBe(true)
    }
  })

  it('every primitive imports from ../tokens and NONE import from api/hooks', () => {
    for (const name of EXPECTED) {
      const src = fs.readFileSync(path.join(PRIMS_DIR, `${name}.js`), 'utf8')
      expect(src).toMatch(/from '\.\.\/tokens'/)
      // Import purity: no api, no hooks, no global CSS.
      expect(src).not.toMatch(/from ['"].*\/api\//)
      expect(src).not.toMatch(/from ['"].*hooks/)
      expect(src).not.toMatch(/import ['"].*\.css['"]/)
    }
  })

  it('icon-bearing primitives use the react-icons `fa` set only', () => {
    for (const name of ['IconButton', 'Tag', 'Spinner', 'EmptyState', 'ErrorState']) {
      const src = fs.readFileSync(path.join(PRIMS_DIR, `${name}.js`), 'utf8')
      expect(src).toMatch(/from 'react-icons\/fa'/)
    }
    // No non-fa react-icons set is pulled in anywhere.
    for (const name of EXPECTED) {
      const src = fs.readFileSync(path.join(PRIMS_DIR, `${name}.js`), 'utf8')
      const iconImports = src.match(/from 'react-icons\/(\w+)'/g) || []
      for (const imp of iconImports) {
        expect(imp).toBe("from 'react-icons/fa'")
      }
    }
  })

  it('interactive controls render a 32-36px min-height', () => {
    const { container: buttonContainer } = render(
      React.createElement(barrel.Button, null, 'Go')
    )
    const btn = buttonContainer.querySelector('button')
    const minH = parseInt(btn.style.minHeight, 10)
    expect(minH).toBeGreaterThanOrEqual(32)
    expect(minH).toBeLessThanOrEqual(36)

    const { container: iconContainer } = render(
      React.createElement(barrel.IconButton, { label: 'Close' })
    )
    const iconBtn = iconContainer.querySelector('button')
    expect(iconBtn.getAttribute('aria-label')).toBe('Close')
    const iconMinH = parseInt(iconBtn.style.minHeight, 10)
    expect(iconMinH).toBeGreaterThanOrEqual(32)
    expect(iconMinH).toBeLessThanOrEqual(36)
  })

  it('keeps react-icons as a declared dependency (no new dependency added)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
    expect(pkg.dependencies['react-icons']).toBeDefined()
  })
})
