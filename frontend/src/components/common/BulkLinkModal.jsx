// ============================================================================
//  BulkLinkModal.jsx  —  Secilen tum satirlari TEK bir hedefe zincirleyen modal.
//  Hedef adaylari, sayfanin hiyerarsi kuralindan turetilir:
//    * requirement  -> Satisfies:  secili alt gereksinimler -> tek UST gereksinim
//    * test         -> Verifies:   secili testler -> tek gereksinim (durum zorunlu)
//    * glossary     -> Assigned To: secili terimler -> tek gereksinim
//  Depolama yonu backend'de tektir: fromId = hedef, toId = her kaynak.
// ============================================================================
import { useMemo, useState, useEffect } from 'react'
import Modal from './Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import {
  LINK_TYPE,
  SATISFIES_PARENT_OF,
  VERIFIES_TARGET_TYPES,
} from '../../utils/constants.js'
import { IconLink } from './Icons.jsx'

export default function BulkLinkModal({ open, onClose, subjectKind, sources = [], onDone }) {
  const { requirements, bulkLink } = useApp()
  const { t } = useLang()
  const [targetId, setTargetId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setTargetId(''); setError('') }
  }, [open, sources])

  const config = useMemo(() => {
    if (!sources || sources.length === 0) return null

    if (subjectKind === 'requirement') {
      const parentTypes = [...new Set(sources.map((s) => SATISFIES_PARENT_OF[s.type]).filter(Boolean))]
      if (parentTypes.length !== 1) return { unavailable: true } // User (tepe) vb.
      const parentType = parentTypes[0]
      return {
        type: LINK_TYPE.SATISFIES,
        label: t('bulk.link.satisfies', { parent: parentType }),
        candidates: requirements.filter((r) => r.type === parentType),
        needsStatus: false,
      }
    }

    if (subjectKind === 'test') {
      const testType = sources[0]?.type
      const allowed = VERIFIES_TARGET_TYPES[testType] || []
      // Bir test coklu gereksinim dogrulayabilir; zaten kurulu (birebir ayni)
      // baglar backend'de sessizce atlanir.
      return {
        type: LINK_TYPE.VERIFIES,
        label: t('bulk.link.verifies', { types: allowed.join(' / ') }),
        candidates: requirements.filter((r) => allowed.includes(r.type)),
        needsStatus: false,
      }
    }

    if (subjectKind === 'glossary') {
      return {
        type: LINK_TYPE.ASSIGNED_TO,
        label: t('bulk.link.assignedTo'),
        candidates: requirements,
        needsStatus: false,
      }
    }
    return null
  }, [sources, subjectKind, requirements, t])

  if (!open) return null

  const handleSubmit = async () => {
    setError('')
    if (!config || config.unavailable || !targetId) return
    setBusy(true)
    try {
      await bulkLink({
        type: config.type,
        targetId,
        sourceIds: sources.map((s) => s.id),
      })
      onDone && onDone()
      onClose()
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bulk.link.title')}
      subtitle={t('bulk.link.subtitle', { count: sources.length })}
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('link.close')}</button>
          <button
            onClick={handleSubmit}
            disabled={busy || !targetId || config?.unavailable}
            className="btn-primary disabled:opacity-50"
          >
            <IconLink size={16} /> {t('bulk.link.confirm')}
          </button>
        </div>
      }
    >
      {config?.unavailable ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          {t('bulk.link.topLevel')}
        </p>
      ) : !config ? null : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
            <IconLink size={17} /> {config.label}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label className="label">{t('link.targetLabel')}</label>
            <select className="input !py-1.5 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">{t('link.select')}</option>
              {config.candidates.map((r) => (
                <option key={r.id} value={r.id}>{r.text_id} — {r.title}</option>
              ))}
            </select>
            {config.candidates.length === 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('link.noCandidates')}</p>
            )}
          </div>

        </div>
      )}
    </Modal>
  )
}
