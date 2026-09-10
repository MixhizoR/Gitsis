// ============================================================================
//  RequirementForm.jsx  —  Gereksinim olustur / duzenle formu (hiyerarsi).
//  v4 (kurumsal backend):
//    - TIP KILITLI: her hiyerarsi sayfasi kendi tipini dayatir (pageConfig).
//      Alt Sistem sayfasinda yalnizca Software / Hardware secilebilir.
//    - text_id SUNUCUDA uretilir (olusturmada gosterilmez; duzenlemede
//      salt-okunur).
//    - DURUM elle girilemez: yeni/bagsiz gereksinim daima 'In Review'. Durum
//      yalnizca bagli/dogrulanmis testlerden OTOMATIK (cascade) hesaplanir.
//    - ALAN (Field) DINAMIK: projeye eklenen alanlardan secilir; form icinden
//      yeni alan eklenebilir.
//    - ONCELIK (Priority), DAL Level ve projeye ozel her turlu ek oznitelik
//      artik sabit degil: Oznitelik Yoneticisi'nde tanimlanan semaya gore
//      DynamicAttributeFields tarafindan otomatik olarak gosterilir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { TypeBadge } from '../common/Badge.jsx'
import { IconPlus } from '../common/Icons.jsx'
import { personnelName } from '../../utils/format.js'
import DynamicAttributeFields, {
  defaultAttributeValues,
} from '../common/DynamicAttributeFields.jsx'

export default function RequirementForm({
  open,
  onClose,
  editing,
  pageConfig,
  // Dokumandan metin secilerek acildiginda: formu ON-DOLU baslatir ve olusan
  // gereksinimi kaynak pasaja baglar. Kullanici kaydetmeden once metni
  // SERBESTCE degistirebilir — kaydedilen, kullanicinin son hali olur.
  //   { documentId, documentName, start, end, quote, duplicateOf }
  source = null,
  initialValues = null,
}) {
  const { addRequirement, editRequirement, fields, addField, attributeDefs, personnel } = useApp()
  const { t } = useLang()

  const typeOptions = pageConfig?.typeOptions || []
  const lockedType = pageConfig?.lockedType || typeOptions[0] || null
  const typeChoice = typeOptions.length > 1 // Alt Sistem: SW / HW secimi

  const EMPTY = {
    title: '',
    description: '',
    type: lockedType,
    field: '',
    assigneeId: '',
    relatedDocuments: '',
  }

  const [form, setForm] = useState(EMPTY)
  const [customAttrs, setCustomAttrs] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(editing)

  useEffect(() => {
    if (!open) return
    setError('')
    if (editing) {
      setForm({
        title: editing.title || '',
        description: editing.description || '',
        type: editing.type,
        field: editing.field || '',
        assigneeId: editing.assigneeId || '',
        relatedDocuments: (editing.relatedDocuments || []).join(', '),
      })
      setCustomAttrs(editing.attributes || {})
    } else {
      setForm({ ...EMPTY, type: lockedType, ...(initialValues || {}) })
      setCustomAttrs(defaultAttributeValues(attributeDefs, 'requirement'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setCustomAttr = (key, value) => setCustomAttrs((a) => ({ ...a, [key]: value }))

  // Yeni alan (Field) ekle — dinamik disiplin secenegi.
  const handleAddField = async () => {
    const name = window.prompt(t('field.addPrompt'))
    if (!name || !name.trim()) return
    try {
      const f = await addField(name.trim())
      setForm((prev) => ({ ...prev, field: f.name }))
    } catch (err) {
      setError(err.message || t('form.saveError'))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError(t('form.titleRequired'))
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        type: form.type,
        field: form.field || null,
        // Bos dize = atamayi kaldir (backend bunu null'a cevirir).
        assigneeId: form.assigneeId,
        attributes: customAttrs,
        relatedDocuments: form.relatedDocuments
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }
      if (isEdit) {
        // Tip sunucu tarafinda kilitli; yine de gondermiyoruz.
        const { type: _lockedType, ...rest } = payload
        await editRequirement(editing.id, rest)
      } else {
        // Kayit MEVCUT addRequirement akisindan gecer (text_id uretimi, audit,
        // cascade aynen calisir); kaynak yalnizca ek alan olarak tasinir.
        await addRequirement(
          source
            ? {
                ...payload,
                sourceDocumentId: source.documentId,
                sourceStart: source.start,
                sourceEnd: source.end,
                sourceQuote: source.quote,
              }
            : payload,
        )
      }
      onClose()
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('form.editTitle') : pageConfig?.addLabel || t('form.newTitle')}
      subtitle={isEdit ? editing?.text_id : t('form.fillAll')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('form.cancel')}
          </button>
          <button
            type="submit"
            form="req-form"
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.create')}
          </button>
        </>
      }
    >
      <form id="req-form" onSubmit={handleSubmit} className="space-y-4">
        {source && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs dark:border-brand-900/60 dark:bg-brand-950/40">
            <div className="font-semibold text-brand-800 dark:text-brand-300">
              {t('docsel.sourceLabel', { name: source.documentName })}
            </div>
            <div className="mt-1 line-clamp-3 italic text-slate-600 dark:text-slate-400">
              “{source.quote}”
            </div>
          </div>
        )}
        {source?.duplicateOf && (
          // UYARI, ENGEL DEGIL: ayni pasajdan turetilmis ikinci bir gereksinim
          // mesrudur (orn. bir cumleden hem sistem hem yazilim gereksinimi).
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            {t('docsel.duplicateWarn', { list: source.duplicateOf })}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Baslik + Tip (kilitli / SW-HW secimi) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">{t('form.titleLabel')}</label>
            <input
              className="input"
              value={form.title}
              onChange={set('title')}
              placeholder={t('form.titlePh')}
            />
          </div>
          <div>
            <label className="label">{t('form.type')}</label>
            {typeChoice ? (
              <select className="input" value={form.type} onChange={set('type')}>
                {typeOptions.map((tp) => (
                  <option key={tp} value={tp}>
                    {tp}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex h-[42px] items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800/50">
                <TypeBadge value={form.type} />
                <span className="ml-2 text-[11px] text-slate-400">{t('form.typeLocked')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Aciklama */}
        <div>
          <label className="label">{t('form.desc')}</label>
          <textarea
            className="input min-h-[96px] resize-y"
            value={form.description}
            onChange={set('description')}
            placeholder={t('form.descPh')}
          />
        </div>

        {/* Ilgili dokumanlar (etki analizinde gosterilir) */}
        <div>
          <label className="label">{t('form.relatedDocs')}</label>
          <input
            className="input"
            value={form.relatedDocuments}
            onChange={set('relatedDocuments')}
            placeholder={t('form.relatedDocsPh')}
          />
          <p className="mt-1 text-[11px] text-slate-400">{t('form.relatedDocsHint')}</p>
        </div>

        {/* Alan (dinamik) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className="label flex items-center justify-between">
              <span>{t('form.field')}</span>
              <button
                type="button"
                onClick={handleAddField}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold text-brand-600 hover:underline dark:text-brand-400"
                title={t('field.add')}
              >
                <IconPlus size={12} /> {t('field.add')}
              </button>
            </label>
            <select className="input" value={form.field} onChange={set('field')}>
              <option value="">{t('form.fieldNone')}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sorumlu personel. Sozlukteki "Assigned To" BAGI ile karistirilmamali:
              bu alan isin kimde oldugunu tutar. */}
          <div>
            <label className="label">{t('form.assignee')}</label>
            <select
              className="input"
              value={form.assigneeId}
              onChange={set('assigneeId')}
              data-testid="form-assignee"
            >
              <option value="">{t('form.assigneeNone')}</option>
              {personnel.map((p) => (
                <option key={p.id} value={p.id}>
                  {personnelName(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Oznitelikler: Priority (varsayilan gelir, silinebilir) ve projeye
            ozel her turlu ek alan — Oznitelik Yoneticisi'nden tanimlanir. */}
        <DynamicAttributeFields
          entityType="requirement"
          values={customAttrs}
          onChange={setCustomAttr}
        />
      </form>
    </Modal>
  )
}
