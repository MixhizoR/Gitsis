// ============================================================================
//  CommentsModal.jsx  —  ViewModal KULLANMAYAN varliklar icin yorum penceresi.
//
//  Sozluk gibi detay modali olmayan sayfalar, gereksinim/test ile AYNI
//  CommentsTab bilesenini bu kabuk uzerinden kullanir; yorum mantigi tek
//  yerde kalir (kopya bir yorum sistemi yazilmaz).
// ============================================================================
import Modal from '../common/Modal.jsx'
import CommentsTab from './CommentsTab.jsx'
import { useComments } from '../../hooks/useComments.js'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

/**
 * @param {object} props
 * @param {string} props.entityType 'glossary' vb.
 * @param {object|null} props.row   yorumlanan kayit (null ise modal kapali)
 * @param {string} props.title      baslikta gosterilecek kayit adi
 */
export default function CommentsModal({ entityType, row, title, onClose }) {
  const { projectId } = useApp()
  const { t } = useLang()
  const { comments, loading, error, add, remove } = useComments(projectId, entityType, row?.id)

  if (!row) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={title || t('view.tab.comments')}
      subtitle={
        comments.length
          ? t('view.tab.commentsCount', { n: comments.length })
          : t('view.tab.comments')
      }
      maxWidth="max-w-2xl"
    >
      <CommentsTab
        comments={comments}
        loading={loading}
        error={error}
        onAdd={add}
        onDelete={remove}
      />
    </Modal>
  )
}
