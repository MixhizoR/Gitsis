// ============================================================================
//  RequirementsTable.jsx  —  Gereksinim listesi tablosu (DOORS modul gorunumu).
// ============================================================================
import { StatusBadge, PriorityBadge, TypeBadge, DalBadge, CategoryBadge } from '../common/Badge.jsx'
import { IconEdit, IconTrash, IconLink, IconAlert } from '../common/Icons.jsx'
import { truncate } from '../../utils/format.js'
import { useLang } from '../../context/LanguageContext.jsx'
import { COVERABLE_TYPES } from '../../utils/constants.js'

export default function RequirementsTable({
  rows,
  linkCountFor,
  isUncovered,
  onEdit,
  onDelete,
  onManageLinks,
  canManageLinks,
  canDelete,
}) {
  const { t } = useLang()
  if (rows.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
          {t('tbl.noResult')}
        </p>
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
              <th className="px-4 py-3">{t('tbl.th.code')}</th>
              <th className="px-4 py-3">{t('tbl.th.title')}</th>
              <th className="px-4 py-3">{t('tbl.th.type')}</th>
              <th className="px-4 py-3">{t('tbl.th.category')}</th>
              <th className="px-4 py-3">{t('tbl.th.priority')}</th>
              <th className="px-4 py-3">{t('tbl.th.status')}</th>
              <th className="px-4 py-3">{t('tbl.th.dal')}</th>
              <th className="px-4 py-3 text-center">{t('tbl.th.links')}</th>
              <th className="px-4 py-3 text-right">{t('tbl.th.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const uncovered = isUncovered(r)
              return (
                <tr
                  key={r.id}
                  className="group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="whitespace-nowrap px-4 py-3 align-top">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                      {r.text_id}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                      {r.title}
                      {uncovered && (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                          title={t('tbl.uncoveredTitle')}
                        >
                          <IconAlert size={11} /> {t('tbl.uncoveredBadge')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                      {truncate(r.description, 110)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <TypeBadge value={r.type} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <CategoryBadge value={r.category} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <PriorityBadge value={r.priority} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge value={r.status} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <DalBadge value={r.dal_level} />
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-bold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {linkCountFor(r.id)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {canManageLinks && (
                        <button
                          onClick={() => onManageLinks(r)}
                          className="btn-ghost !px-2 !py-1.5 text-brand-600 dark:text-brand-400"
                          title={t('tbl.manageLinks')}
                        >
                          <IconLink size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => onEdit(r)}
                        className="btn-ghost !px-2 !py-1.5"
                        title={t('tbl.edit')}
                      >
                        <IconEdit size={16} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => onDelete(r)}
                          className="btn-ghost !px-2 !py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={t('tbl.delete')}
                        >
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

export { COVERABLE_TYPES }
