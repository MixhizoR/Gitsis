// ============================================================================
//  BulkAssignModal.jsx  —  Issue #120: secili kayitlara TOPLU kisi atama.
//
//  Listeden coklu secim yapilip "Toplu Ata" denince acilir. Atama COKLUDUR ve
//  SIRA anlamlidir (ilk kisi birincil sorumlu, backend legacy `assigneeId`
//  kolonunu ona esitler) — bu yuzden tek tek duzenlemedeki AssigneePicker
//  burada da aynen kullanilir.
//
//  Uygulama modu, secili kayitlarin MEVCUT atamalarina ne olacagini soyler:
//    Ekle      mevcutlarin sonuna eklenir (birincil sorumlu korunur)
//    Degistir  mevcutlar silinir, yalnizca secilenler kalir
//    Kaldir    secilenler atamadan cikarilir
//
//  Kilitli (onaylanmis) kayitlar backend'de ATLANIR; modal bunu hem onceden
//  uyari olarak hem de islem sonrasi ozet olarak gosterir — sessizce yutulmaz.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import AssigneePicker from './AssigneePicker.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconUsers, IconAlert } from './Icons.jsx'

const MODES = ['add', 'replace', 'remove']

export default function BulkAssignModal({
  open,
  onClose,
  rows = [],
  entity = 'requirement',
  onDone,
}) {
  const { personnel, bulkAssignRequirements, bulkAssignTestCases } = useApp()
  const { t } = useLang()
  const [ids, setIds] = useState([])
  const [mode, setMode] = useState('add')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setIds([])
      setMode('add')
      setError('')
    }
  }, [open, rows])

  if (!open) return null

  // Kilitli satirlar backend'de atlanacak; kullanici bunu ONCEDEN bilsin.
  const lockedCount = rows.filter((r) => r.locked).length
  const targetCount = rows.length - lockedCount
  // 'Degistir' modunda bos secim "tum atamalari kaldir" demektir ve gecerlidir;
  // diger modlarda en az bir kisi secilmelidir.
  const canSubmit = mode === 'replace' || ids.length > 0

  const handleSubmit = async () => {
    setError('')
    if (!canSubmit) return
    setBusy(true)
    try {
      const run = entity === 'testcase' ? bulkAssignTestCases : bulkAssignRequirements
      const result = await run(
        rows.map((r) => r.id),
        ids,
        mode,
      )
      onDone && onDone(result)
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
      title={t('bulk.assign.title')}
      subtitle={t('bulk.assign.subtitle', { count: rows.length })}
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            {t('link.close')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || !canSubmit || targetCount === 0}
            data-testid="bulk-assign-submit"
            className="btn-primary disabled:opacity-50"
          >
            <IconUsers size={16} /> {busy ? t('view.saving') : t('bulk.assign.confirm')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Kilit uyarisi: kac kayit atlanacak, islem ONCESINDE gorunur. */}
        {lockedCount > 0 && (
          <div
            data-testid="bulk-assign-locked-warning"
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
          >
            <IconAlert size={16} className="mt-0.5 shrink-0" />
            <span>{t('bulk.assign.lockedWarn', { locked: lockedCount, n: targetCount })}</span>
          </div>
        )}

        {/* Uygulama modu */}
        <div>
          <label className="label">{t('bulk.assign.modeLabel')}</label>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                data-testid={`bulk-assign-mode-${m}`}
                className={
                  'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ' +
                  (mode === m
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800')
                }
              >
                {t(`bulk.assign.mode.${m}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t(`bulk.assign.mode.${mode}.hint`)}
          </p>
        </div>

        {/* Kisi secimi — sira anlamlidir (ilk kisi birincil sorumlu). */}
        <div>
          <label className="label">{t('bulk.assign.peopleLabel')}</label>
          <AssigneePicker personnel={personnel} value={ids} onChange={setIds} />
          {mode === 'replace' && ids.length === 0 && (
            <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {t('bulk.assign.clearHint')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
