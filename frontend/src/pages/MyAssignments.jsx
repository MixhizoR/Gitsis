// ============================================================================
//  MyAssignments.jsx  —  "Bana Atananlar": oturum acan PERSONELIN sorumlu
//  oldugu gereksinimler ve test senaryolari.
//
//  Sozlukteki "Assigned To" izlenebilirlik BAGI (terim <-> gereksinim) ile
//  ilgisi YOKTUR; burada listelenen, dogrudan bu kisiye verilmis islerdir.
//  Atama COKLUDUR: bir kayitta birden fazla sorumlu olabilir, kisi
//  atananlardan biriyse kayit onun kuyrugunda da gorunur.
//
//  RBAC: atama, kaydi PM'in acikca bu kisiye VERMESIDIR; bu yuzden liste
//  ayri bir izne baglanmaz — kisi kendi is kuyrugunu daima gorur. Satirdaki
//  DETAY (goz) aksiyonu ise diger sayfalardaki ile ayni 'read' iznine
//  baglidir, boylece izin matrisi tek kaynak olarak kalir. Yorum yazma da
//  ayni kapidan gecer: backend "kaydi OKUYABILEN yorum yazabilir" kuralini
//  uygular (bkz. comments.js assertCanComment), yani modali acabilen kisi
//  yorum da yazabilir.
//
//  Sayfa PM oturumunda menude GORUNMEZ (bkz. Sidebar.jsx): PM'in personel
//  kimligi yoktur, dolayisiyla kendisine atanmis is de olamaz.
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import EntityTable from '../components/common/EntityTable.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import { componentKeyOf } from '../utils/permissions.js'
import { isAssignedTo } from '../utils/assignees.js'
import { LINK_TYPE } from '../utils/constants.js'

export default function MyAssignments() {
  const { requirements, testCases, links } = useApp()
  const { currentUser, can } = useAuth()
  const { t } = useLang()
  // Modal iki bolum tarafindan paylasilir; yorum sekmesi dogru varlik turunu
  // bilmek zorunda oldugu icin satirla birlikte tur de tasinir.
  const [viewTarget, setViewTarget] = useState(null) // { row, entityType } | null

  // Issue #97/A: atama User tabanli — kimlik her zaman kullanici id'sidir.
  const myId = currentUser?.id || null

  const byTextId = (a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true })
  // Coklu atama: kayitta atananlardan BIRI bu kisiyse is kuyruguna girer.
  const myRequirements = useMemo(
    () => (myId ? requirements.filter((r) => isAssignedTo(r, myId)).sort(byTextId) : []),
    [requirements, myId],
  )
  const myTests = useMemo(
    () => (myId ? testCases.filter((tc) => isAssignedTo(tc, myId)).sort(byTextId) : []),
    [testCases, myId],
  )

  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length
  // Gereksinim sayfalariyla ayni kural: durum, DOGRULAYAN testten turetilir.
  const verifiedFor = (r) => links.some((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === r.id)
  const canReadRequirement = (r) => can('read', componentKeyOf('requirement', r.type))
  const canReadTest = (tc) => can('read', componentKeyOf('test', tc.type))
  // Bu sayfa salt okunurdur: duzenleme/silme kendi sayfalarindan yapilir.
  const never = () => false

  if (!myId) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.myWork')}</h2>
        <div className="card px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('myWork.empty')}
        </div>
      </div>
    )
  }

  const section = (titleKey, rows, opts) => (
    <div className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t(titleKey)} <span className="text-slate-800 dark:text-slate-100">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-400">{t('myWork.empty')}</div>
      ) : (
        <EntityTable
          rows={rows}
          columns={['type', 'field', 'status', 'links']}
          linkCountFor={linkCountFor}
          canEditRow={never}
          canDeleteRow={never}
          canManageLinksRow={never}
          {...opts}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.myWork')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-800 dark:text-slate-100" data-testid="mywork-total">
            {myRequirements.length + myTests.length}
          </span>{' '}
          {t('myWork.records')}
        </p>
      </div>

      {section('myWork.requirements', myRequirements, {
        attributeEntityType: 'requirement',
        statusLabel: t('tbl.th.verification'),
        verifiedFor,
        onView: (r) =>
          canReadRequirement(r) ? setViewTarget({ row: r, entityType: 'requirement' }) : null,
      })}

      {section('myWork.tests', myTests, {
        attributeEntityType: 'testcase',
        statusLabel: t('tbl.th.testResult'),
        onView: (tc) =>
          canReadTest(tc) ? setViewTarget({ row: tc, entityType: 'testcase' }) : null,
      })}

      {/* Aciklama salt okunur (duzenleme kendi sayfasindan yapilir), ancak
          YORUM sekmesi acilir: atanan kisi kayda sorulani okuyup cevap
          yazabilsin. Gereksinimlerde durum rozeti gizlenir — orada durum
          kaydin kendisinden degil, DOGRULAYAN testten turetilir. */}
      <ViewModal
        open={Boolean(viewTarget)}
        row={viewTarget?.row || null}
        canWrite={false}
        showStatus={viewTarget?.entityType !== 'requirement'}
        commentEntityType={viewTarget?.entityType || null}
        onClose={() => setViewTarget(null)}
      />
    </div>
  )
}
