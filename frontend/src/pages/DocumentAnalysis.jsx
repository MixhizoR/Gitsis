// ============================================================================
//  DocumentAnalysis.jsx  —  AI Belge Analizi sayfasi.
//  IKI MOTOR:
//    (1) ONLINE  -> arkadasin LM Studio + Gemma motoru (Python api_server.py).
//                   Belge okunur, istenen sayida Kullanici/Sistem/Alt-Sistem
//                   gereksinimi URETILIR. Begenilmeyenler Sil / Yeniden Uret.
//    (2) OFFLINE -> mevcut yerel JS motoru (documentService.js). Internet
//                   gerektirmez; cumleleri ayiklar + DO-178C kalite puani verir.
//  Her iki motorda da secilen gereksinimler AYNI akisla (addRequirement ->
//  gercek backend) sisteme aktarilir. Boylece calisan duzen/veritabani bozulmaz;
//  bu sayfa yalnizca bir "kaynak"tir; test eslestirmesini kullanici kendi yapar.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import {
  analyzeDocument,
  extractTextFromFile,
  toRequirementInput,
} from '../services/documentService.js'
import {
  analyzeWithEngine,
  regenerateItem,
  pingEngine,
  AI_BASE,
} from '../services/aiEngineService.js'
import { StatCard, BreakdownBar } from '../components/common/StatCard.jsx'
import { TypeBadge, CategoryBadge } from '../components/common/Badge.jsx'
import {
  IconUpload,
  IconSparkle,
  IconDoc,
  IconCheck,
  IconAlert,
  IconList,
  IconShield,
  IconReset,
  IconTrash,
} from '../components/common/Icons.jsx'
import { REQ_TYPES, CATEGORIES, CATEGORY_BAR, REQ_TYPE } from '../utils/constants.js'

// Tip kirilimi cubuklari icin renk eslemesi.
const TYPE_BAR = {
  [REQ_TYPE.USER]: 'bg-amber-500',
  [REQ_TYPE.SYSTEM]: 'bg-violet-500',
  [REQ_TYPE.SOFTWARE]: 'bg-brand-500',
  [REQ_TYPE.HARDWARE]: 'bg-teal-500',
  [REQ_TYPE.TEST_CASE]: 'bg-fuchsia-500',
}

const MEASURE_RE =
  /\d+\s*(ms|sn|s\b|saniye|dk|dakika|saat|mb|gb|kb|hz|mhz|ghz|%|db|volt|v\b|bar|°c|mm|cm|metre|m\b|w\b|rpm|pulse|step|kg|g\b)/i

// Kalite rozeti (yalniz OFFLINE motorda anlamli).
function QualityBadge({ quality }) {
  const { t } = useLang()
  const map = {
    ok: {
      cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/60',
      label: t('doc.quality.ok'),
    },
    warning: {
      cls: 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60',
      label: t('doc.quality.warning'),
    },
    error: {
      cls: 'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60',
      label: t('doc.quality.error'),
    },
  }
  const m = map[quality.status] || map.warning
  return (
    <span
      className={
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ' +
        m.cls
      }
      title={quality.messages.join('\n')}
    >
      {m.label} · %{quality.score}
    </span>
  )
}

const EXAMPLE = `Aviyonik Ucus Kontrol Sistemi — Ornek Gereksinim Belgesi

REQ-SYS-100 Sistem, pilot komutuna 150 ms icinde tepki vermelidir.
Otopilot, ayarlanan irtifayi +/- 15 metre toleransla korumalidir.
Arayuz ekraninda kritik uyarilar kirmizi renkte gosterilmelidir.
Ucus verileri en az 25 saat boyunca veritabaninda saklanmalidir.
Telemetri sunucusu es zamanli 50 istemciye hizmet vermelidir.
Sistem kullanici dostu ve modern bir arayuze sahip olmalidir.
Haberlesme paketleri CRC ile dogrulanmali ve hatali paketler atilmalidir.
IMU arizasinda sistem 100 ms icinde yedek sensore gecmelidir.
Test: 150 ms tepki suresi 1000 ornekle olculur ve dogrulanir.
Donanim, -40 ile +70 °C arasinda calismayi surdurmelidir.`

export default function DocumentAnalysis() {
  const { addRequirement } = useApp()
  const { t } = useLang()
  const fileRef = useRef(null)

  const [engine, setEngine] = useState('online') // 'online' | 'offline'
  const [engineStatus, setEngineStatus] = useState({ state: 'checking' })
  const [counts, setCounts] = useState({ user: 5, system: 8, subsystem: 8 })

  const [text, setText] = useState('')
  const [sourceText, setSourceText] = useState('') // regenerate icin analizde kullanilan metin
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null) // { mode, requirements, summary, totalSegments? }
  const [selected, setSelected] = useState(() => new Set())
  const [overrides, setOverrides] = useState({}) // id -> {type, category}
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null) // regenerate edilen satir id
  const [error, setError] = useState('')
  const [imported, setImported] = useState(0)

  // --- Motor saglik kontrolu (online secildiginde) --------------------------
  useEffect(() => {
    let alive = true
    if (engine !== 'online') return
    setEngineStatus({ state: 'checking' })
    pingEngine()
      .then((h) => {
        if (!alive) return
        setEngineStatus(
          h.lmstudio_reachable
            ? { state: 'ok', model: h.model }
            : { state: 'lmoff', model: h.model },
        )
      })
      .catch(() => alive && setEngineStatus({ state: 'down' }))
    return () => {
      alive = false
    }
  }, [engine])

  // --- Dosya secimi -> metin cikar (her iki motor icin de) ------------------
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setBusy(true)
    setFileName(file.name)
    try {
      const txt = await extractTextFromFile(file)
      setText(txt)
      if (engine === 'offline') runOffline(txt)
    } catch (err) {
      setError(err.message || t('doc.fileError'))
    } finally {
      setBusy(false)
    }
  }

  // --- OFFLINE analiz -------------------------------------------------------
  const runOffline = (raw) => {
    const src = (raw ?? text).trim()
    if (!src) {
      setError(t('doc.emptyError'))
      return
    }
    setError('')
    setImported(0)
    const res = analyzeDocument(src)
    setResult({ mode: 'offline', ...res })
    const next = new Set(
      res.requirements.filter((r) => r.quality.status !== 'error').map((r) => r.id),
    )
    setSelected(next)
    setOverrides({})
  }

  // --- ONLINE uretim (Gemma) ------------------------------------------------
  const runOnline = async () => {
    const src = text.trim()
    if (!src) {
      setError(t('doc.needDocFirst'))
      return
    }
    if (counts.user + counts.system + counts.subsystem <= 0) return
    setError('')
    setImported('')
    setBusy(true)
    try {
      const { requirements, summary } = await analyzeWithEngine({ text: src, counts })
      setSourceText(src)
      setResult({
        mode: 'online',
        requirements,
        summary: buildOnlineSummary(requirements, summary),
      })
      setSelected(new Set(requirements.map((r) => r.id)))
      setOverrides({})
      setImported(0)
    } catch (err) {
      setError(err.message || 'AI motoru hatasi.')
    } finally {
      setBusy(false)
    }
  }

  const buildOnlineSummary = (reqs, meta) => {
    const countBy = (key) =>
      reqs.reduce((a, r) => {
        a[r[key]] = (a[r[key]] || 0) + 1
        return a
      }, {})
    const measurable = reqs.filter((r) => MEASURE_RE.test(r.raw)).length
    const n = reqs.length
    return {
      extracted: n,
      measurable,
      measurablePct: n ? Math.round((measurable / n) * 100) : 0,
      byType: countBy('type'),
      byCategory: countBy('category'),
      counts: {
        user: meta?.user ?? reqs.filter((r) => r.level === 'user').length,
        system: meta?.system ?? reqs.filter((r) => r.level === 'system').length,
        subsystem: meta?.subsystem ?? reqs.filter((r) => r.level === 'subsystem').length,
      },
      model: meta?.model || engineStatus.model,
      recommendations: [t('doc.aiReviewNote')],
    }
  }

  const primaryAction = () => (engine === 'online' ? runOnline() : runOffline())

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allSelected =
    result && selected.size === result.requirements.length && result.requirements.length > 0
  const toggleAll = () => {
    if (!result) return
    setSelected(allSelected ? new Set() : new Set(result.requirements.map((r) => r.id)))
  }

  const setOverride = (id, field, value) =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const effective = (item) => ({
    ...item,
    type: overrides[item.id]?.type ?? item.type,
    category: overrides[item.id]?.category ?? item.category,
  })

  // --- Satir: Sil -----------------------------------------------------------
  const deleteRow = (id) => {
    setResult(
      (prev) => prev && { ...prev, requirements: prev.requirements.filter((r) => r.id !== id) },
    )
    setSelected((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
    setOverrides((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
  }

  // --- Satir: Yeniden Uret (yalniz online) ----------------------------------
  const regenRow = async (row) => {
    if (!row.level) return
    setRowBusy(row.id)
    setError('')
    try {
      const avoid = result.requirements.map((r) => r.description)
      const fresh = await regenerateItem({ level: row.level, sourceText, avoid })
      setResult(
        (prev) =>
          prev && {
            ...prev,
            requirements: prev.requirements.map((r) =>
              r.id === row.id ? { ...fresh, id: row.id, level: row.level } : r,
            ),
          },
      )
      setOverrides((prev) => {
        const n = { ...prev }
        delete n[row.id]
        return n
      })
    } catch (err) {
      setError(err.message || t('doc.regenerating'))
    } finally {
      setRowBusy(null)
    }
  }

  // --- Secilenleri sisteme aktar (her iki motor icin ayni) ------------------
  const importSelected = async () => {
    if (!result || selected.size === 0) return
    setBusy(true)
    let count = 0
    try {
      for (const item of result.requirements) {
        if (!selected.has(item.id)) continue
        await addRequirement(toRequirementInput(effective(item)))
        count++
      }
      setImported(count)
      const remaining = result.requirements.filter((r) => !selected.has(r.id))
      setResult({ ...result, requirements: remaining })
      setSelected(new Set())
    } catch (err) {
      setError(err.message || t('doc.importError'))
    } finally {
      setBusy(false)
    }
  }

  const clearAll = () => {
    setText('')
    setSourceText('')
    setResult(null)
    setFileName('')
    setError('')
    setImported(0)
  }

  const summary = result?.summary
  const rows = result?.requirements || []
  const isOnline = engine === 'online'

  const byTypeData = useMemo(() => summary?.byType || {}, [summary])
  const byCatData = useMemo(() => summary?.byCategory || {}, [summary])

  return (
    <div className="space-y-6">
      {/* Giris: baslik + motor secici + dosya/metin */}
      <div className="card p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
            <IconSparkle size={20} />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {t('doc.title')}
              {isOnline ? (
                <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  {t('doc.engine.online.badge')}
                </span>
              ) : (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  OFFLINE
                </span>
              )}
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              {isOnline ? (
                t('doc.engine.hint')
              ) : (
                <>
                  {t('doc.intro1')}
                  <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">
                    .txt .md .csv .json .pdf
                  </code>
                  {t('doc.intro2')}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Motor secici + durum */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('doc.engine.label')}
          </span>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
            <button
              onClick={() => setEngine('online')}
              className={
                'px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (isOnline
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300')
              }
            >
              {t('doc.engine.online')}
            </button>
            <button
              onClick={() => setEngine('offline')}
              className={
                'px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (!isOnline
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300')
              }
            >
              {t('doc.engine.offline')}
            </button>
          </div>

          {isOnline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              {engineStatus.state === 'checking' && (
                <span className="text-slate-400">● {t('doc.engine.checking')}</span>
              )}
              {engineStatus.state === 'ok' && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ● {t('doc.engine.connected', { model: engineStatus.model })}
                </span>
              )}
              {engineStatus.state === 'lmoff' && (
                <span className="text-amber-600 dark:text-amber-400">
                  ● {t('doc.engine.lmOffline')}
                </span>
              )}
              {engineStatus.state === 'down' && (
                <span className="text-rose-600 dark:text-rose-400">
                  ● {t('doc.engine.disconnected', { url: AI_BASE })}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Adet girisleri (yalniz online) */}
        {isOnline && (
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <span className="text-xs font-semibold text-slate-500">{t('doc.counts.title')}</span>
            {['user', 'system', 'subsystem'].map((k) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">
                  {t('doc.counts.' + k)}
                </span>
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={counts[k]}
                  onChange={(e) =>
                    setCounts((c) => ({
                      ...c,
                      [k]: Math.max(0, Math.min(40, Number(e.target.value) || 0)),
                    }))
                  }
                  className="input w-20 !py-1 text-sm"
                />
              </label>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Dosya yukle */}
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.json,.log,.pdf,text/plain,application/pdf"
              onChange={onFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-brand-500"
            >
              <IconUpload size={26} className="text-brand-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t('doc.uploadBtn')}
              </span>
              <span className="text-xs text-slate-400">
                {fileName || 'txt · md · csv · json · pdf'}
              </span>
            </button>
          </div>

          {/* Metin yapistir */}
          <div className="lg:col-span-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('doc.pastePh')}
              rows={6}
              className="input h-full w-full resize-none font-mono text-xs leading-relaxed"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={primaryAction}
            disabled={busy || (isOnline && engineStatus.state === 'down')}
            className="btn-primary disabled:opacity-40"
          >
            <IconSparkle size={18} />
            {busy
              ? isOnline
                ? t('doc.generating')
                : t('doc.analyzing')
              : isOnline
                ? t('doc.generate')
                : t('doc.analyze')}
          </button>
          {!isOnline && (
            <button
              onClick={() => {
                setText(EXAMPLE)
                runOffline(EXAMPLE)
              }}
              className="btn-secondary"
            >
              <IconDoc size={16} /> {t('doc.tryExample')}
            </button>
          )}
          {text && (
            <button onClick={clearAll} className="btn-ghost text-slate-500">
              {t('doc.clear')}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            <IconAlert size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {imported > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <IconCheck size={16} /> {t('doc.imported', { n: imported })}
          </div>
        )}
      </div>

      {/* Sonuc ozeti */}
      {summary && (
        <>
          {/* OFFLINE: DO-178C kalite kartlari */}
          {result.mode === 'offline' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('doc.stat.extracted')}
                value={summary.extracted}
                sub={t('doc.stat.scanned', { n: result.totalSegments })}
                icon={<IconList size={18} />}
                accent="brand"
              />
              <StatCard
                label={t('doc.stat.avgQuality')}
                value={`%${summary.avgScore}`}
                sub={t('doc.stat.qualityScore')}
                icon={<IconShield size={18} />}
                accent={
                  summary.avgScore >= 75 ? 'emerald' : summary.avgScore >= 50 ? 'amber' : 'rose'
                }
              />
              <StatCard
                label={t('doc.stat.measurable')}
                value={`%${summary.measurablePct}`}
                sub={t('doc.stat.measurableSub', { m: summary.measurable, e: summary.extracted })}
                icon={<IconCheck size={18} />}
                accent={summary.measurablePct >= 50 ? 'emerald' : 'amber'}
              />
              <StatCard
                label={t('doc.stat.vague')}
                value={summary.vague + summary.weak}
                sub={t('doc.stat.vagueSub', { v: summary.vague, w: summary.weak })}
                icon={<IconAlert size={18} />}
                accent={summary.vague + summary.weak > 0 ? 'rose' : 'emerald'}
              />
            </div>
          )}

          {/* ONLINE: seviye kirilimi kartlari */}
          {result.mode === 'online' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('doc.online.total')}
                value={summary.extracted}
                sub={summary.model}
                icon={<IconSparkle size={18} />}
                accent="brand"
              />
              <StatCard
                label={t('doc.counts.user')}
                value={summary.counts.user}
                icon={<IconList size={18} />}
                accent="amber"
              />
              <StatCard
                label={t('doc.counts.system')}
                value={summary.counts.system}
                icon={<IconList size={18} />}
                accent="violet"
              />
              <StatCard
                label={t('doc.counts.subsystem')}
                value={summary.counts.subsystem}
                icon={<IconList size={18} />}
                accent="emerald"
              />
            </div>
          )}

          {/* Oneriler */}
          {summary.recommendations?.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <IconSparkle size={18} className="text-brand-500" /> {t('doc.recommendations')}
              </h3>
              <ul className="space-y-2">
                {summary.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Kirilimlar */}
          {rows.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BreakdownBar title={t('doc.byType')} data={byTypeData} colorMap={TYPE_BAR} />
              <BreakdownBar title={t('doc.byCat')} data={byCatData} colorMap={CATEGORY_BAR} />
            </div>
          )}

          {/* Cikarilan gereksinim tablosu */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {t('doc.extractedTitle')} <span className="text-slate-400">({rows.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('doc.selectedCount', { n: selected.size })}
                </span>
                <button
                  onClick={importSelected}
                  disabled={busy || selected.size === 0}
                  className="btn-primary !py-1.5 disabled:opacity-40"
                >
                  <IconCheck size={16} /> {t('doc.importSelected')}
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <IconDoc size={28} className="text-slate-300" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
                  {summary.extracted === 0 ? t('doc.noneFound') : t('doc.allImported')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                      <th className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                        />
                      </th>
                      <th className="px-3 py-3">{t('doc.th.candidate')}</th>
                      <th className="px-3 py-3">{t('doc.th.type')}</th>
                      <th className="px-3 py-3">{t('doc.th.domain')}</th>
                      {isOnline ? (
                        <th className="px-3 py-3">{t('doc.th.actions')}</th>
                      ) : (
                        <th className="px-3 py-3">{t('doc.th.quality')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => {
                      const eff = effective(r)
                      const isSel = selected.has(r.id)
                      const regenning = rowBusy === r.id
                      return (
                        <tr
                          key={r.id}
                          className={isSel ? 'bg-brand-50/30 dark:bg-brand-900/10' : ''}
                        >
                          <td className="px-3 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggle(r.id)}
                              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                            />
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {r.title}
                            </div>
                            <div className="mt-0.5 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                              {r.description}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <TypeBadge value={eff.type} />
                              <CategoryBadge value={eff.category} />
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <select
                              value={eff.type}
                              onChange={(e) => setOverride(r.id, 'type', e.target.value)}
                              className="input !py-1 !text-xs"
                            >
                              {REQ_TYPES.map((tp) => (
                                <option key={tp} value={tp}>
                                  {tp}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <select
                              value={eff.category}
                              onChange={(e) => setOverride(r.id, 'category', e.target.value)}
                              className="input !py-1 !text-xs"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          {isOnline ? (
                            <td className="px-3 py-3 align-top">
                              <div className="flex flex-col gap-1.5">
                                <button
                                  onClick={() => regenRow(r)}
                                  disabled={regenning}
                                  className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-40 dark:border-brand-800/60 dark:bg-brand-900/30 dark:text-brand-300"
                                >
                                  <IconReset size={13} />{' '}
                                  {regenning ? t('doc.regenerating') : t('doc.row.regenerate')}
                                </button>
                                <button
                                  onClick={() => deleteRow(r.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                                >
                                  <IconTrash size={13} /> {t('doc.row.delete')}
                                </button>
                              </div>
                            </td>
                          ) : (
                            <td className="px-3 py-3 align-top">
                              <QualityBadge quality={r.quality} />
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
