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

// Herhangi bir modular oznitelik degeri icin genel amacli rozet. `def.key`
// 'priority'/'dal_level' ise gorsel surekliligi korumak icin mevcut ozel
// stilleri (PRIORITY_STYLES/DAL_STYLES) kullanir; digerlerinde notr bir
// rozet gosterir. Boolean/diger tipler duz metin olarak yazilir.
export function AttrBadge({ def, value }) {
  if (value === null || value === undefined || value === '') return null
  if (def.dataType === 'boolean') {
    return <Pill>{value ? '✓' : '—'}</Pill>
  }
  if (def.key === 'priority') return <PriorityBadge value={value} />
  if (def.key === 'dal_level') return <DalBadge value={value} />
  if (def.dataType === 'select') return <Pill>{value}</Pill>
  return <span className="text-xs text-slate-600 dark:text-slate-300">{String(value)}</span>
}

export default Pill
