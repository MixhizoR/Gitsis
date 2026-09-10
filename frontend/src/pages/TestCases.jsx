// ============================================================================
//  TestCases.jsx  —  Test senaryosu sayfasi (Acceptance / System / Sub-system).
//  Tek bilesen, `pageKey` ile hangi test tipinin gosterilecegini belirler
//  (TEST_PAGES). Tip kilitli. Verifies bagi (strict) LinkManager ile yonetilir.
//  Test SONUCU (Passed/Failed/In Review) formdan ELLE girilmez: tablodaki
//  Onay (checkmark, tam konsensus) / Reddet (tek yetkili, derhal) aksiyonlarindan
//  turetilir; bu sonuc backend'de bagli gereksinim(ler)e cascade edilir (bkz.
//  cascade.js, server.js recomputeApproval/reject).
//  Toplu islem: coklu secim + 5 sn geri alinabilir toplu silme + toplu linkle.
//  Izin/onay: 12 kademeli RBAC (can) + consensus onay + kilit (freeze).
//  pageKey ayni zamanda izin bileson anahtaridir (test-acceptance / ...).
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import EntityTable from '../components/common/EntityTable.jsx'
import TestForm from '../components/tests/TestForm.jsx'
import AttributeManager from '../components/requirements/AttributeManager.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import BulkActionBar from '../components/common/BulkActionBar.jsx'
import BulkLinkModal from '../components/common/BulkLinkModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import ApprovalMatrixModal from '../components/common/ApprovalMatrixModal.jsx'
import ReasonModal from '../components/common/ReasonModal.jsx'
import FilterBar, { FilterSummary } from '../components/common/FilterBar.jsx'
import { TypeBadge } from '../components/common/Badge.jsx'
import { IconPlus } from '../components/common/Icons.jsx'
import { TEST_PAGES } from '../utils/constants.js'
import { suspectLinksForTestCase } from '../utils/suspect.js'
import { getDisplayLabel } from '../utils/format.js'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { useUndoableDelete } from '../hooks/useUndoableDelete.js'
import { useEntityFilters, matchesFilters } from '../hooks/useEntityFilters.js'
import { filterableAttrDefs, testStatusOptions } from '../utils/filterOptions.js'

export default function TestCases({
  pageKey,
  navKey = pageKey,
  titleOverride = null,
  fieldFilter = null,
  onOpenSuspect,
}) {
  // titleOverride / fieldFilter: menuye eklenen OZEL sayfalar icin (Issue #9).
  const cfg = TEST_PAGES[pageKey]
  const {
    testCases,
    links,
    fields,
    attributeDefs,
    personnel,
    approvals,
    bulkRemoveTestCases,
    editTestCase,
    voteApproval,
    unlockApproval,
    rejectApproval,
    getApprovalMatrix,
  } = useApp()
  const { t } = useLang()
  const { can, isPM, currentUser } = useAuth()
  const fx = useEntityFilters(navKey)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)
  const [viewRow, setViewRow] = useState(null)
  const [matrixRow, setMatrixRow] = useState(null)
  const [attrMgr, setAttrMgr] = useState(false)
  // Silme oncesi zorunlu gerekce (izlenebilirlik) — bkz. ReasonModal.
  const [deleteTarget, setDeleteTarget] = useState(null) // { ids, label } | null

  const comp = pageKey // izin bileson anahtari = sayfa anahtari
  // Test sayfalari daima tek tipe kilitlidir (TEST_PAGES); tabloda tekrari
  // onlemek icin 'type' sutunu kaldirilir, baslik yaninda rozet gosterilir.
  // ATANAN KISI sutunu yoktur: atama coklu oldugu icin satiri sisirirdi;
  // atananlar goz (Read) ikonuyla acilan ViewModal'da sirayla gorunur.
  const tableColumns = useMemo(
    () => (cfg?.lockedType ? ['field', 'status', 'links'] : ['type', 'field', 'status', 'links']),
    [cfg],
  )
  // Bug fix: backend oy kaydini PM'in GERCEK kullanici id'siyle saklar
  // (bkz. server.js /approvals/vote: voterId = req.auth.userId), 'PM' sabit
  // dizgesiyle degil. Burada da 'PM' kullanilirsa PM kendi oyunu verdikten
  // hemen sonra "oy verildi" gorunumu HICBIR ZAMAN gorunmuyordu (Issue #53'te
  // ayni sinif hata cascade.js'te duzeltilmisti; bu sayfada kalmisti).
  const myVoterId = isPM ? currentUser?.id : currentUser?.personnelId
  const canRead = can('read', comp)
  const canAdd = can('add_test', comp)
  const canFields = can('manage_fields')
  const canEditRow = () => can('write', comp)
  const canDeleteRow = () => can('delete', comp)
  const canLinksRow = () => can('link_verifies', comp)
  // Kilitli (tam onaylanmis/reddedilmis) bir kayitta yalnizca PM oy/red
  // butonlarini kullanabilir (backend de ayni kurali uygular) — aksi halde
  // buton etkin gorunup 403 ile sessizce basarisiz olurdu.
  const canApproveRow = (r) => can('approve', comp) && (!r?.locked || isPM)

  const del = useUndoableDelete(bulkRemoveTestCases)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  // Test sayfalari DAIMA tek tipe kilitlidir (TEST_PAGES), bu yuzden filtre
  // cubugunda Tip secenegi gosterilmez — tablodaki 'type' sutunuyla ayni kural.
  // Durum burada test SONUCUDUR; gereksinim sayfalarindaki "dogrulanamaz"
  // ayrimi test tarafinda anlamsizdir (bkz. filterOptions.js).
  const filterAttrDefs = useMemo(
    () => filterableAttrDefs(attributeDefs, 'testcase'),
    [attributeDefs],
  )
  const statusOptions = useMemo(() => testStatusOptions(), [])

  const rows = useMemo(() => {
    const statusOf = (tc) => tc.status
    return testCases
      .filter((tc) => tc.type === cfg?.lockedType)
      .filter((tc) => !fieldFilter || tc.field === fieldFilter)
      .filter((tc) => matchesFilters(tc, fx.filters, statusOf, filterAttrDefs))
      .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true }))
  }, [testCases, cfg, fx.filters, fieldFilter, filterAttrDefs])

  const visibleRows = useMemo(() => rows.filter((r) => !pendingSet.has(r.id)), [rows, pendingSet])
  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])
  const sel = useBulkSelection(visibleIds)

  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length

  // Issue #57: testin supheli GIRIS bag sayisi (gelen Verifies) — gosterge.
  const suspectCountFor = (tc) => suspectLinksForTestCase(links, tc.id).length

  // --- Onay bilgisi ----------------------------------------------------------
  const approvalInfoFor = (r) => ({
    approved: r.approvalStatus === 'Approved',
    voted: approvals.some(
      (a) => a.entityType === 'testcase' && a.entityId === r.id && a.voterId === myVoterId,
    ),
  })

  const toggleApprove = (r) => {
    voteApproval({
      entityType: 'testcase',
      entityId: r.id,
      voterId: myVoterId,
      voterName: currentUser?.name || (isPM ? 'Proje Yoneticisi' : ''),
      personnelId: isPM ? null : currentUser?.personnelId,
    })
  }
  // Testi DERHAL "Failed" yapar — tam konsensus GEREKMEZ, tek yetkili yeterli.
  const handleReject = (r) => rejectApproval({ entityId: r.id })

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (tc) => {
    setEditing(tc)
    setFormOpen(true)
  }
  const saveDescription = (r, html) => editTestCase(r.id, { description: html })

  const handleDelete = (tc) => {
    setDeleteTarget({ ids: [tc.id], label: `${tc.text_id} — ${getDisplayLabel(tc).text}` })
  }
  const handleBulkDelete = () => {
    if (sel.count === 0) return
    setDeleteTarget({ ids: sel.selectedIds, label: `${sel.count} ${t('test.records')}` })
  }
  const confirmDelete = async (reason) => {
    const { ids } = deleteTarget
    sel.clear()
    await del.schedule(ids, reason)
    setDeleteTarget(null)
  }

  const selectedRows = useMemo(
    () => visibleRows.filter((r) => sel.selectedSet.has(r.id)),
    [visibleRows, sel.selectedSet],
  )

  if (!cfg) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {titleOverride || cfg.navLabel}
            </h2>
            {cfg.lockedType && <TypeBadge value={cfg.lockedType} />}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <FilterSummary
              count={visibleRows.length}
              label={t('test.records')}
              activeCount={fx.activeCount}
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canFields && (
            <button onClick={() => setAttrMgr(true)} className="btn-secondary">
              {t('attr.manage')}
            </button>
          )}
          {canAdd && (
            <button onClick={openCreate} className="btn-primary">
              <IconPlus size={18} /> {cfg.addLabel}
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={fx.filters}
        onSet={fx.set}
        onSetAttr={fx.setAttr}
        onClear={fx.clear}
        fields={fieldFilter ? null : fields}
        statusOptions={statusOptions}
        assignees={personnel}
        attrDefs={filterAttrDefs}
        activeCount={fx.activeCount}
      />

      <BulkActionBar
        count={sel.count}
        onDelete={canDeleteRow() ? handleBulkDelete : undefined}
        onLink={canLinksRow() ? () => setBulkLinkOpen(true) : undefined}
        onClear={sel.clear}
        canLink={canLinksRow()}
      />

      <EntityTable
        rows={visibleRows}
        columns={tableColumns}
        attributeEntityType="testcase"
        statusLabel={t('tbl.th.testResult')}
        linkCountFor={linkCountFor}
        suspectCountFor={suspectCountFor}
        onOpenSuspect={onOpenSuspect}
        onView={canRead ? setViewRow : undefined}
        onEdit={openEdit}
        onDelete={handleDelete}
        onManageLinks={setLinkTarget}
        canEditRow={canEditRow}
        canDeleteRow={canDeleteRow}
        canManageLinksRow={canLinksRow}
        showApproval
        canApproveRow={canApproveRow}
        approvalInfoFor={approvalInfoFor}
        onToggleApprove={toggleApprove}
        onReject={handleReject}
        showApprovalDetail={isPM}
        onApprovalDetail={setMatrixRow}
        selectable
        selectedIds={sel.selectedSet}
        onToggleRow={sel.toggleRow}
        onToggleAll={sel.toggleAll}
        allSelected={sel.allSelected}
        someSelected={sel.someSelected}
      />

      <TestForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        pageConfig={cfg}
      />
      <AttributeManager open={attrMgr} onClose={() => setAttrMgr(false)} />
      <LinkManager
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        subject={linkTarget}
        subjectKind="test"
      />
      <BulkLinkModal
        open={bulkLinkOpen}
        onClose={() => setBulkLinkOpen(false)}
        subjectKind="test"
        sources={selectedRows}
        onDone={sel.clear}
      />
      <ViewModal
        open={Boolean(viewRow)}
        row={viewRow}
        canWrite={can('write', comp)}
        onClose={() => setViewRow(null)}
        onSaveDescription={saveDescription}
        statusLabel={t('tbl.th.testResult')}
        commentEntityType="testcase"
      />
      <ApprovalMatrixModal
        open={Boolean(matrixRow)}
        entityType="testcase"
        row={matrixRow}
        onClose={() => setMatrixRow(null)}
        onFetch={getApprovalMatrix}
        onUnlock={(et, id) => unlockApproval({ entityType: et, entityId: id })}
      />
      <UndoToast
        open={del.isPending}
        count={del.pendingIds.length}
        secondsLeft={del.secondsLeft}
        onUndo={del.undo}
      />
      <ReasonModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemLabel={deleteTarget?.label}
      />
    </div>
  )
}
