// ============================================================================
//  TestCases.jsx  —  Test senaryosu sayfasi (Acceptance / System / Sub-system).
//  Tek bilesen, `pageKey` ile hangi test tipinin gosterilecegini belirler
//  (TEST_PAGES). Tip kilitli. Verifies bagi (strict) + zorunlu test durumu
//  LinkManager ile yonetilir; secilen durum backend'de gereksinime cascade edilir.
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
import LinkManager from '../components/traceability/LinkManager.jsx'
import BulkActionBar from '../components/common/BulkActionBar.jsx'
import BulkLinkModal from '../components/common/BulkLinkModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import ApprovalMatrixModal from '../components/common/ApprovalMatrixModal.jsx'
import { IconPlus } from '../components/common/Icons.jsx'
import { TEST_PAGES } from '../utils/constants.js'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { useUndoableDelete } from '../hooks/useUndoableDelete.js'

export default function TestCases({ pageKey, titleOverride = null, fieldFilter = null }) {
  // titleOverride / fieldFilter: menuye eklenen OZEL sayfalar icin (Issue #9).
  const cfg = TEST_PAGES[pageKey]
  const {
    testCases,
    links,
    approvals,
    bulkRemoveTestCases,
    editTestCase,
    voteApproval,
    unlockApproval,
    getApprovalMatrix,
  } = useApp()
  const { t } = useLang()
  const { can, isPM, currentUser } = useAuth()
  const [q, setQ] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)
  const [viewRow, setViewRow] = useState(null)
  const [matrixRow, setMatrixRow] = useState(null)

  const comp = pageKey // izin bileson anahtari = sayfa anahtari
  const myVoterId = isPM ? 'PM' : currentUser?.personnelId
  const canRead = can('read', comp)
  const canAdd = can('add_test', comp)
  const canEditRow = () => can('write', comp)
  const canDeleteRow = () => can('delete', comp)
  const canLinksRow = () => can('link_verifies', comp)
  const canApproveRow = () => can('approve', comp)

  const del = useUndoableDelete(bulkRemoveTestCases)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return testCases
      .filter((tc) => tc.type === cfg?.lockedType)
      .filter((tc) => !fieldFilter || tc.field === fieldFilter)
      .filter((tc) =>
        !needle
          ? true
          : `${tc.text_id} ${tc.title} ${tc.description}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true }))
  }, [testCases, cfg, q, fieldFilter])

  const visibleRows = useMemo(() => rows.filter((r) => !pendingSet.has(r.id)), [rows, pendingSet])
  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])
  const sel = useBulkSelection(visibleIds)

  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length

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
    del.schedule([tc.id])
  }
  const handleBulkDelete = () => {
    if (sel.count === 0) return
    const ids = sel.selectedIds
    sel.clear()
    del.schedule(ids)
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
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {titleOverride || cfg.navLabel}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              {visibleRows.length}
            </span>{' '}
            {t('test.records')}
          </p>
        </div>
        {canAdd && (
          <button onClick={openCreate} className="btn-primary">
            <IconPlus size={18} /> {cfg.addLabel}
          </button>
        )}
      </div>

      <input
        className="input !py-1.5 text-sm"
        placeholder={t('filt.searchPh')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
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
        columns={['type', 'field', 'priority', 'status', 'dal', 'links']}
        statusLabel={t('tbl.th.testResult')}
        linkCountFor={linkCountFor}
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
    </div>
  )
}
