// ============================================================================
//  LinkManager.jsx  —  Izlenebilirlik bagi kur/kopar modali (yeni taksonomi).
//  Tek bilesen, ucu birden yonetir (subject'e gore):
//
//   subjectKind = 'requirement':
//      * Satisfies (yukari): System -> User, Software/Hardware -> System
//        (depolama: fromId = UST gereksinim, toId = ALT gereksinim/subject)
//      * Ayrica bu gereksinimi karsilayan alt gereksinimleri, dogrulayan
//        testleri ve atanan sozluk terimlerini listeler.
//   subjectKind = 'test':
//      * Verifies: test -> gereksinim (strict; test tipi hedef tipini belirler)
//        Bir test BIRDEN FAZLA gereksinimi dogrulayabilir. Test sonucu (Passed/
//        Failed/In Review) ve alan/oncelik/dal teste ELLE girilir; bag kurmak
//        bu degerleri degistirmez.
//        (depolama: fromId = gereksinim, toId = test/subject)
//   subjectKind = 'glossary':
//      * Assigned To: sozluk terimi -> gereksinim (esnek)
//        (depolama: fromId = gereksinim, toId = terim/subject)
//
//  Tum dogrulama + alan kopyalama + cascade BACKEND'de yapilir; bu bilesen
//  yalnizca dogru { fromId, toId, type, testStatus } gonderir.
// ============================================================================
import { useMemo, useState, useEffect } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { LINK_TYPE, SATISFIES_PARENT_OF, VERIFIES_TARGET_TYPES } from '../../utils/constants.js'
import { IconLink, IconUnlink, IconPlus } from '../common/Icons.jsx'
import { TypeBadge, StatusBadge } from '../common/Badge.jsx'

export default function LinkManager({ open, onClose, subject, subjectKind }) {
  const { requirements, testCases, glossary, links, link, unlink } = useApp()
  const { t } = useLang()
  const [targetId, setTargetId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setTargetId('')
      setError('')
    }
  }, [open, subject])

  // id -> nesne haritalari
  const reqById = useMemo(
    () => Object.fromEntries(requirements.map((r) => [r.id, r])),
    [requirements],
  )
  const testById = useMemo(
    () => Object.fromEntries(testCases.map((tc) => [tc.id, tc])),
    [testCases],
  )
  const gloById = useMemo(() => Object.fromEntries(glossary.map((g) => [g.id, g])), [glossary])

  // Bu subject icin baslatilabilir bag secenegi + aday hedefler.
  const config = useMemo(() => {
    if (!subject) return null
    if (subjectKind === 'requirement') {
      const parentType = SATISFIES_PARENT_OF[subject.type]
      if (!parentType) return null // User: yukari Satisfies yok (tepe)
      const alreadyParents = new Set(
        links
          .filter((l) => l.type === LINK_TYPE.SATISFIES && l.toId === subject.id)
          .map((l) => l.fromId),
      )
      const candidates = requirements.filter(
        (r) => r.type === parentType && !alreadyParents.has(r.id),
      )
      return {
        type: LINK_TYPE.SATISFIES,
        label: t('link.satisfiesUp', { parent: parentType }),
        candidates,
        needsStatus: false,
        toStore: (tid) => ({ fromId: tid, toId: subject.id, type: LINK_TYPE.SATISFIES }),
      }
    }
    if (subjectKind === 'test') {
      const allowed = VERIFIES_TARGET_TYPES[subject.type] || []
      // Bir test BIRDEN FAZLA gereksinimi dogrulayabilir; zaten bagli olanlari
      // aday listesinden cikar.
      const alreadyReqs = new Set(
        links
          .filter((l) => l.type === LINK_TYPE.VERIFIES && l.toId === subject.id)
          .map((l) => l.fromId),
      )
      const candidates = requirements.filter(
        (r) => allowed.includes(r.type) && !alreadyReqs.has(r.id),
      )
      return {
        type: LINK_TYPE.VERIFIES,
        label: t('link.verifies', { types: allowed.join(' / ') }),
        candidates,
        needsStatus: false,
        toStore: (tid) => ({ fromId: tid, toId: subject.id, type: LINK_TYPE.VERIFIES }),
      }
    }
    if (subjectKind === 'glossary') {
      const alreadyReqs = new Set(
        links
          .filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.toId === subject.id)
          .map((l) => l.fromId),
      )
      const candidates = requirements.filter((r) => !alreadyReqs.has(r.id))
      return {
        type: LINK_TYPE.ASSIGNED_TO,
        label: t('link.assignedTo'),
        candidates,
        needsStatus: false,
        toStore: (tid) => ({ fromId: tid, toId: subject.id, type: LINK_TYPE.ASSIGNED_TO }),
      }
    }
    return null
  }, [subject, subjectKind, requirements, links, t])

  // Mevcut baglari topla (gosterim).
  const existingSections = useMemo(() => {
    if (!subject) return []
    const secs = []
    if (subjectKind === 'requirement') {
      const satisfiesUp = links
        .filter((l) => l.type === LINK_TYPE.SATISFIES && l.toId === subject.id)
        .map((l) => ({ l, node: reqById[l.fromId] }))
        .filter((x) => x.node)
      const satisfiedByDown = links
        .filter((l) => l.type === LINK_TYPE.SATISFIES && l.fromId === subject.id)
        .map((l) => ({ l, node: reqById[l.toId] }))
        .filter((x) => x.node)
      const verifiedBy = links
        .filter((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === subject.id)
        .map((l) => ({ l, node: testById[l.toId] }))
        .filter((x) => x.node)
      const assigned = links
        .filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.fromId === subject.id)
        .map((l) => ({ l, node: gloById[l.toId] }))
        .filter((x) => x.node)
      if (SATISFIES_PARENT_OF[subject.type])
        secs.push({ title: t('link.sec.satisfiesUp'), items: satisfiesUp, showStatus: false })
      secs.push({ title: t('link.sec.satisfiedBy'), items: satisfiedByDown, showStatus: false })
      secs.push({ title: t('link.sec.verifiedBy'), items: verifiedBy, showStatus: true })
      secs.push({ title: t('link.sec.assignedGlossary'), items: assigned, showStatus: false })
    } else if (subjectKind === 'test') {
      const verifies = links
        .filter((l) => l.type === LINK_TYPE.VERIFIES && l.toId === subject.id)
        .map((l) => ({ l, node: reqById[l.fromId] }))
        .filter((x) => x.node)
      secs.push({ title: t('link.sec.verifies'), items: verifies, showStatus: false })
    } else if (subjectKind === 'glossary') {
      const assignedTo = links
        .filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.toId === subject.id)
        .map((l) => ({ l, node: reqById[l.fromId] }))
        .filter((x) => x.node)
      secs.push({ title: t('link.sec.assignedTo'), items: assignedTo, showStatus: false })
    }
    return secs
  }, [subject, subjectKind, links, reqById, testById, gloById, t])

  if (!subject) return null

  const canInitiate = config && !config.locked
  const subjectLabel = subject.text_id
    ? `${subject.text_id} · ${subject.title || subject.term}`
    : subject.term || subject.title

  const handleAdd = async () => {
    setError('')
    if (!config || !targetId) return
    setBusy(true)
    try {
      await link(config.toStore(targetId))
      setTargetId('')
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const handleUnlink = async (l) => {
    setBusy(true)
    try {
      await unlink(l.id)
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
      title={t('link.title')}
      subtitle={subjectLabel}
      maxWidth="max-w-3xl"
      footer={
        <button onClick={onClose} className="btn-secondary">
          {t('link.close')}
        </button>
      }
    >
      <div className="space-y-6">
        {config && config.locked && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {t('link.testAlready')}
          </div>
        )}

        {canInitiate && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900/50 dark:bg-brand-950/20">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
              <IconLink size={17} /> {config.label}
            </div>
            {error && (
              <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[240px] flex-1">
                <label className="label">{t('link.targetLabel')}</label>
                <select
                  className="input !py-1.5 text-sm"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  <option value="">{t('link.select')}</option>
                  {config.candidates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.text_id} — {r.title}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={busy || !targetId}
                className="btn-primary disabled:opacity-50"
              >
                <IconPlus size={16} /> {t('link.linkBtn')}
              </button>
            </div>
            {config.candidates.length === 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {t('link.noCandidates')}
              </p>
            )}
          </div>
        )}

        {/* Mevcut baglar */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {existingSections.map((sec, i) => (
            <div key={i}>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {sec.title} <span className="text-slate-400">({sec.items.length})</span>
              </h4>
              {sec.items.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800/50">
                  —
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sec.items.map(({ l, node }) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                          {node.text_id}
                        </span>
                        <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                          {node.title || node.term}
                        </span>
                        {node.type && <TypeBadge value={node.type} />}
                        {sec.showStatus && node.status && <StatusBadge value={node.status} />}
                      </div>
                      <button
                        onClick={() => handleUnlink(l)}
                        disabled={busy}
                        className="btn-ghost shrink-0 !px-2 !py-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title={t('link.unlinkTitle')}
                      >
                        <IconUnlink size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
