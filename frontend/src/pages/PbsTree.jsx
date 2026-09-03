// ============================================================================
//  PbsTree.jsx  —  Urun Agaci (PBS) sayfasi (Issue #9).
//
//  Gereksinim sayfalari (Kullanici/Sistem/Alt Sistem) ile AYNI tablo
//  arayuzunu kullanir — EntityTable `treeMode` ile: KOD, BASLIK/TANIM, TIP,
//  ALAN, ONCELIK, DAL, BAG, ONAY, ONAY DURUMU, ISLEMLER sutunlari ve satir
//  islemleri (goruntule / bag yonet / etki analizi / duzenle / sil) birebir
//  ayni. Ustune iki sey ekler:
//    1) HIYERARSI: satirlar agac olarak girintilenir, alt kirilimlar
//       expand edildikce API'den lazy yuklenir (tum agac tek seferde CEKILMEZ)
//    2) BOLUM numarasi: DOORS tarzi anahat (1, 1.1, 3.3.2 ...)
//  Surukle-birak tasima, bolme (split) ve birlestirme (merge) korunur.
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useProject } from '../context/ProjectContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useTreeNodes, ROOT_KEY } from '../hooks/useTreeNodes.js'
import { useUndoableDelete } from '../hooks/useUndoableDelete.js'
import {
  splitRequirement,
  mergeRequirements,
  moveRequirement,
  setCodePrefix,
} from '../services/dataService.js'
import { componentKeyOf } from '../utils/permissions.js'
import { SATISFIES_PARENT_OF } from '../utils/constants.js'
import EntityTable from '../components/common/EntityTable.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import ApprovalMatrixModal from '../components/common/ApprovalMatrixModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import RequirementForm from '../components/requirements/RequirementForm.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import ImpactAnalysisModal from '../components/traceability/ImpactAnalysisModal.jsx'
import SplitModal from '../components/tree/SplitModal.jsx'
import PrefixModal from '../components/tree/PrefixModal.jsx'
import MergeModal from '../components/tree/MergeModal.jsx'
import {
  IconSearch,
  IconLoader,
  IconLink,
  IconUnlink,
  IconPlus,
  IconEdit,
} from '../components/common/Icons.jsx'
import { REQ_PAGES, REQ_TYPE, DEFAULT_CODE_PREFIX } from '../utils/constants.js'

export default function PbsTree() {
  const {
    projectId,
    requirements,
    links,
    approvals,
    editRequirement,
    bulkRemoveRequirements,
    voteApproval,
    unlockApproval,
    getApprovalMatrix,
    refresh,
  } = useApp()
  const { t } = useLang()
  const { can, isPM, currentUser } = useAuth()
  const { activeProject, refreshProjects } = useProject()

  const tree = useTreeNodes(projectId)
  const del = useUndoableDelete(bulkRemoveRequirements)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  const [q, setQ] = useState('')
  const [viewRow, setViewRow] = useState(null)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState(null)
  const [impactRow, setImpactRow] = useState(null)
  const [matrixRow, setMatrixRow] = useState(null)
  const [splitNode, setSplitNode] = useState(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Map()) // id -> row
  const [dragNode, setDragNode] = useState(null)
  const [prefixOpen, setPrefixOpen] = useState(false)

  const myVoterId = isPM ? 'PM' : currentUser?.personnelId

  // --- Izin cozumleyiciler (gereksinim tipine gore bilesen anahtari) --------
  const compOf = (r) => componentKeyOf('requirement', r.type)
  const canEditRow = (r) => can('write', compOf(r))
  const canDeleteRow = (r) => can('delete', compOf(r))
  const canLinksRow = (r) => can('link_satisfies', compOf(r))
  const canApproveRow = (r) => can('approve', compOf(r))
  const canReadAny = REQ_PAGES ? Object.keys(REQ_PAGES).some((k) => can('read', k)) : false
  // Ekleme yetkisi: gereksinim bilesenlerinden HERHANGI birine ekleyebiliyorsa.
  const canAddAny = Object.keys(REQ_PAGES || {}).some((k) => can('add_requirement', k))

  // PBS sayfasinda tip SABIT DEGIL: kullanici formda hangi seviyede gereksinim
  // olusturacagini secer (Kullanici/Sistem/Yazilim/Donanim).
  const PBS_FORM_CONFIG = {
    key: 'pbs-tree',
    navLabel: t('page.pbsTree.title'),
    lockedType: null,
    typeOptions: [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
    addLabel: t('pbs.addRequirement'),
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  // Kod onegi degistir; istege bagli olarak mevcut kayitlari da tasi.
  const handlePrefixSubmit = async (codePrefix, migrateExisting) => {
    await setCodePrefix(projectId, codePrefix, migrateExisting)
    await refreshProjects()
    // Agac ve duz listeler yeni kodlarla yeniden cekilsin.
    await afterMutation([ROOT_KEY, ...rows.filter((r) => r._expanded).map((r) => r.id)])
  }

  // --- Tablo yardimcilari (Hierarchy ile ayni sozlesme) --------------------
  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length
  const approvalInfoFor = (r) => ({
    approved: r.approvalStatus === 'Approved',
    voted: approvals.some(
      (a) => a.entityType === 'requirement' && a.entityId === r.id && a.voterId === myVoterId,
    ),
  })
  const toggleApprove = (r) =>
    voteApproval({
      entityType: 'requirement',
      entityId: r.id,
      voterId: myVoterId,
      voterName: currentUser?.name || (isPM ? 'Proje Yoneticisi' : ''),
      personnelId: isPM ? null : currentUser?.personnelId,
    })
  const saveDescription = (r, html) => editRequirement(r.id, { description: html })

  // --- Gorunur satirlar: arama filtresi + bekleyen silmeler haric ----------
  //  ONEMLI: arama satirlari filtrelese de AGAC YAPISI bozulmaz — girinti,
  //  bolum numarasi ve ac/kapa durumu oldugu gibi kalir.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tree.flatRows
      .filter((r) => !pendingSet.has(r.id))
      .filter((r) => (!needle ? true : `${r.text_id} ${r.title}`.toLowerCase().includes(needle)))
  }, [tree.flatRows, q, pendingSet])

  // --- Mutasyon sonrasi tazeleme ------------------------------------------
  const afterMutation = async (keys) => {
    await tree.refreshKeys(keys)
    await refresh() // duz listeler + Dashboard sayilari
  }

  const handleDelete = (r) => del.schedule([r.id])

  // --- Bolme / birlestirme -------------------------------------------------
  const selectedList = useMemo(() => [...selected.values()], [selected])
  const mergeBlockReason = (() => {
    if (selectedList.length < 2) return 'few'
    const first = selectedList[0]
    if (!selectedList.every((s) => s._parentKey === first._parentKey)) return 'notSiblings'
    if (!selectedList.every((s) => s.type === first.type)) return 'notSameType'
    return null
  })()

  const handleSplit = async (newTitles) => {
    await splitRequirement(projectId, splitNode.id, newTitles)
    await afterMutation([tree.findParentKey(splitNode.id) || ROOT_KEY])
  }

  const handleMerge = async (ids) => {
    const parentKeys = [...new Set(selectedList.map((s) => s._parentKey))]
    const survivor = await mergeRequirements(projectId, ids)
    setSelected(new Map())
    await afterMutation([...parentKeys, survivor?.id])
    return survivor
  }

  // --- Surukle-birak ile tasima (agac hiyerarsisi korunur) -----------------
  //  Client-side on-kontrol yalnizca UX icin; nihai dogrulama backend'de.
  const canDropOn = (node, target) => {
    if (!node || !canEditRow(node) || node.locked) return false
    if (target && target.id === node.id) return false
    const expectedParent = SATISFIES_PARENT_OF[node.type]
    if (!target) return !expectedParent // koke yalnizca User Requirement
    return target.type === expectedParent
  }

  const handleDrop = async (target) => {
    const node = dragNode
    setDragNode(null)
    if (!node || !canDropOn(node, target)) return
    const sourceKey = tree.findParentKey(node.id)
    const targetKey = target ? target.id : ROOT_KEY
    if (sourceKey === targetKey) return
    try {
      await moveRequirement(projectId, node.id, target ? target.id : null)
      await afterMutation([sourceKey, targetKey])
      tree.setError(null)
    } catch (err) {
      tree.setError(err?.message || t('tree.error'))
    }
  }

  const toggleSelect = (row) =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row)
      return next
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('page.pbsTree.title')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-100">{rows.length}</span>{' '}
            {t('req.records')} · {t('page.pbsTree.sub')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPM && (
            <button
              onClick={() => setPrefixOpen(true)}
              className="btn-secondary"
              data-testid="pbs-prefix-btn"
              title={t('prefix.title')}
            >
              <IconEdit size={16} /> {t('prefix.button')}
            </button>
          )}
          {canAddAny && (
            <button onClick={openCreate} className="btn-primary" data-testid="pbs-add-btn">
              <IconPlus size={18} /> {t('pbs.addRequirement')}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <IconSearch size={16} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('filt.searchPh')}
          className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
        />
      </div>

      {tree.error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          {tree.error}
        </div>
      )}

      {/* Secim seridi: bolme/birlestirme */}
      {selectedList.length > 0 && (
        <div
          data-testid="tree-selection-bar"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-800 dark:bg-brand-900/30"
        >
          <span className="font-semibold text-brand-800 dark:text-brand-200">
            {t('tree.selected', { n: selectedList.length })}
          </span>
          <button
            onClick={() => setMergeOpen(true)}
            disabled={Boolean(mergeBlockReason)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconLink size={14} /> {t('tree.merge')}
          </button>
          {selectedList.length === 1 && canEditRow(selectedList[0]) && !selectedList[0].locked && (
            <button
              onClick={() => setSplitNode(selectedList[0])}
              className="flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:border-brand-700 dark:text-brand-300"
            >
              <IconUnlink size={14} /> {t('tree.split')}
            </button>
          )}
          {mergeBlockReason && mergeBlockReason !== 'few' && (
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {t(mergeBlockReason === 'notSiblings' ? 'merge.notSiblings' : 'merge.notSameType')}
            </span>
          )}
          <button
            onClick={() => setSelected(new Map())}
            className="ml-auto text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400"
          >
            {t('tree.clearSelection')}
          </button>
        </div>
      )}

      {tree.rootLoading && !tree.rootLoaded ? (
        <div className="card flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <IconLoader size={16} className="animate-spin" />
          {t('app.loading')}
        </div>
      ) : (
        <EntityTable
          rows={rows}
          columns={['type', 'field', 'priority', 'dal', 'links']}
          linkCountFor={linkCountFor}
          // Tabloda yalnizca BASLIK gorunur; TANIM (description) satirda
          // gosterilmez — goz ikonuyla acilan ViewModal'da okunur.
          showDescription={false}
          onView={canReadAny ? setViewRow : undefined}
          onEdit={(r) => {
            setEditing(r)
            setFormOpen(true)
          }}
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
          selectedIds={new Set(selected.keys())}
          onToggleRow={(id) => {
            const row = rows.find((r) => r.id === id)
            if (row) toggleSelect(row)
          }}
          onToggleAll={() => setSelected(new Map())}
          allSelected={false}
          someSelected={selectedList.length > 0}
          treeMode
          onToggleExpand={tree.toggle}
          onRowDragStart={(r) => setDragNode(r)}
          onRowDragEnd={() => setDragNode(null)}
          onRowDrop={handleDrop}
          rowDraggable={(r) => canEditRow(r) && !r.locked}
          rowDropAllowed={(r) => canDropOn(dragNode, r)}
        />
      )}

      <RequirementForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        pageConfig={
          editing ? REQ_PAGES[componentKeyOf('requirement', editing.type)] : PBS_FORM_CONFIG
        }
      />
      <LinkManager
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        subject={linkTarget}
        subjectKind="requirement"
      />
      <ViewModal
        open={Boolean(viewRow)}
        row={viewRow}
        canWrite={viewRow ? canEditRow(viewRow) : false}
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
      <SplitModal
        open={Boolean(splitNode)}
        node={splitNode}
        onClose={() => setSplitNode(null)}
        onSubmit={handleSplit}
      />
      <MergeModal
        open={mergeOpen}
        nodes={selectedList}
        onClose={() => setMergeOpen(false)}
        onSubmit={handleMerge}
      />
      <PrefixModal
        open={prefixOpen}
        currentPrefix={activeProject?.codePrefix || DEFAULT_CODE_PREFIX}
        sampleTextId={rows[0]?.text_id || null}
        onClose={() => setPrefixOpen(false)}
        onSubmit={handlePrefixSubmit}
      />
      <UndoToast
        open={del.isPending}
        count={del.pendingIds.length}
        secondsLeft={del.secondsLeft}
        onUndo={del.undo}
      />
      {/* requirements sadece arama/istatistik icin kullanilir; agac verisi
          lazy-load ile ayri gelir. */}
      <span className="hidden">{requirements.length}</span>
    </div>
  )
}
