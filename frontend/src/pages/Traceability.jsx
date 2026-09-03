// ============================================================================
//  Traceability.jsx  —  Izlenebilirlik Matrisi sayfasi.
//  Iki matris: (1) System -> Software (Satisfies), (2) Req -> Test Case (Verifies).
// ============================================================================
import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import TraceabilityMatrix from '../components/traceability/TraceabilityMatrix.jsx'
import { LINK_TYPE, REQ_TYPE } from '../utils/constants.js'
import { IconMatrix } from '../components/common/Icons.jsx'

export default function Traceability() {
  const { requirements, testCases: allTestCases, links } = useApp()
  const { t } = useLang()

  const systemReqs = useMemo(
    () =>
      requirements
        .filter((r) => r.type === REQ_TYPE.SYSTEM)
        .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true })),
    [requirements],
  )
  const softwareReqs = useMemo(
    () =>
      requirements
        .filter((r) => r.type === REQ_TYPE.SOFTWARE)
        .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true })),
    [requirements],
  )
  const hardwareReqs = useMemo(
    () =>
      requirements
        .filter((r) => r.type === REQ_TYPE.HARDWARE)
        .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true })),
    [requirements],
  )
  const testCases = useMemo(
    () =>
      [...allTestCases].sort((a, b) =>
        a.text_id.localeCompare(b.text_id, undefined, { numeric: true }),
      ),
    [allTestCases],
  )
  // Satisfies: hem Yazilim hem Donanim, Sistem gereksinimlerini karsilar.
  const satisfierReqs = useMemo(
    () => [...softwareReqs, ...hardwareReqs],
    [softwareReqs, hardwareReqs],
  )
  // Verifies: Sistem / Yazilim / Donanim gereksinimleri test ile dogrulanabilir.
  const verifiableReqs = useMemo(
    () => [...systemReqs, ...softwareReqs, ...hardwareReqs],
    [systemReqs, softwareReqs, hardwareReqs],
  )

  // Hizli arama icin bag kumeleri.
  const satisfiesSet = useMemo(
    () =>
      new Set(
        links.filter((l) => l.type === LINK_TYPE.SATISFIES).map((l) => `${l.fromId}|${l.toId}`),
      ),
    [links],
  )
  const verifiesSet = useMemo(
    () =>
      new Set(
        links.filter((l) => l.type === LINK_TYPE.VERIFIES).map((l) => `${l.fromId}|${l.toId}`),
      ),
    [links],
  )

  const totalSatisfies = satisfiesSet.size
  const totalVerifies = verifiesSet.size

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
          <IconMatrix size={22} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('trace.intro', { req: t('nav.requirements') })}
          </p>
        </div>
        <div className="flex gap-3 text-center">
          <div className="rounded-lg bg-violet-50 px-4 py-2 dark:bg-violet-900/20">
            <div className="text-xl font-extrabold text-violet-600 dark:text-violet-300">
              {totalSatisfies}
            </div>
            <div className="text-[11px] font-semibold uppercase text-slate-400">Satisfies</div>
          </div>
          <div className="rounded-lg bg-brand-50 px-4 py-2 dark:bg-brand-900/20">
            <div className="text-xl font-extrabold text-brand-600 dark:text-brand-300">
              {totalVerifies}
            </div>
            <div className="text-[11px] font-semibold uppercase text-slate-400">Verifies</div>
          </div>
        </div>
      </div>

      <TraceabilityMatrix
        title={t('trace.m1Title')}
        description={t('trace.m1Desc')}
        rows={systemReqs}
        cols={satisfierReqs}
        hasLink={(row, col) => satisfiesSet.has(`${row.id}|${col.id}`)}
        accent="violet"
      />

      <TraceabilityMatrix
        title={t('trace.m2Title')}
        description={t('trace.m2Desc')}
        rows={verifiableReqs}
        cols={testCases}
        hasLink={(row, col) => verifiesSet.has(`${row.id}|${col.id}`)}
        accent="brand"
      />
    </div>
  )
}
