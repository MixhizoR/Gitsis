// ============================================================================
//  ImpactAnalysisModal.jsx  —  Etki Analizi paneli.
//  Bir gereksinim degistiginde: (1) dogrudan bagli test senaryolari yeniden
//  calistirilmali, (2) Satisfies bagiyla karsilanan UST gereksinim(ler)
//  gozden gecirilmeli (rekursif olarak zincirin tepesine kadar), (3) o
//  seviyeye eklenmis ilgili dokumanlar guncellenmeli. Issue #46: agac
//  backend'de Recursive CTE ile hesaplanir; frontend yalnizca ozet/UI
//  hesabi yapar. Buyuk veri setlerinde (>10k req) tarayiciyi kilitlemez.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { TypeBadge } from '../common/Badge.jsx'
import { IconTarget, IconChevron, IconDoc } from '../common/Icons.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { getImpact } from '../../services/dataService.js'

function Arrow() {
  return (
    <div className="flex justify-start pl-4 py-1 text-slate-300 dark:text-slate-600">
      <IconChevron size={16} className="rotate-90" />
    </div>
  )
}

function ImpactNode({ node, isRoot, t }) {
  const { requirement: req, tests, documents, parents } = node
  return (
    <div>
      <div
        className={
          'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ' +
          (isRoot
            ? 'border-brand-300 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-900/20'
            : 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-900/20')
        }
      >
        <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
          {req.text_id}
        </span>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {req.title}
        </span>
        <TypeBadge value={req.type} />
        <span
          className={
            'ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ' +
            (isRoot
              ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300')
          }
        >
          {isRoot ? t('impact.changed') : t('impact.reviewNeeded')}
        </span>
      </div>

      {tests.length > 0 && (
        <>
          <Arrow />
          <div className="ml-4 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isRoot
                ? t('impact.testsRerun', { n: tests.length })
                : t('impact.testsReview', { n: tests.length })}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tests.map((tc) => (
                <span
                  key={tc.id}
                  className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5"
                >
                  {tc.text_id}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {documents.length > 0 && (
        <>
          <Arrow />
          <div className="ml-4 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <IconDoc size={13} /> {t('impact.docsUpdate', { n: documents.length })}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {documents.map((d) => (
                <span
                  key={d}
                  className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {parents.length > 0 && (
        <>
          <Arrow />
          <div className="ml-4 space-y-3 border-l-2 border-dashed border-slate-200 pl-4 dark:border-slate-700">
            {parents.map((p) => (
              <ImpactNode key={p.requirement.id} node={p} isRoot={false} t={t} />
            ))}
          </div>
        </>
      )}

      {parents.length === 0 && !isRoot && (
        <p className="ml-4 mt-1.5 text-[11px] text-slate-400">{t('impact.topOfChain')}</p>
      )}
    </div>
  )
}

export default function ImpactAnalysisModal({ open, onClose, requirement }) {
  const { projectId } = useApp()
  const { t } = useLang()
  const [tree, setTree] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!open || !requirement) {
      setTree(null)
      return
    }
    setLoading(true)
    getImpact(projectId, requirement.id)
      .then((data) => {
        if (!cancelled) setTree(data)
      })
      .catch(() => {
        if (!cancelled) setTree(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId, requirement])

  const summary = tree?.summary || null
  const isEmpty =
    tree && tree.tests.length === 0 && tree.documents.length === 0 && tree.parents.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('impact.title')}
      subtitle={requirement ? t('impact.subtitle', { id: requirement.text_id }) : ''}
      maxWidth="max-w-2xl"
      footer={
        <button onClick={onClose} className="btn-secondary">
          {t('view.close')}
        </button>
      }
    >
      {!tree ? (
        <p className="text-sm text-slate-400">{loading ? '…' : '—'}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
              <IconTarget size={18} />
            </span>
            <div className="flex gap-2 text-center">
              <div className="rounded-lg bg-brand-50 px-3 py-1.5 dark:bg-brand-900/20">
                <div className="text-lg font-extrabold text-brand-600 dark:text-brand-300">
                  {summary.testCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  {t('impact.summary.tests')}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-1.5 dark:bg-amber-900/20">
                <div className="text-lg font-extrabold text-amber-600 dark:text-amber-300">
                  {summary.parentCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  {t('impact.summary.parents')}
                </div>
              </div>
              <div className="rounded-lg bg-violet-50 px-3 py-1.5 dark:bg-violet-900/20">
                <div className="text-lg font-extrabold text-violet-600 dark:text-violet-300">
                  {summary.documentCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  {t('impact.summary.docs')}
                </div>
              </div>
            </div>
          </div>

          {isEmpty ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400 dark:border-slate-700">
              {t('impact.empty')}
            </p>
          ) : (
            <ImpactNode node={tree} isRoot t={t} />
          )}
        </div>
      )}
    </Modal>
  )
}
