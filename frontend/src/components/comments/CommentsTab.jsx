// ============================================================================
//  CommentsTab.jsx  —  Ana varliklar icin YENIDEN KULLANILABILIR yorum alani.
//
//  Varliktan BAGIMSIZDIR: yalnizca entityType + entityId alir, gereksinim /
//  test senaryosu / sozluk terimi ayrimi yapmaz. Veri erisimi useComments
//  hook'undadir; bu bilesen yalnizca gorunum + etkilesimden sorumludur.
//
//  KAPSAM: yorumlar onay/review surecinin parcasi DEGILDIR — burada onay,
//  durum veya kilit ile ilgili hicbir aksiyon yoktur.
//
//  Silme, projedeki mevcut "gerekce zorunlu" kuralina tabidir (ReasonModal);
//  yetki kontrolu ayrica SUNUCUDA da yapilir (buton gizlemek guvenlik sinirı
//  degildir).
// ============================================================================
import { useState } from 'react'
import ReasonModal from '../common/ReasonModal.jsx'
import { IconTrash, IconLoader } from '../common/Icons.jsx'
import { formatRelativeTime, formatDateTime } from '../../utils/format.js'
import { useLang } from '../../context/LanguageContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

/** Ad soyaddan avatar bas harfleri (en fazla 2). */
function initialsOf(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('tr-TR')
}

function CommentItem({ comment, canDelete, onDelete }) {
  const { t } = useLang()
  return (
    <li className="flex gap-3 py-3" data-testid="comment-item">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
        aria-hidden="true"
      >
        {initialsOf(comment.authorName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {comment.authorName}
          </span>
          {comment.authorRole && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{comment.authorRole}</span>
          )}
          <span className="text-xs text-slate-400" title={formatDateTime(comment.createdAt)}>
            · {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
          {comment.text}
        </p>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(comment)}
          data-testid={`comment-delete-${comment.id}`}
          title={t('comments.delete')}
          aria-label={t('comments.deleteAria', { name: comment.authorName })}
          className="btn-ghost h-8 shrink-0 rounded-lg px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
        >
          <IconTrash size={15} />
        </button>
      )}
    </li>
  )
}

export default function CommentsTab({ comments = [], loading, error, onAdd, onDelete }) {
  const { t } = useLang()
  const { currentUser, isPM } = useAuth()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // PM her yorumu, digerleri yalnizca KENDI yorumunu silebilir (sunucu da
  // ayni kurali uygular). PM oturumunda id, personelde personnelId tasinir.
  const myId = currentUser?.id || currentUser?.personnelId
  const canDelete = (c) => isPM || c.authorId === myId

  const submit = async (e) => {
    e.preventDefault()
    const clean = text.trim()
    if (!clean) return // bos yorum gonderilemez (sunucu da reddeder)
    setSaving(true)
    setFormError(null)
    try {
      await onAdd(clean)
      setText('') // basarili: alan temizlenir, liste aninda guncellenir
    } catch (err) {
      setFormError(err?.message || t('comments.addError'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async (reason) => {
    await onDelete(deleteTarget.id, reason)
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col" data-testid="comments-tab">
      {/* Liste — kaydirilabilir; yorumlar kronolojik (eskiden yeniye). */}
      <div className="max-h-[45vh] overflow-y-auto pr-1">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
            <IconLoader size={18} className="animate-spin" />
            <span className="text-sm">{t('comments.loading')}</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
            {t('comments.loadError')}
          </div>
        )}

        {!loading && !error && comments.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {t('comments.emptyTitle')}
            </p>
            <p className="mt-1 text-xs text-slate-400">{t('comments.emptyHint')}</p>
          </div>
        )}

        {!loading && !error && comments.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                canDelete={canDelete(c)}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Yazma alani — listenin altinda, her zaman erisilebilir. */}
      <form onSubmit={submit} className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={5000}
          disabled={saving}
          placeholder={t('comments.placeholder')}
          aria-label={t('comments.placeholder')}
          data-testid="comment-input"
          className="input w-full resize-y"
        />
        {formError && (
          <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
            {formError}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving || !text.trim()}
            data-testid="comment-submit"
            className="btn-primary disabled:opacity-50"
          >
            {saving ? t('comments.adding') : t('comments.add')}
          </button>
        </div>
      </form>

      {/* Silme gerekcesi — projedeki mevcut izlenebilirlik kurali. */}
      <ReasonModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t('comments.deleteTitle')}
        itemLabel={deleteTarget?.text}
      />
    </div>
  )
}
