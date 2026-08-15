/**
 * Barrel for the 15-primitive design set (Button…ErrorState). Consumers do
 * `import { Button, Card, ErrorState } from 'src/design/primitives'`.
 * Every primitive consumes ONLY ../tokens (and react-icons/fa for icons).
 * Contract: C18 (KAN-73).
 */
export { default as Button } from './Button'
export { default as IconButton } from './IconButton'
export { default as Input } from './Input'
export { default as Select } from './Select'
export { default as Checkbox } from './Checkbox'
export { default as Radio } from './Radio'
export { default as Toggle } from './Toggle'
export { default as Badge } from './Badge'
export { default as Tag } from './Tag'
export { default as Card } from './Card'
export { default as Spinner } from './Spinner'
export { default as Skeleton } from './Skeleton'
export { default as Tooltip } from './Tooltip'
export { default as EmptyState } from './EmptyState'
export { default as ErrorState } from './ErrorState'
