// ============================================================================
//  PbsTree.jsx  —  Urun Agaci (PBS) sayfasi (Issue #9).
//
//  Gereksinim sayfalari (Kullanici/Sistem/Alt Sistem) ile AYNI tablo
//  arayuzunu kullanir — EntityTable `treeMode` ile: KOD, BASLIK/TANIM, TIP,
//  ALAN, ONCELIK, DAL, BAG, ISLEMLER sutunlari ve satir islemleri (goruntule /
//  bag yonet / etki analizi / duzenle / sil) birebir ayni. Gereksinimler
//  KENDI baslarina onaylanmaz; DURUM sutunu bu gereksinimi DOGRULAYAN
//  (Verifies) test senaryolarindan turetilir (bkz. verifiedFor / Hierarchy.jsx).
//  Ustune iki sey ekler:
//    1) HIYERARSI: satirlar agac olarak girintilenir, alt kirilimlar
//       expand edildikce API'den lazy yuklenir (tum agac tek seferde CEKILMEZ)
//    2) BOLUM numarasi: DOORS tarzi anahat (1, 1.1, 3.3.2 ...)
//  Surukle-birak tasima, bolme (split) ve birlestirme (merge) korunur.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
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
import SourceDocumentModal from '../components/documents/SourceDocumentModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import ReasonModal from '../components/common/ReasonModal.jsx'
import RequirementForm from '../components/requirements/RequirementForm.jsx'
import AttributeManager from '../components/requirements/AttributeManager.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import ImpactAnalysisModal from '../components/traceability/ImpactAnalysisModal.jsx'
import SplitModal from '../components/tree/SplitModal.jsx'
import PrefixModal from '../components/tree/PrefixModal.jsx'
import MergeModal from '../components/tree/MergeModal.jsx'
import FilterBar, { FilterSummary } from '../components/common/FilterBar.jsx'
import {
  IconLoader,
  IconLink,
  IconUnlink,
  IconPlus,
  IconEdit,
  IconList,
} from '../components/common/Icons.jsx'
import { REQ_PAGES, REQ_TYPE, LINK_TYPE, DEFAULT_CODE_PREFIX } from '../utils/constants.js'
import { useEntityFilters, matchesFilters } from '../hooks/useEntityFilters.js'
import {
  selectAttrDefs,
  requirementStatusOptions,
  requirementStatusOf,
} from '../utils/filterOptions.js'

export default function PbsTree() {
  const {
    projectId,
    requirements,
    links,
    fields,
    attributeDefs,
    editRequirement,
    bulkRemoveRequirements,
    refresh,
  } = useApp()
  const { t } = useLang()
  const { can, isPM } = useAuth()
  const { activeProject, refreshProjects } = useProject()

  const tree = useTreeNodes(projectId)
  const del = useUndoableDelete(bulkRemoveRequirements)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  const fx = useEntityFilters('pbs-tree')
  const [viewRow, setViewRow] = useState(null)
  // Kaynak dokumani acilacak gereksinim (ViewModal "Kaynak" satirindan).
  const [sourceRow, setSourceRow] = useState(null)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState(null)
  const [impactRow, setImpactRow] = useState(null)
  const [splitNode, setSplitNode] = useState(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Map()) // id -> row
  const [dragNode, setDragNode] = useState(null)
  const [prefixOpen, setPrefixOpen] = useState(false)
  const [attrMgrOpen, setAttrMgrOpen] = useState(false)
  // Silme oncesi zorunlu gerekce (izlenebilirlik) — bkz. ReasonModal.
  const [deleteTarget, setDeleteTarget] = useState(null)

  // --- Izin cozumleyiciler (gereksinim tipine gore bilesen anahtari) --------
  const compOf = (r) => componentKeyOf('requirement', r.type)
  const canEditRow = (r) => can('write', compOf(r))
  const canDeleteRow = (r) => can('delete', compOf(r))
  const canLinksRow = (r) => can('link_satisfies', compOf(r))
  const canReadAny = REQ_PAGES ? Object.keys(REQ_PAGES).some((k) => can('read', k)) : false
  // Ekleme yetkisi: gereksinim bilesenlerinden HERHANGI birine ekleyebiliyorsa.
  const canAddAny = Object.keys(REQ_PAGES || {}).some((k) => can('add_requirement', k))
  // Oznitelik yonetimi Hierarchy sayfalariyla AYNI izne bagli.
  const canFields = can('manage_fields')

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
    await afterMutation([ROOT_KEY, ...tree.flatRows.filter((r) => r._expanded).map((r) => r.id)])
  }

  // --- Tablo yardimcilari (Hierarchy ile ayni sozlesme) --------------------
  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length
  // Gereksinimler KENDI baslarina onaylanmaz (bkz. Hierarchy.jsx) — Durum
  // sutunu bu gereksinimi DOGRULAYAN (Verifies) test senaryolarindan turetilir.
  const verifiedFor = (r) => links.some((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === r.id)
  const saveDescription = (r, html) => editRequirement(r.id, { description: html })

  // --- Gorunur satirlar ----------------------------------------------------
  //  Agac LAZY yuklenir: mount'ta yalnizca kok dugumler gelir, alt kirilimlar
  //  expand edildikce cekilir (bkz. useTreeNodes). Bu yuzden tree.flatRows'u
  //  filtrelemek YANLIS sonuc verir — acilmamis alt agaclardaki eslesmeler
  //  hic gorulmez (or. "Software Requirement" filtresi bos liste dondururdu)
  //  ve elenen bir ust dugumun cocuklari oksuz satir olarak asili kalirdi.
  //
  //  Cozum: filtre AKTIFKEN agac modundan cikilir ve sonuclar AppContext'teki
  //  duz `requirements` listesinden (proje genelinde EKSIKSIZ, bkz. AppContext
  //  refresh) uretilir. Yeni bir backend ucu gerekmez. Filtre temizlenince
  //  agac — acilmis dugumleri, girintisi ve bolum numaralariyle — geri gelir.
  //  Zaten filtrelenmis bir sonuc kumesinde girinti/bolum numarasi (1.3 gibi)
  //  kardesleri gizlendigi icin yaniltici olurdu.
  const filtersActive = fx.activeCount > 0
  const filterAttrDefs = useMemo(
    () => selectAttrDefs(attributeDefs, 'requirement'),
    [attributeDefs],
  )
  const statusOptions = useMemo(() => requirementStatusOptions(t), [t])

  const rows = useMemo(() => {
    if (!filtersActive) return tree.flatRows.filter((r) => !pendingSet.has(r.id))
    const statusOf = (r) => requirementStatusOf(r, verifiedFor)
    return requirements
      .filter((r) => !pendingSet.has(r.id))
      .filter((r) => matchesFilters(r, fx.filters, statusOf))
      .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true }))
    // verifiedFor `links` uzerinden hesaplanir; bagimlilik olarak links yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersActive, tree.flatRows, requirements, fx.filters, pendingSet, links])

  // Gereksinimler baska bir yerden degistiginde (form kaydi, onay oylamasi,
  // toplu islem...) agac satirlari bayat kalmasin: AppContext'teki listenin
  // "imzasi" degisince yuklenmis dugumleri yeniden cek.
  //   imza = kayit sayisi + en son guncelleme zamani
  // Boylece ekleme / silme / alan-deger degisikliklerinin hepsi yakalanir.
  const reqSignature = useMemo(() => {
    const list = requirements || []
    let newest = ''
    for (const r of list) if (r.updatedAt > newest) newest = r.updatedAt
    return `${list.length}|${newest}`
  }, [requirements])
  const lastSignature = useRef(null)
  useEffect(() => {
    // Ilk render'da agac zaten yukleniyor; yalnizca SONRAKI degisimlerde tazele.
    if (lastSignature.current === null) {
      lastSignature.current = reqSignature
      return
    }
    if (lastSignature.current === reqSignature) return
    lastSignature.current = reqSignature
    tree.refreshLoaded()
  }, [reqSignature, tree])

  // --- Mutasyon sonrasi tazeleme ------------------------------------------
  const afterMutation = async (keys) => {
    await tree.refreshKeys(keys)
    await refresh() // duz listeler + Dashboard sayilari
  }

  const handleDelete = (r) => setDeleteTarget({ id: r.id, label: `${r.text_id} — ${r.title}` })
  const confirmDelete = async (reason) => {
    await del.schedule([deleteTarget.id], reason)
    setDeleteTarget(null)
  }

  // --- Bolme / birlestirme -------------------------------------------------
  const selectedList = useMemo(() => [...selected.values()], [selected])
  const mergeBlockReason = (() => {
    if (selectedList.length < 2) return 'few'
    const first = selectedList[0]
    // Duz sonuc modunda satirlar agactan degil duz listeden gelir ve _parentKey
    // tasimaz; hepsi undefined oldugu icin kardes kontrolu sessizce gecerdi.
    if (!first._parentKey || !selectedList.every((s) => s._parentKey === first._parentKey))
      return 'notSiblings'
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
            <FilterSummary
              count={rows.length}
              label={t('req.records')}
              activeCount={fx.activeCount}
            />{' '}
            · {t('page.pbsTree.sub')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canFields && (
            <button
              onClick={() => setAttrMgrOpen(true)}
              className="btn-secondary"
              data-testid="pbs-attr-btn"
              title={t('attr.manage')}
            >
              <IconList size={16} /> {t('attr.manage')}
            </button>
          )}
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

      <FilterBar
        filters={fx.filters}
        onSet={fx.set}
        onSetAttr={fx.setAttr}
        onClear={fx.clear}
        types={PBS_FORM_CONFIG.typeOptions}
        fields={fields}
        statusOptions={statusOptions}
        attrDefs={filterAttrDefs}
        activeCount={fx.activeCount}
      />

      {filtersActive && (
        <div
          data-testid="pbs-flat-notice"
          className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-900/30 dark:text-brand-200"
        >
          {t('filt.treeFlat')}
        </div>
      )}

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
          columns={['type', 'field', 'status', 'links']}
          // Modular oznitelikler (Priority / DAL Level / proje ozel alanlar)
          // gereksinim sayfalariyla AYNI sekilde dinamik sutun olarak gelir.
          attributeEntityType="requirement"
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
          statusLabel={t('tbl.th.verification')}
          verifiedFor={verifiedFor}
          selectable
          selectedIds={new Set(selected.keys())}
          onToggleRow={(id) => {
            const row = rows.find((r) => r.id === id)
            if (row) toggleSelect(row)
          }}
          onToggleAll={() => setSelected(new Map())}
          allSelected={false}
          someSelected={selectedList.length > 0}
          treeMode={!filtersActive}
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
      <AttributeManager open={attrMgrOpen} onClose={() => setAttrMgrOpen(false)} />
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
      <ReasonModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemLabel={deleteTarget?.label}
      />
    </div>
  )
}
