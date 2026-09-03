// ============================================================================
//  DynamicAttributeFields.jsx  —  Projenin tanimladigi TUM oznitelikler
//  (Priority dahil — artik o da sabit degil, sadece varsayilan olarak
//  gelen, silinebilir bir oznitelik tanimidir) icin otomatik form alanlari
//  uretir. Requirement/TestCase formlarinda tek, birlesik oznitelik blogu
//  olarak gosterilir.
//  dataType -> input eslemesi: select -> <select>, boolean -> checkbox,
//  number -> number input, date -> date input, text -> metin input.
// ============================================================================
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function DynamicAttributeFields({ entityType, values, onChange }) {
  const { attributeDefs } = useApp()
  const { t } = useLang()

  const defs = attributeDefs
    .filter((d) => d.entityType === entityType || d.entityType === 'both')
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (defs.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {defs.map((d) => {
        const val = values?.[d.key] ?? ''
        return (
          <div key={d.id}>
            <label className="label">
              {d.label}
              {d.required ? ' *' : ''}
            </label>
            {d.dataType === 'select' ? (
              <select className="input" value={val} onChange={(e) => onChange(d.key, e.target.value)}>
                <option value="">—</option>
                {(d.options || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : d.dataType === 'boolean' ? (
              <div className="flex h-[42px] items-center">
                <input
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={(e) => onChange(d.key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </div>
            ) : d.dataType === 'number' ? (
              <input
                type="number"
                className="input"
                value={val}
                onChange={(e) => onChange(d.key, e.target.value)}
              />
            ) : d.dataType === 'date' ? (
              <input
                type="date"
                className="input"
                value={val ? String(val).slice(0, 10) : ''}
                onChange={(e) => onChange(d.key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className="input"
                value={val}
                onChange={(e) => onChange(d.key, e.target.value)}
                placeholder={t('attr.newPh')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Verilen oznitelik tanimlari icin varsayilan degerlerden olusan bir baslangic
// nesnesi uretir (yeni kayit formu acildiginda kullanilir).
export function defaultAttributeValues(attributeDefs, entityType) {
  const out = {}
  for (const d of attributeDefs) {
    if (d.entityType !== entityType && d.entityType !== 'both') continue
    if (d.defaultValue != null) out[d.key] = d.defaultValue
  }
  return out
}

