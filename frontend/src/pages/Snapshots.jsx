// ============================================================================
//  Snapshots.jsx  —  Sürüm Yönetimi (Snapshot) sayfası.
//  PM: yeni snapshot alma, silme, listeleme.
//  Personel: listeleme, salt-okunur detay görüntüleme.
//  Issue #8: Sürüm Yönetimi (Snapshot) Altyapısı.
// ============================================================================
import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatDateTime } from '../utils/format.js'
import { IconHistory, IconPlus, IconTrash, IconEye } from '../components/common/Icons.jsx'
import Modal from '../components/common/Modal.jsx'
import ReasonModal from '../components/common/ReasonModal.jsx'
import Pill, { AttrBadge } from '../components/common/Badge.jsx'
import { getSnapshot } from '../services/dataService.js'
import { REQ_PAGES, TEST_PAGES, TYPE_SUFFIX } from '../utils/constants.js'

const dash = <span className="text-slate-300 dark:text-slate-600">—</span>

function SnapshotDetailModal({ open, snapshot, onClose }) {
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState('requirements')

  // Snapshot items'leri entityType'a göre grupla (useMemo before early return)
  const itemsByType = useMemo(() => {
    const grouped = {
      requirements: [],
      testcases: [],
      glossary: [],
      links: [],
      attributeDefs: [],
      navLayout: null,
    }
    if (!snapshot?.items) return grouped
    for (const item of snapshot.items) {
      if (item.entityType === 'requirement') grouped.requirements.push(item)
      else if (item.entityType === 'testcase') grouped.testcases.push(item)
      else if (item.entityType === 'glossary') grouped.glossary.push(item)
      else if (item.entityType === 'link') grouped.links.push(item)
      else if (item.entityType === 'attributeDef') grouped.attributeDefs.push(item.data)
      else if (item.entityType === 'navLayout') grouped.navLayout = item.data
    }
    grouped.attributeDefs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return grouped
  }, [snapshot?.items])

  // Modular öznitelik sütunları: o anki CANLI şema değil, snapshot'ın KENDİ
  // yakaladığı tanımlar kullanılır — böylece sonradan silinen/yeniden
  // adlandırılan öznitelikler bile bu snapshot'ta doğru görünür.
  const attrDefsFor = (entityType) =>
    itemsByType.attributeDefs.filter((d) => d.entityType === entityType || d.entityType === 'both')

  const reqAttrDefs = useMemo(() => attrDefsFor('requirement'), [itemsByType.attributeDefs])
  const tcAttrDefs = useMemo(() => attrDefsFor('testcase'), [itemsByType.attributeDefs])

  // Sayfa görünen adı — Hierarchy.jsx / TestCases.jsx / Sidebar.jsx ile AYNI
  // mantık (özel ad > varsayılan i18n etiketi, tip filtresi varsa sonek).
  const pageLabel = (item) => {
    const base =
      item.label ||
      REQ_PAGES[item.pageKey]?.navLabel ||
      TEST_PAGES[item.pageKey]?.navLabel ||
      (item.pageKey === 'glossary' ? t('nav.glossary') : item.pageKey)
    if (!item.typeFilter) return base
    return `${base} · ${TYPE_SUFFIX[item.typeFilter] || item.typeFilter}`
  }
  const groupLabel = (g) => (g.nameKey ? t(g.nameKey) : g.name)

  // Bir menü sayfasının o snapshot'taki gereksinim/test HAVUZUNDAN hangi
  // kayıtları gösterdiği — Hierarchy.jsx / TestCases.jsx ile AYNI filtre
  // mantığı (tip + alan), ama CANLI veri yerine snapshot'ın kendi verisi
  // üzerinde çalışır.
  const pageItemsFor = (item, pool) => {
    const reqCfg = REQ_PAGES[item.pageKey]
    if (reqCfg) {
      const types = item.typeFilter ? [item.typeFilter] : reqCfg.typeOptions
      return pool.filter(
        (r) =>
          types.includes(r.data.type) && (!item.fieldFilter || r.data.field === item.fieldFilter),
      )
    }
    const testCfg = TEST_PAGES[item.pageKey]
    if (testCfg) {
      return pool.filter(
        (tc) =>
          tc.data.type === testCfg.lockedType &&
          (!item.fieldFilter || tc.data.field === item.fieldFilter),
      )
    }
    return []
  }

  // Kullanıcı talebi: "sadece tek büyük havuz değil, o an hangi menü
  // sayfasında neyin olduğunu da görmek istiyorum". Bu yüzden Requirements /
  // Test Cases sekmeleri artık TEK tablo değil, yakalanan menü grup/sayfa
  // sırasıyla BİREBİR eşleşen ayrı bölümler halinde render edilir. Menü
  // yakalanmamış eski bir snapshot ise (navLayout yok) sections boş döner ve
  // eski düz-liste davranışına sorunsuzca geri düşülür.
  const buildSections = (matchesPageKey, pool) => {
    const nav = itemsByType.navLayout
    if (!nav) return { sections: [], unassigned: pool }
    const flatNavItems = [
      ...(nav.groups || []).flatMap((g) =>
        g.items.map((it) => ({ gLabel: groupLabel(g), item: it })),
      ),
      ...(nav.ungrouped || []).map((it) => ({ gLabel: null, item: it })),
    ]
    const sections = []
    const matchedIds = new Set()
    for (const { gLabel, item } of flatNavItems) {
      if (!matchesPageKey(item.pageKey)) continue
      const items = pageItemsFor(item, pool)
      for (const it of items) matchedIds.add(it.entityId)
      sections.push({
        key: item.id || item.pageKey,
        groupLabel: gLabel,
        pageTitle: pageLabel(item),
        items,
      })
    }
    const unassigned = pool.filter((p) => !matchedIds.has(p.entityId))
    return { sections, unassigned }
  }

  if (!open || !snapshot) return null

  const reqSectionData = buildSections((k) => Boolean(REQ_PAGES[k]), itemsByType.requirements)
  const tcSectionData = buildSections((k) => Boolean(TEST_PAGES[k]), itemsByType.testcases)

  const tabs = [
    {
      key: 'requirements',
      label: t('snapshot.tabRequirements'),
      count: itemsByType.requirements.length,
    },
    { key: 'testcases', label: t('snapshot.tabTestCases'), count: itemsByType.testcases.length },
    { key: 'glossary', label: t('snapshot.tabGlossary'), count: itemsByType.glossary.length },
    { key: 'links', label: t('snapshot.tabLinks'), count: itemsByType.links.length },
  ]

  // Öznitelik hücresi: değer snapshot anındaki 'attributes' torbasından okunur
  // (canlı veriden değil) — bkz. EntityTable.jsx ile aynı sözleşme.
  const attrCell = (def, d) => {
    const value = (d.attributes || {})[def.key]
    return (
      <td key={def.id} className="px-4 py-3 text-sm text-center">
        {value != null && value !== '' ? <AttrBadge def={def} value={value} /> : dash}
      </td>
    )
  }

  const renderItem = (item) => {
    const d = item.data
    if (item.entityType === 'requirement') {
      return (
        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">
            {d.text_id}
          </td>
          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white max-w-xs truncate">
            {d.title}
          </td>
          <td className="px-4 py-3 text-sm text-center">
            <Pill>{d.type}</Pill>
          </td>
          <td className="px-4 py-3 text-sm text-center">
            <Pill>{d.status}</Pill>
          </td>
          {reqAttrDefs.map((def) => attrCell(def, d))}
        </tr>
      )
    }
    if (item.entityType === 'testcase') {
      return (
        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">
            {d.text_id}
          </td>
          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white max-w-xs truncate">
            {d.title}
          </td>
          <td className="px-4 py-3 text-sm text-center">
            <Pill>{d.type}</Pill>
          </td>
          <td className="px-4 py-3 text-sm text-center">
            <Pill>{d.status}</Pill>
          </td>
          {tcAttrDefs.map((def) => attrCell(def, d))}
        </tr>
      )
    }
    if (item.entityType === 'glossary') {
      return (
        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">
            {d.text_id}
          </td>
          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{d.term}</td>
          <td className="px-4 py-3 text-sm max-w-xs truncate" colSpan={4}>
            {d.definition}
          </td>
        </tr>
      )
    }
    // link
    return (
      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">
          {d.text_id || d.id?.slice(0, 8)}
        </td>
        <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{d.type}</td>
        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400" colSpan={3}>
          {d.fromTextId || d.fromId?.slice(0, 8)} → {d.toTextId || d.toId?.slice(0, 8)}
        </td>
      </tr>
    )
  }

  const thCell = (key, label, extra) => (
    <th
      key={key}
      className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
      {...extra}
    >
      {label}
    </th>
  )

  const reqHeadCells = (
    <>
      {thCell('text_id', t('snapshot.thTextId'))}
      {thCell('title', t('snapshot.thTitle'))}
      {thCell('type', t('snapshot.thType'))}
      {thCell('status', t('snapshot.thStatus'))}
      {reqAttrDefs.map((def) => thCell(def.id, def.label))}
    </>
  )
  const tcHeadCells = (
    <>
      {thCell('text_id', t('snapshot.thTextId'))}
      {thCell('title', t('snapshot.thTitle'))}
      {thCell('type', t('snapshot.thType'))}
      {thCell('status', t('snapshot.thStatus'))}
      {tcAttrDefs.map((def) => thCell(def.id, def.label))}
    </>
  )
  const glossaryHeadCells = (
    <>
      {thCell('text_id', t('snapshot.thTextId'))}
      {thCell('term', t('snapshot.thTerm'))}
      {thCell('definition', t('snapshot.thDefinition'), { colSpan: 4 })}
    </>
  )
  const linksHeadCells = (
    <>
      {thCell('link_id', t('snapshot.thLinkId'))}
      {thCell('link_type', t('snapshot.thLinkType'))}
      {thCell('link_detail', t('snapshot.thLinkDetail'), { colSpan: 3 })}
    </>
  )

  // Tek bir bölümün (sayfanın) tablosu — hem düz sekmelerde (Sözlük/Bağlar)
  // hem de menü sayfasına göre bölünmüş Requirements/Test Cases satırlarında
  // aynı bileşen kullanılır.
  const DataTable = ({ headCells, items, emptyVariant = 'section' }) => {
    if (items.length === 0) {
      if (emptyVariant === 'full') {
        return (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
            <IconHistory size={30} />
            <p>{t('snapshot.noItems', { type: activeTab })}</p>
          </div>
        )
      }
      return (
        <div className="flex items-center justify-center py-6 text-sm text-slate-400">
          {t('snapshot.sectionEmpty')}
        </div>
      )
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <tr>{headCells}</tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map(renderItem)}
          </tbody>
        </table>
      </div>
    )
  }

  // Menü sayfasına göre bölünmüş görünüm: her sayfa kendi başlığı + kendi
  // tablosuyla, sidebar'daki SIRAYLA render edilir. navLayout yakalanmamış
  // eski bir snapshot ise (sections boş) tek düz tabloya geri düşer.
  const SectionedView = ({ sectionData, headCells, pool }) => {
    if (sectionData.sections.length === 0) {
      return (
        <div className="card overflow-hidden">
          <DataTable headCells={headCells} items={pool} emptyVariant="full" />
        </div>
      )
    }
    return (
      <div className="space-y-4">
        {sectionData.sections.map((sec) => (
          <div key={sec.key} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
              <div className="text-sm">
                {sec.groupLabel && (
                  <span className="mr-1.5 font-semibold uppercase tracking-wide text-slate-400 text-xs">
                    {sec.groupLabel} ·
                  </span>
                )}
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  {sec.pageTitle}
                </span>
              </div>
              <Pill>{sec.items.length}</Pill>
            </div>
            <DataTable headCells={headCells} items={sec.items} />
          </div>
        ))}
        {sectionData.unassigned.length > 0 && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t('snapshot.notOnAnyPage')}
              </span>
              <Pill>{sectionData.unassigned.length}</Pill>
            </div>
            <DataTable headCells={headCells} items={sectionData.unassigned} />
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('snapshot.modalTitle', { name: snapshot.name })}
      subtitle={t('snapshot.modalSub', { date: formatDateTime(snapshot.createdAt) })}
      maxWidth="max-w-6xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Sekme çubuğu */}
        <div className="border-b border-slate-200 dark:border-slate-700">
          <nav className="flex gap-1 -mb-px" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ' +
                  (activeTab === tab.key
                    ? 'text-brand-700 border-brand-600 bg-brand-50 dark:text-brand-300 dark:border-brand-500 dark:bg-brand-900/30'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50')
                }
              >
                {tab.label} <Pill>{tab.count}</Pill>
              </button>
            ))}
          </nav>
        </div>

        {/* Requirements / Test Cases: menü sayfasına göre bölünmüş görünüm —
            kullanıcı talebi: "tek büyük havuz değil, o an hangi sayfada
            neyin olduğunu da görebilmeliyim". */}
        {activeTab === 'requirements' && (
          <SectionedView
            sectionData={reqSectionData}
            headCells={reqHeadCells}
            pool={itemsByType.requirements}
          />
        )}
        {activeTab === 'testcases' && (
          <SectionedView
            sectionData={tcSectionData}
            headCells={tcHeadCells}
            pool={itemsByType.testcases}
          />
        )}
        {activeTab === 'glossary' && (
          <div className="card overflow-hidden">
            <DataTable
              headCells={glossaryHeadCells}
              items={itemsByType.glossary}
              emptyVariant="full"
            />
          </div>
        )}
        {activeTab === 'links' && (
          <div className="card overflow-hidden">
            <DataTable headCells={linksHeadCells} items={itemsByType.links} emptyVariant="full" />
          </div>
        )}

        {/* Özet */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>{t('snapshot.totalItems', { count: (snapshot.items || []).length })}</span>
          <span className="font-mono text-slate-400">
            {t('snapshot.createdAt', { date: formatDateTime(snapshot.createdAt) })}
          </span>
        </div>
      </div>
    </Modal>
  )
}

export default function SnapshotsPage() {
  const { snapshots, loading, createSnapshot, deleteSnapshot, projectId } = useApp()
  const { t } = useLang()
  const { isPM, can } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [newSnapshotName, setNewSnapshotName] = useState('')
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)
  // Silme oncesi zorunlu gerekce (izlenebilirlik) — bkz. ReasonModal.
  const [deleteTarget, setDeleteTarget] = useState(null)

  const canManageSnapshots = isPM || can('manage_snapshots')

  const handleCreate = async () => {
    if (!newSnapshotName.trim()) return
    try {
      await createSnapshot(newSnapshotName.trim())
      setModalOpen(false)
      setNewSnapshotName('')
    } catch (e) {
      alert(e?.message || 'Snapshot oluşturulamadı')
    }
  }

  const handleDelete = (snap) => setDeleteTarget(snap)
  const confirmDelete = async (reason) => {
    await deleteSnapshot(deleteTarget.id, reason)
    setDeleteTarget(null)
  }

  const handleView = async (snap) => {
    try {
      const detail = await getSnapshot(projectId, snap.id)
      setSelectedSnapshot(detail)
    } catch (e) {
      alert(e?.message || 'Snapshot detayı yüklenemedi')
    }
  }

  return (
    <div className="space-y-6">
      {/* Başlık + Yeni snapshot butonu */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('page.snapshots.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('page.snapshots.sub')}
          </p>
        </div>
        {canManageSnapshots && (
          <button onClick={() => setModalOpen(true)} className="btn-primary" disabled={loading}>
            <IconPlus size={18} className="mr-2" /> {t('snapshot.new')}
          </button>
        )}
      </div>

      {/* Snapshot listesi */}
      <div className="card overflow-hidden">
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <IconHistory size={40} />
            <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-300">
              {t('snapshot.emptyTitle')}
            </h3>
            <p className="text-sm max-w-md text-center">{t('snapshot.emptyDesc')}</p>
            {canManageSnapshots && (
              <button onClick={() => setModalOpen(true)} className="btn-primary mt-4">
                <IconPlus size={18} className="mr-2" /> {t('snapshot.new')}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('snapshot.thName')}
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('snapshot.thCreatedBy')}
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('snapshot.thCreatedAt')}
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {t('snapshot.thItems')}
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right pr-6">
                    {t('snapshot.thActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{snap.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('snapshot.snapshotId', { id: snap.id.slice(0, 8) })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {snap.createdBy || t('common.unknown')}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(snap.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      <Pill>{snap.items?.length || 0}</Pill>
                    </td>
                    <td className="px-6 py-4 text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleView(snap)}
                          className="btn-ghost btn-sm"
                          title={t('snapshot.view')}
                        >
                          <IconEye size={17} />
                        </button>
                        {canManageSnapshots && (
                          <button
                            onClick={() => handleDelete(snap)}
                            className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            title={t('snapshot.delete')}
                          >
                            <IconTrash size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Yeni snapshot modali */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setNewSnapshotName('')
        }}
        title={t('snapshot.newTitle')}
        subtitle={t('snapshot.newSub')}
        maxWidth="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setModalOpen(false)
                setNewSnapshotName('')
              }}
              className="btn-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={loading || !newSnapshotName.trim()}
              className="btn-primary"
            >
              {t('common.create')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('snapshot.nameLabel')}
            </label>
            <input
              type="text"
              className="input"
              placeholder={t('snapshot.namePlaceholder')}
              value={newSnapshotName}
              onChange={(e) => setNewSnapshotName(e.target.value)}
              maxLength={100}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('snapshot.nameHint')}
            </p>
          </div>
        </div>
      </Modal>

      {/* Detay modalı (salt okunur) */}
      <SnapshotDetailModal
        open={!!selectedSnapshot}
        snapshot={selectedSnapshot}
        onClose={() => setSelectedSnapshot(null)}
      />
      <ReasonModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemLabel={deleteTarget?.name}
      />
    </div>
  )
}
