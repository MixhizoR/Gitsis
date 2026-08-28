// ============================================================================
//  Hierarchy.jsx  —  Hiyerarsi gereksinim sayfasi (User / System / Sub-system).
//  Tek bilesen, `pageKey` ile hangi hiyerarsi seviyesinin gosterilecegini
//  belirler (REQ_PAGES yapilandirmasi). Tip kilitli, Alan dinamik, durum
//  otomatik. Satisfies baglari LinkManager ile yonetilir.
//  Toplu islem: coklu secim + 5 sn geri alinabilir toplu silme + toplu linkle.
//  Izin/onay: 12 kademeli RBAC (can) + consensus onay + kilit (freeze).
//  pageKey ayni zamanda izin bileson anahtaridir (req-user / req-system / ...).
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import EntityTable from '../components/common/EntityTable.jsx'
import RequirementForm from '../components/requirements/RequirementForm.jsx'
import FieldManager from '../components/requirements/FieldManager.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import ImpactAnalysisModal from '../components/traceability/ImpactAnalysisModal.jsx'
import BulkActionBar from '../components/common/BulkActionBar.jsx'
import BulkLinkModal from '../components/common/BulkLinkModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import ApprovalMatrixModal from '../components/common/ApprovalMatrixModal.jsx'
import { IconPlus } from '../components/common/Icons.jsx'
import { REQ_PAGES } from '../utils/constants.js'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { useUndoableDelete } from '../hooks/useUndoableDelete.js'

export default function Hierarchy({ pageKey }) {
  const cfg = REQ_PAGES[pageKey]
  const {
    requirements,
    links,
    approvals,
    bulkRemoveRequirements,
    editRequirement,
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
  const [fieldMgr, setFieldMgr] = useState(false)
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)
  const [viewRow, setViewRow] = useState(null)
  const [matrixRow, setMatrixRow] = useState(null)
  const [impactRow, setImpactRow] = useState(null)

  const comp = pageKey // izin bileson anahtari = sayfa anahtari
  const types = useMemo(() => cfg?.typeOptions || [], [cfg])

  // --- Izin cozumleyiciler ---------------------------------------------------
  const myVoterId = isPM ? 'PM' : currentUser?.personnelId
  const canRead = can('read', comp)
  const canAdd = can('add_requirement', comp)
  const canFields = can('manage_fields')
  const canEditRow = () => can('write', comp)
  const canDeleteRow = () => can('delete', comp)
  const canLinksRow = () => can('link_satisfies', comp)
  const canApproveRow = () => can('approve', comp)

  // 5 sn geri alinabilir toplu silme.
  const del = useUndoableDelete(bulkRemoveRequirements)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return requirements
      .filter((r) => types.includes(r.type))
      .filter((r) =>
        !needle ? true : `${r.text_id} ${r.title} ${r.description}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true }))
  }, [requirements, types, q])

  // Bekleyen (soft-delete) satirlari gizle.
  const visibleRows = useMemo(() => rows.filter((r) => !pendingSet.has(r.id)), [rows, pendingSet])
  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])
  const sel = useBulkSelection(visibleIds)

  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length

  // --- Onay bilgisi ----------------------------------------------------------
  const approvalInfoFor = (r) => ({
    approved: r.approvalStatus === 'Approved',
    voted: approvals.some(
      (a) => a.entityType === 'requirement' && a.entityId === r.id && a.voterId === myVoterId,
    ),
  })

  const toggleApprove = (r) => {
    voteApproval({
      entityType: 'requirement',
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
  const openEdit = (r) => {
    setEditing(r)
    setFormOpen(true)
  }
  const saveDescription = (r, html) => editRequirement(r.id, { description: html })

  const handleDelete = (r) => {
    del.schedule([r.id])
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
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{cfg.navLabel}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              {visibleRows.length}
            </span>{' '}
            {t('req.records')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canFields && (
            <button onClick={() => setFieldMgr(true)} className="btn-secondary">
              {t('field.manage')}
            </button>
          )}
          {canAdd && (
            <button onClick={openCreate} className="btn-primary">
              <IconPlus size={18} /> {cfg.addLabel}
            </button>
          )}
        </div>
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
        columns={['type', 'field', 'priority', 'dal', 'links']}
        linkCountFor={linkCountFor}
        onView={canRead ? setViewRow : undefined}
        onEdit={openEdit}
        onDelete={handleDelete}
        onManageLinks={setLinkTarget}
        onImpact={setImpactRow}
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

      <RequirementForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        pageConfig={cfg}
      />
      <FieldManager open={fieldMgr} onClose={() => setFieldMgr(false)} />
      <LinkManager
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        subject={linkTarget}
        subjectKind="requirement"
      />
      <BulkLinkModal
        open={bulkLinkOpen}
        onClose={() => setBulkLinkOpen(false)}
        subjectKind="requirement"
        sources={selectedRows}
        onDone={sel.clear}
      />
      <ViewModal
        open={Boolean(viewRow)}
        row={viewRow}
        canWrite={can('write', comp)}
        showStatus={false}
        onClose={() => setViewRow(null)}
        onSaveDescription={saveDescription}
      />
      <ImpactAnalysisModal
        open={Boolean(impactRow)}
        onClose={() => setImpactRow(null)}
        requirement={impactRow}
      />
      <ApprovalMatrixModal
        open={Boolean(matrixRow)}
        entityType="requirement"
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
