// ============================================================================
//  SuspectPage.jsx  —  Issue #57: supheli (suspect) bag yonetimi sayfasi.
//  Icerik degisen gereksinimlerin Satisfies/Verifies baglari suspect olur.
//  Bu sayfa iki bolum gosterir:
//    1) Supheli Gereksinimler (kaynak): gereksinim basina "Tumunu Temizle" +
//       tek-tek bag temizleme.
//    2) Supheli Testler (hedef): gelen Verifies baglari; tek-tek temizleme.
//  Temizleme yalnizca approve izni olanlarca yapilir (PM her zaman yetkili);
//  backend islemleri AuditLog'a yazar. Diger sayfalardaki suspect gostergesine
//  tiklayinca `focusId` ile bu sayfa acilir ve ilgili satir vurgulanir.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { suspectLinksForRequirement, suspectLinksForTestCase } from '../utils/suspect.js'
import { componentKeyOf } from '../utils/permissions.js'
import { IconAlert, IconCheckCircle } from '../components/common/Icons.jsx'

export default function SuspectPage({ focusId }) {
  const { requirements, testCases, links, clearSuspect, clearLinkSuspect } = useApp()
  const { t } = useLang()
  const { can, isPM } = useAuth()
  const [pending, setPending] = useState(new Set()) // temizlenen id'ler
  const [error, setError] = useState(null)
  const refs = useRef(new Map())

  const reqById = useMemo(() => new Map(requirements.map((r) => [r.id, r])), [requirements])
  const testById = useMemo(() => new Map(testCases.map((tc) => [tc.id, tc])), [testCases])

  const suspectReqs = useMemo(
    () =>
      requirements
        .map((r) => ({ entity: r, links: suspectLinksForRequirement(links, r.id) }))
        .filter((x) => x.links.length > 0)
        .sort((a, b) =>
          a.entity.text_id.localeCompare(b.entity.text_id, undefined, { numeric: true }),
        ),
    [requirements, links],
  )

  const suspectTests = useMemo(
    () =>
      testCases
        .map((tc) => ({ entity: tc, links: suspectLinksForTestCase(links, tc.id) }))
        .filter((x) => x.links.length > 0)
        .sort((a, b) =>
          a.entity.text_id.localeCompare(b.entity.text_id, undefined, { numeric: true }),
        ),
    [testCases, links],
  )

  const total = suspectReqs.length + suspectTests.length

  // focusId ile gelen satira kaydir + vurgula (diger sayfalardaki gostergeden).
  useEffect(() => {
    if (!focusId) return
    const el = refs.current.get(focusId)
    if (el) el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [focusId, suspectReqs, suspectTests])

  const canClear = (kind, type) => isPM || can('approve', componentKeyOf(kind, type))

  const mark = (id, fn) => {
    setError(null)
    setPending((p) => new Set(p).add(id))
    fn()
      .catch(() => setError(t('suspect.error')))
      .finally(() => setPending((p) => new Set([...p].filter((x) => x !== id))))
  }

  // Gereksinim karti: bagi HEDEF alan dugumu (alt gereksinim / test).
  const targetLabel = (link) => {
    const tgt = link.type === 'Verifies' ? testById.get(link.toId) : reqById.get(link.toId)
    return tgt ? tgt.text_id : String(link.toId).slice(0, 8)
  }
  // Test karti: bagin KAYNAGI olan gereksinim (testin kendisi degil!).
  // Testler bag kaynagi olamaz; suspect, kaynak gereksinimin degismesiyle gelir.
  const sourceLabel = (link) => {
    const src = reqById.get(link.fromId)
    return src ? src.text_id : String(link.fromId).slice(0, 8)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <IconAlert size={20} className="text-amber-500" />
            {t('nav.suspect')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('suspect.subtitle')}</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-right dark:bg-amber-950/20">
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-300">{total}</div>
          <div className="text-[11px] font-semibold uppercase text-slate-400">
            {t('suspect.totalSuffix')}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {total === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <IconCheckCircle size={34} className="text-emerald-500" />
          <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
            {t('suspect.empty')}
          </p>
          <p className="text-sm text-slate-400">{t('suspect.emptySub')}</p>
        </div>
      ) : (
        <>
          {suspectReqs.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('suspect.reqsTitle')} ({suspectReqs.length})
              </h3>
              {suspectReqs.map(({ entity, links: slinks }) => (
                <SuspectCard
                  key={entity.id}
                  innerRef={(el) => refs.current.set(entity.id, el)}
                  focused={focusId === entity.id}
                  entity={entity}
                  links={slinks}
                  linkLabel={targetLabel}
                  canClear={canClear('requirement', entity.type)}
                  pending={pending}
                  onClearLink={(id) => mark(id, () => clearLinkSuspect(id))}
                  onClearAll={() => mark(entity.id, () => clearSuspect(entity.id))}
                  t={t}
                />
              ))}
            </section>
          )}

          {suspectTests.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('suspect.testsTitle')} ({suspectTests.length})
              </h3>
              {suspectTests.map(({ entity, links: slinks }) => (
                <SuspectCard
                  key={entity.id}
                  innerRef={(el) => refs.current.set(entity.id, el)}
                  focused={focusId === entity.id}
                  entity={entity}
                  links={slinks}
                  linkLabel={sourceLabel}
                  canClear={canClear('test', entity.type)}
                  pending={pending}
                  onClearLink={(id) => mark(id, () => clearLinkSuspect(id))}
                  t={t}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SuspectCard({
  innerRef,
  focused,
  entity,
  links,
  linkLabel,
  canClear,
  pending,
  onClearLink,
  onClearAll,
  t,
}) {
  const busy = links.some((l) => pending.has(l.id)) || (onClearAll && pending.has(entity.id))
  return (
    <div
      ref={innerRef}
      className={`card border-l-4 ${focused ? 'border-l-amber-400 ring-2 ring-amber-200 dark:ring-amber-900/50' : 'border-l-amber-300'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
              {entity.text_id}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">{entity.title}</span>
            {entity.type && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {entity.type}
              </span>
            )}
          </div>
          <ul className="mt-2 space-y-1">
            {links.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
              >
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  <IconAlert size={11} />
                  {l.type}
                </span>
                <span className="text-slate-400">→</span>
                <span className="font-mono font-semibold">{linkLabel(l)}</span>
                {canClear && (
                  <button
                    onClick={() => onClearLink(l.id)}
                    disabled={pending.has(l.id)}
                    className="btn-ghost !px-1.5 !py-0.5 text-[11px] font-semibold text-slate-500 hover:text-amber-700 disabled:opacity-50 dark:hover:text-amber-300"
                  >
                    {pending.has(l.id) ? t('suspect.clearing') : t('suspect.clear')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {onClearAll && canClear && (
          <button
            onClick={onClearAll}
            disabled={busy}
            className="btn-secondary !py-1.5 text-xs disabled:opacity-50"
          >
            <IconCheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" />
            {busy ? t('suspect.clearing') : t('suspect.clearAll')}
          </button>
        )}
      </div>
    </div>
  )
}
