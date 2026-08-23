// ============================================================================
//  Badge.jsx  —  Durum / Oncelik / Tip / DAL rozetleri.
//  constants.js icindeki stil eslemelerinden beslenir.
// ============================================================================
import {
  STATUS_STYLES,
  PRIORITY_STYLES,
  TYPE_STYLES,
  DAL_STYLES,
  CATEGORY_STYLES,
} from '../../utils/constants.js'

function Pill({ children, className = '' }) {
  return (
    <span
      className={
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ' +
        className
      }
    >
      {children}
    </span>
  )
}

export function StatusBadge({ value }) {
  return <Pill className={STATUS_STYLES[value] || ''}>{value}</Pill>
}

export function PriorityBadge({ value }) {
  return <Pill className={PRIORITY_STYLES[value] || ''}>{value}</Pill>
}

export function TypeBadge({ value }) {
  return <Pill className={TYPE_STYLES[value] || ''}>{value}</Pill>
}

export function CategoryBadge({ value }) {
  if (!value) return null
  return <Pill className={CATEGORY_STYLES[value] || CATEGORY_STYLES['Genel'] || ''}>{value}</Pill>
}

export function DalBadge({ value }) {
  return (
    <span
      className={
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ' +
        (DAL_STYLES[value] || '')
      }
      title="DO-178C Tasarim Guvence Seviyesi"
    >
      {value}
    </span>
  )
}

export default Pill
