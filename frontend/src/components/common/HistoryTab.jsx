// ============================================================================
//  HistoryTab.jsx  —  Issue #57: salt okunur versiyon gecmisi (SCD Type 4).
//  Backend GET /requirements/:id/history'den beslenir; her satir, degisiklik
//  ONCESI durumun kopyasidir (v1 = orijinal). "Degisen Alanlar" sutunu,
//  ardışık snapshot'lar karsilastirilarak cikarilir (utils/versioning.js).
//  Satira tiklayinca o surumun tam kopyasi acilir. Yalnizca gostergedir —
//  gecmis uzerinden geri donme (restore) yoktur.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { formatDateTime } from '../../utils/format.js'
import { changedFieldsSummary } from '../../utils/versioning.js'
import { IconChevron, IconHistory } from './Icons.jsx'

function stripHtml(s) {
  if (!s) return ''
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// changedBy bir userId/personnelId UUID'dir; personel ise ad soyad goster.
function actorName(id, personnel) {
  const p = (personnel || []).find((x) => x.id === id)
  if (p) return `${p.firstName} ${p.lastName}`.trim()
  return id ? String(id).slice(0, 8) : '—'
}

export default function HistoryTab({ row }) {
  const { getRequirementHistory, personnel } = useApp()
  const { t } = useLang()
  const [rows, setRows] = useState(null) // null = yukleniyor
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null) // acik satirin version numarasi

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setError(null)
    ;(async () => {
      try {
        const data = await getRequirementHistory(row.id)
        if (!cancelled) setRows(data || [])
      } catch (e) {
        // Kullaniciya teknik hata detayi yerine genel ceviri metni gosterilir.
        console.error('[history] yuklenemedi:', e?.message || e)
        if (!cancelled) setError(t('view.history.error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row.id, getRequirementHistory, t])

  // Her history satiri icin "degisen alanlar": satirin kendisi vs ondan SONRAKI
  // durum (daha yeni versiyon veya ana tablodaki guncel kayit).
  const withDiff = useMemo(() => {
    if (!rows) return []
    const snapshots = [row, ...rows] // [guncel, vN, vN-1, ..., v1] (desc)
    return rows.map((h, i) => ({
      ...h,
      changedFields: changedFieldsSummary(h, snapshots[i]),
    }))
  }, [rows, row])

  const fieldLabel = (key) => {
    const map = {
      title: t('tbl.th.title'),
      description: t('view.description'),
      field: t('view.meta.field'),
      priority: t('view.meta.priority'),
      dal_level: t('view.meta.dal'),
    }
    return map[key] || key
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
  }
  if (!rows) {
    return <p className="py-6 text-center text-sm text-slate-400">{t('view.history.loading')}</p>
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
        <IconHistory size={28} />
        <p className="text-sm font-medium">{t('view.history.empty')}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th className="px-3 py-2">{t('view.history.version')}</th>
            <th className="px-3 py-2">{t('view.history.changedAt')}</th>
            <th className="px-3 py-2">{t('view.history.changedBy')}</th>
            <th className="px-3 py-2">{t('view.history.changedFields')}</th>
            <th className="px-3 py-2" aria-hidden="true" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {withDiff.map((h) => {
            const open = expanded === h.version
            return (
              <VersionRow
                key={h.id}
                h={h}
                open={open}
                onToggle={() => setExpanded(open ? null : h.version)}
                actor={actorName(h.changedBy, personnel)}
                fieldLabel={fieldLabel}
                t={t}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function VersionRow({ h, open, onToggle, actor, fieldLabel, t }) {
  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <td className="whitespace-nowrap px-3 py-2.5">
          <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            v{h.version}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
          {formatDateTime(h.changedAt)}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          {actor}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {h.changedFields.length === 0 ? (
              <span className="text-xs text-slate-400">—</span>
            ) : (
              h.changedFields.map((f) => (
                <span
                  key={f}
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  {fieldLabel(f)}
                </span>
              ))
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            onClick={onToggle}
            className="btn-ghost rounded-lg p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
            aria-expanded={open}
            aria-label={`${t('view.history.toggle')} v${h.version}`}
          >
            <IconChevron size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
          <td colSpan={5} className="px-5 py-4">
            <SnapshotDetail h={h} t={t} />
          </td>
        </tr>
      )}
    </>
  )
}

function SnapshotDetail({ h, t }) {
  const attrs = h.attributes || {}
  const attrEntries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  )
  const descPlain = stripHtml(h.description)
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <Field label={t('tbl.th.title')} value={h.title} />
      <Field label={t('view.meta.type')} value={h.type} />
      <Field label={t('view.meta.field')} value={h.field} />
      <Field label={t('tbl.th.status')} value={h.status} />
      <Field label={t('tbl.th.approvalStatus')} value={h.approvalStatus} />
      <Field
        label={t('tbl.locked')}
        value={h.locked ? t('view.history.yes') : t('view.history.no')}
      />
      {attrEntries.length > 0 && (
        <div className="sm:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('view.history.attributes')}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {attrEntries.map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {k}: {String(v)}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="sm:col-span-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('view.description')}
        </div>
        <p className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-300">
          {descPlain || '—'}
        </p>
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-slate-700 dark:text-slate-200">{value || '—'}</div>
    </div>
  )
}
