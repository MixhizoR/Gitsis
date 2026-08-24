// ============================================================================
//  EntityTable.jsx  —  Gereksinim / Test / Sozluk icin ortak liste tablosu.
//  Sutunlar `columns` ile yapilandirilir. Yeni ozellikler:
//    - Goz ikonu (Read): detay + zengin metin editorlu aciklama modalini acar.
//    - Onay sutunu (Check Circle): "Baglantilar" ile "Eylemler" arasinda.
//    - Onay Durumu sutunu: PM'e ozel "Onay Detayi" butonu + durum rozeti.
//    - Izin bazli kalem/cop kilidi + onaylanan satirin donmasi (freeze).
//  Test/gereksinim sayfalari izin fonksiyonlarini prop olarak gecer.
// ============================================================================
import { StatusBadge, PriorityBadge, TypeBadge, DalBadge } from './Badge.jsx'
import { IconEdit, IconTrash, IconLink, IconEye, IconCheckCircle, IconLock, IconTarget } from './Icons.jsx'
import { truncate } from '../../utils/format.js'
import { useLang } from '../../context/LanguageContext.jsx'

const dash = <span className="text-slate-300 dark:text-slate-600">—</span>
const noop = () => {}
const T = () => true
const F = () => false

export default function EntityTable({
  rows,
  columns = ['type', 'field', 'priority', 'status', 'dal', 'links'],
  linkCountFor,
  onEdit,
  onDelete,
  onManageLinks,
  onView,
  onImpact,
  titleKey = 'title',
  statusLabel,
  // --- Izin/onay entegrasyonu ---
  showApproval = false,
  canEditRow = T,
  canDeleteRow,
  canManageLinksRow,
  canApproveRow = F,
  showApprovalDetail = false,
  approvalInfoFor,          // (row) => { approved, voted }
  onToggleApprove = noop,
  onApprovalDetail = noop,
  // --- Geriye donuk uyumluluk (eski cagiranlar) ---
  canManageLinks = true,
  canDelete = true,
  // --- Toplu secim (opsiyonel) ---
  selectable = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
  allSelected = false,
  someSelected = false,
}) {
  const { t } = useLang()
  const has = (c) => columns.includes(c)
  const isSelected = (id) => Boolean(selectedIds && selectedIds.has(id))

  // Satir bazli izin cozumleyiciler (varsayilanlar eski davranisi korur).
  const editAllowed = (r) => (canEditRow ? canEditRow(r) : true)
  const deleteAllowed = (r) => (canDeleteRow ? canDeleteRow(r) : canDelete)
  const linksAllowed = (r) => (canManageLinksRow ? canManageLinksRow(r) : canManageLinks)

  if (rows.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-base font-semibold text-slate-600 dark:text-slate-300">{t('tbl.noResult')}</p>
        <p className="text-sm text-slate-400">{t('tbl.noResultSub')}</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              {selectable && (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-brand-600 dark:border-slate-600"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={onToggleAll}
                    title={t('bulk.selectAll')}
                  />
                </th>
              )}
              <th className="px-4 py-3">{t('tbl.th.code')}</th>
              <th className="px-4 py-3">{t('tbl.th.title')}</th>
              {has('type') && <th className="px-4 py-3">{t('tbl.th.type')}</th>}
              {has('field') && <th className="px-4 py-3">{t('form.field')}</th>}
              {has('priority') && <th className="px-4 py-3">{t('tbl.th.priority')}</th>}
              {has('status') && <th className="px-4 py-3">{statusLabel || t('tbl.th.status')}</th>}
              {has('dal') && <th className="px-4 py-3">{t('tbl.th.dal')}</th>}
              {has('links') && <th className="px-4 py-3 text-center">{t('tbl.th.links')}</th>}
              {showApproval && <th className="px-4 py-3 text-center">{t('tbl.th.approval')}</th>}
              {showApproval && <th className="px-4 py-3">{t('tbl.th.approvalStatus')}</th>}
              <th className="px-4 py-3 text-right">{t('tbl.th.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const locked = Boolean(r.locked)
              const info = approvalInfoFor ? approvalInfoFor(r) : { approved: r.approvalStatus === 'Approved', voted: false }
              const canApprove = canApproveRow(r)
              return (
              <tr key={r.id} className={`group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isSelected(r.id) ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''} ${locked ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''}`}>
                {selectable && (
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-brand-600 dark:border-slate-600 disabled:opacity-40"
                      checked={isSelected(r.id)}
                      disabled={locked}
                      onChange={() => onToggleRow && onToggleRow(r.id)}
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{r.text_id}</span>
                    {locked && <IconLock size={13} className="text-emerald-600 dark:text-emerald-400" title={t('tbl.locked')} />}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{r[titleKey]}</div>
                  {r.description != null && (
                    <div className="mt-0.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                      {truncate(stripHtml(r.description), 110)}
                    </div>
                  )}
                </td>
                {has('type') && <td className="px-4 py-3 align-top"><TypeBadge value={r.type} /></td>}
                {has('field') && (
                  <td className="px-4 py-3 align-top">
                    {r.field ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{r.field}</span>
                    ) : dash}
                  </td>
                )}
                {has('priority') && <td className="px-4 py-3 align-top">{r.priority ? <PriorityBadge value={r.priority} /> : dash}</td>}
                {has('status') && <td className="px-4 py-3 align-top">{r.status ? <StatusBadge value={r.status} /> : dash}</td>}
                {has('dal') && <td className="px-4 py-3 align-top">{r.dal_level ? <DalBadge value={r.dal_level} /> : dash}</td>}
                {has('links') && (
                  <td className="px-4 py-3 text-center align-top">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-bold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {linkCountFor ? linkCountFor(r.id) : 0}
                    </span>
                  </td>
                )}

                {/* --- Onay (Check Circle) --- */}
                {showApproval && (
                  <td className="px-4 py-3 text-center align-top">
                    <button
                      onClick={() => canApprove && onToggleApprove(r)}
                      disabled={!canApprove}
                      title={info.approved ? t('tbl.approvedTitle') : info.voted ? t('tbl.votedTitle') : t('tbl.approveTitle')}
                      className={`inline-flex items-center justify-center rounded-full p-0.5 transition-colors ${
                        info.approved
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : info.voted
                            ? 'text-brand-600 dark:text-brand-400'
                            : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
                      } ${canApprove ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                    >
                      <IconCheckCircle size={20} className={info.approved || info.voted ? 'fill-current/10' : ''} />
                    </button>
                  </td>
                )}

                {/* --- Onay Durumu --- */}
                {showApproval && (
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        info.approved
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}>
                        {info.approved ? t('tbl.approved') : t('tbl.pending')}
                      </span>
                      {showApprovalDetail && (
                        <button
                          onClick={() => onApprovalDetail(r)}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {t('tbl.approvalDetail')}
                        </button>
                      )}
                    </div>
                  </td>
                )}

                <td className="px-4 py-3 align-top">
                  <div className="flex items-center justify-end gap-1">
                    {onView && (
                      <button onClick={() => onView(r)} className="btn-ghost !px-2 !py-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100" title={t('tbl.view')}>
                        <IconEye size={16} />
                      </button>
                    )}
                    {linksAllowed(r) && onManageLinks && (
                      <button onClick={() => onManageLinks(r)} className="btn-ghost !px-2 !py-1.5 text-brand-600 dark:text-brand-400" title={t('tbl.manageLinks')}>
                        <IconLink size={16} />
                      </button>
                    )}
                    {onImpact && (
                      <button onClick={() => onImpact(r)} className="btn-ghost !px-2 !py-1.5 text-violet-600 dark:text-violet-400" title={t('tbl.impact')}>
                        <IconTarget size={16} />
                      </button>
                    )}
                    {editAllowed(r) && onEdit && (
                      <button onClick={() => onEdit(r)} className="btn-ghost !px-2 !py-1.5" title={t('tbl.edit')}>
                        <IconEdit size={16} />
                      </button>
                    )}
                    {deleteAllowed(r) && onDelete && (
                      <button onClick={() => onDelete(r)} className="btn-ghost !px-2 !py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title={t('tbl.delete')}>
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// HTML aciklamalari listede duz metin olarak goster.
function stripHtml(s) {
  if (!s) return ''
  return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
