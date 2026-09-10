// ============================================================================
//  Hierarchy.jsx  —  Hiyerarsi gereksinim sayfasi (User / System / Sub-system).
//  Tek bilesen, `pageKey` ile hangi hiyerarsi seviyesinin gosterilecegini
//  belirler (REQ_PAGES yapilandirmasi). Tip kilitli, Alan dinamik, durum
//  otomatik. Satisfies baglari LinkManager ile yonetilir.
//  Toplu islem: coklu secim + 5 sn geri alinabilir toplu silme + toplu linkle.
//  Izin: 12 kademeli RBAC (can). Gereksinimler KENDI baslarina onaylanmaz;
//  Durum sutunu bu gereksinimi DOGRULAYAN test senaryolarindan turetilir
//  (bkz. verifiedFor) — onay/kilit yalnizca test tarafinda (bkz. TestCases.jsx).
//  pageKey ayni zamanda izin bileson anahtaridir (req-user / req-system / ...).
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import EntityTable from '../components/common/EntityTable.jsx'
import RequirementForm from '../components/requirements/RequirementForm.jsx'
import FieldManager from '../components/requirements/FieldManager.jsx'
import AttributeManager from '../components/requirements/AttributeManager.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import ImpactAnalysisModal from '../components/traceability/ImpactAnalysisModal.jsx'
import BulkActionBar from '../components/common/BulkActionBar.jsx'
import BulkLinkModal from '../components/common/BulkLinkModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import SourceDocumentModal from '../components/documents/SourceDocumentModal.jsx'
import ReasonModal from '../components/common/ReasonModal.jsx'
import FilterBar, { FilterSummary } from '../components/common/FilterBar.jsx'
import { TypeBadge } from '../components/common/Badge.jsx'
import { IconPlus } from '../components/common/Icons.jsx'
import { REQ_PAGES, LINK_TYPE } from '../utils/constants.js'
import { suspectLinksForRequirement } from '../utils/suspect.js'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { useUndoableDelete } from '../hooks/useUndoableDelete.js'
import { useEntityFilters, matchesFilters } from '../hooks/useEntityFilters.js'
import {
  filterableAttrDefs,
  requirementStatusOptions,
  requirementStatusOf,
} from '../utils/filterOptions.js'

export default function Hierarchy({
  pageKey,
  navKey = pageKey,
  titleOverride = null,
  fieldFilter = null,
  typeFilter = null,
  onOpenSuspect,
}) {
  // titleOverride / fieldFilter / typeFilter: kullanicinin menuye ekledigi
  // OZEL sayfalar icin (Issue #9). Gereksinim TIPLERI sabittir; ozel sayfa
  // ayni tipin Alan (disiplin) ve/veya Tip (yalnizca req-subsystem: Software/
  // Hardware) filtresiyle daraltilmis gorunumudur.
  const cfg = REQ_PAGES[pageKey]
  // typeFilter yalnizca sayfanin zaten sundugu tiplerden biriyse gecerlidir
  // (orn. req-subsystem'de 'Software Requirement'); aksi halde yoksayilir.
  const effectiveCfg = useMemo(() => {
    if (!cfg || !typeFilter || !cfg.typeOptions?.includes(typeFilter)) return cfg
    return { ...cfg, typeOptions: [typeFilter], lockedType: typeFilter }
  }, [cfg, typeFilter])
  const {
    requirements,
    links,
    fields,
    attributeDefs,
    personnel,
    bulkRemoveRequirements,
    editRequirement,
    projectId,
  } = useApp()
  const { t } = useLang()
  const { can } = useAuth()
  const fx = useEntityFilters(navKey)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [fieldMgr, setFieldMgr] = useState(false)
  const [attrMgr, setAttrMgr] = useState(false)
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)
  const [viewRow, setViewRow] = useState(null)
  // Kaynak dokumani acilacak gereksinim (ViewModal "Kaynak" satirindan).
  const [sourceRow, setSourceRow] = useState(null)
  const [impactRow, setImpactRow] = useState(null)
  // Silme oncesi zorunlu gerekce (izlenebilirlik) — bkz. ReasonModal.
  const [deleteTarget, setDeleteTarget] = useState(null) // { ids, label } | null

  const comp = pageKey // izin bileson anahtari = sayfa anahtari
  const types = useMemo(() => effectiveCfg?.typeOptions || [], [effectiveCfg])
  // Tip kilitliyse (tek tip) tablo sutununda tekrari onlemek icin kaldirilir;
  // bunun yerine baslik yaninda tek bir rozet olarak gosterilir. Gereksinimler
  // artik KENDI baslarina onaylanmaz (Issue: onay tuslari kaldirildi) — Durum
  // sutunu bu gereksinimi DOGRULAYAN test senaryolarindan turetilir.
  // ATANAN KISI sutunu yoktur: atama coklu oldugu icin satiri sisirirdi;
  // atananlar goz (Read) ikonuyla acilan ViewModal'da sirayla gorunur.
  const tableColumns = useMemo(
    () =>
      effectiveCfg?.lockedType
        ? ['field', 'status', 'links']
        : ['type', 'field', 'status', 'links'],
    [effectiveCfg],
  )
  // Bu gereksinimi dogrulayan (Verifies) en az bir test bagli mi? Degilse
  // "Dogrulanamaz" gosterilir — durum r.status'tan degil, baglantidan okunur.
  const verifiedFor = (r) => links.some((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === r.id)

  // --- Izin cozumleyiciler ---------------------------------------------------
  const canRead = can('read', comp)
  const canAdd = can('add_requirement', comp)
  const canFields = can('manage_fields')
  const canEditRow = () => can('write', comp)
  const canDeleteRow = () => can('delete', comp)
  const canLinksRow = () => can('link_satisfies', comp)

  // 5 sn geri alinabilir toplu silme.
  const del = useUndoableDelete(bulkRemoveRequirements)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  // Filtre cubugu secenekleri: Alan projeye gore dinamiktir, oznitelikler
  // runtime'da eklenip silinebilir; Tip yalnizca sayfa tek tipe kilitli
  // DEGILSE anlamlidir (tablo 'type' sutunuyla ayni kural, bkz. tableColumns).
  const filterAttrDefs = useMemo(
    () => filterableAttrDefs(attributeDefs, 'requirement'),
    [attributeDefs],
  )
  const statusOptions = useMemo(() => requirementStatusOptions(t), [t])

  const rows = useMemo(() => {
    const statusOf = (r) => requirementStatusOf(r, verifiedFor)
    return requirements
      .filter((r) => types.includes(r.type))
      .filter((r) => !fieldFilter || r.field === fieldFilter)
      .filter((r) => matchesFilters(r, fx.filters, statusOf, filterAttrDefs))
      .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true }))
    // verifiedFor `links` uzerinden hesaplanir; bagimlilik olarak links yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, types, fx.filters, fieldFilter, links, filterAttrDefs])

  // Bekleyen (soft-delete) satirlari gizle.
  const visibleRows = useMemo(() => rows.filter((r) => !pendingSet.has(r.id)), [rows, pendingSet])
  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])
  const sel = useBulkSelection(visibleIds)

  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length

  // Issue #57: satirin supheli (suspect) cikis bag sayisi — gosterge + yonlendirme.
  const suspectCountFor = (r) => suspectLinksForRequirement(links, r.id).length

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
    setDeleteTarget({ ids: [r.id], label: `${r.text_id} — ${r.title}` })
  }
  const handleBulkDelete = () => {
    if (sel.count === 0) return
    setDeleteTarget({ ids: sel.selectedIds, label: `${sel.count} ${t('req.records')}` })
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
              {titleOverride || effectiveCfg.navLabel}
            </h2>
            {effectiveCfg.lockedType && <TypeBadge value={effectiveCfg.lockedType} />}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <FilterSummary
              count={visibleRows.length}
              label={t('req.records')}
              activeCount={fx.activeCount}
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canFields && (
            <button onClick={() => setFieldMgr(true)} className="btn-secondary">
              {t('field.manage')}
            </button>
          )}
          {canFields && (
            <button onClick={() => setAttrMgr(true)} className="btn-secondary">
              {t('attr.manage')}
            </button>
          )}
          {canAdd && (
            <button onClick={openCreate} className="btn-primary">
              <IconPlus size={18} /> {effectiveCfg.addLabel}
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={fx.filters}
        onSet={fx.set}
        onSetAttr={fx.setAttr}
        onClear={fx.clear}
        types={effectiveCfg.lockedType ? null : types}
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
        attributeEntityType="requirement"
        linkCountFor={linkCountFor}
        suspectCountFor={suspectCountFor}
        onOpenSuspect={onOpenSuspect}
        onView={canRead ? setViewRow : undefined}
        onEdit={openEdit}
        onDelete={handleDelete}
        onManageLinks={setLinkTarget}
        onImpact={setImpactRow}
        canEditRow={canEditRow}
        canDeleteRow={canDeleteRow}
        canManageLinksRow={canLinksRow}
        statusLabel={t('tbl.th.verification')}
        verifiedFor={verifiedFor}
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
        pageConfig={effectiveCfg}
      />
      <FieldManager open={fieldMgr} onClose={() => setFieldMgr(false)} />
      <AttributeManager open={attrMgr} onClose={() => setAttrMgr(false)} />
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
        showHistory
        onClose={() => setViewRow(null)}
        onSaveDescription={saveDescription}
        onOpenSource={setSourceRow}
        commentEntityType="requirement"
      />
      {/* Kaynak izlenebilirligi: dokumani Metin modunda acip pasaji vurgular. */}
      <SourceDocumentModal
        requirement={sourceRow}
        projectId={projectId}
        onClose={() => setSourceRow(null)}
      />
      <ImpactAnalysisModal
        open={Boolean(impactRow)}
        onClose={() => setImpactRow(null)}
        requirement={impactRow}
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
