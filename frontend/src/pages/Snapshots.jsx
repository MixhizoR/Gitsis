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
import Pill from '../components/common/Badge.jsx'
import { getSnapshot } from '../services/dataService.js'

function SnapshotDetailModal({ open, snapshot, onClose }) {
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState('requirements')

  // Snapshot items'leri entityType'a göre grupla (useMemo before early return)
  const itemsByType = useMemo(() => {
    if (!snapshot?.items) return { requirements: [], testcases: [], glossary: [], links: [] }
    const grouped = { requirements: [], testcases: [], glossary: [], links: [] }
    for (const item of snapshot.items) {
      if (item.entityType === 'requirement') grouped.requirements.push(item)
      else if (item.entityType === 'testcase') grouped.testcases.push(item)
      else if (item.entityType === 'glossary') grouped.glossary.push(item)
      else if (item.entityType === 'link') grouped.links.push(item)
    }
    return grouped
  }, [snapshot?.items])

  if (!open || !snapshot) return null

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

  const activeItems = itemsByType[activeTab] || []

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
          <td className="px-4 py-3 text-sm text-center">
            <Pill>{d.priority}</Pill>
          </td>
          <td className="px-4 py-3 text-sm text-center">
            <Pill>{d.dal_level}</Pill>
          </td>
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

        {/* Tablo */}
        <div className="card overflow-hidden">
          {activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <IconHistory size={30} />
              <p>{t('snapshot.noItems', { type: activeTab })}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {activeTab === 'requirements' && (
                      <>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thTextId')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thTitle')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thType')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thStatus')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thPriority')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thDal')}
                        </th>
                      </>
                    )}
                    {activeTab === 'testcases' && (
                      <>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thTextId')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thTitle')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thType')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thStatus')}
                        </th>
                      </>
                    )}
                    {activeTab === 'glossary' && (
                      <>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thTextId')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thTerm')}
                        </th>
                        <th
                          className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                          colSpan={4}
                        >
                          {t('snapshot.thDefinition')}
                        </th>
                      </>
                    )}
                    {activeTab === 'links' && (
                      <>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thLinkId')}
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t('snapshot.thLinkType')}
                        </th>
                        <th
                          className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                          colSpan={3}
                        >
                          {t('snapshot.thLinkDetail')}
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {activeItems.map(renderItem)}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
  const [deleting, setDeleting] = useState(false)

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

  const handleDelete = async (snap) => {
    if (!confirm(t('snapshot.confirmDelete', { name: snap.name }))) return
    try {
      setDeleting(true)
      await deleteSnapshot(snap.id)
    } catch (e) {
      alert(e?.message || 'Snapshot silinemedi')
    } finally {
      setDeleting(false)
    }
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
                            disabled={deleting}
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
    </div>
  )
}
