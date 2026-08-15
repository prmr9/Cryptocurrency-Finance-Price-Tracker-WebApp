/**
 * Tests for the primitives barrel (src/design/primitives/index.js).
 * Contract C18 (KAN-73): the barrel MUST re-export exactly the 15-primitive
 * design set by name, so consumers can do
 *   `import { Button, Card, ErrorState } from 'src/design/primitives'`.
 *
 * The child modules (./Button, ./Card, …) are mocked so this suite proves the
 * WIRING of the barrel (names -> exports) in isolation, independent of each
 * primitive's own implementation/tests.
 */

// Mock every child module with a distinct sentinel so we can prove each named
// export is wired to the correct source module (guards against copy/paste typos
// like re-exporting ./EmptyState under the ErrorState name).
function mockPrimitive(name) {
  const Comp = () => null
  Comp.displayName = name
  return { __esModule: true, default: Comp }
}

jest.mock('./Button', () => mockPrimitive('Button'))
jest.mock('./IconButton', () => mockPrimitive('IconButton'))
jest.mock('./Input', () => mockPrimitive('Input'))
jest.mock('./Select', () => mockPrimitive('Select'))
jest.mock('./Checkbox', () => mockPrimitive('Checkbox'))
jest.mock('./Radio', () => mockPrimitive('Radio'))
jest.mock('./Toggle', () => mockPrimitive('Toggle'))
jest.mock('./Badge', () => mockPrimitive('Badge'))
jest.mock('./Tag', () => mockPrimitive('Tag'))
jest.mock('./Card', () => mockPrimitive('Card'))
jest.mock('./Spinner', () => mockPrimitive('Spinner'))
jest.mock('./Skeleton', () => mockPrimitive('Skeleton'))
jest.mock('./Tooltip', () => mockPrimitive('Tooltip'))
jest.mock('./EmptyState', () => mockPrimitive('EmptyState'))
jest.mock('./ErrorState', () => mockPrimitive('ErrorState'))

import * as primitives from './index'

// The canonical, ordered 15-primitive set (Button…ErrorState) per the contract.
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

describe('src/design/primitives barrel', () => {
  // Happy path: every documented primitive is exported by name.
  it.each(EXPECTED)('re-exports %s as a defined component', (name) => {
    expect(primitives[name]).toBeDefined()
    expect(typeof primitives[name]).toBe('function')
    expect(primitives[name].displayName).toBe(name)
  })

  // Edge case most likely to break a barrel: a name mapped to the wrong child
  // module (e.g. ErrorState accidentally pointing at EmptyState). Each export's
  // sentinel displayName must equal its own name — all 15 distinct.
  it('wires each export to its own source module (no cross-wiring)', () => {
    const wiredNames = EXPECTED.map((name) => primitives[name].displayName)
    expect(new Set(wiredNames).size).toBe(EXPECTED.length)
    expect(wiredNames).toEqual(EXPECTED)
  })

  // Contract is EXACTLY 15 primitives — no missing and no extra exports.
  it('exports exactly the 15-primitive set and nothing else', () => {
    const exported = Object.keys(primitives).filter((k) => k !== '__esModule')
    expect(exported.sort()).toEqual([...EXPECTED].sort())
    expect(exported).toHaveLength(15)
  })

  // Error path: the barrel is named-only. Undeclared names and a default import
  // must resolve to undefined, so typos fail loudly at the call site.
  it('does not expose a default export or undeclared names', () => {
    expect(primitives.default).toBeUndefined()
    expect(primitives.Modal).toBeUndefined()
    expect(primitives.errorState).toBeUndefined()
  })
})
