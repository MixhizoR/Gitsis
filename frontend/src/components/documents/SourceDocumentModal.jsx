// ============================================================================
//  SourceDocumentModal.jsx  —  Bir gereksinimin KAYNAK pasajini dokumanda acar.
//  Gereksinim detayindaki (ViewModal) "Kaynak" satirindan cagirilir: dokumani
//  Metin modunda acar ve gereksinimin turedigi araligi vurgular.
//  Dokuman meta bilgisi liste ucundan bulunur (ayri bir uc gerektirmez);
//  dokuman silinmisse kullaniciya bunu soyler.
// ============================================================================
import { useEffect, useState } from 'react'
import DocumentPreviewModal from '../common/DocumentPreviewModal.jsx'
import { listDocuments, downloadDocument } from '../../services/dataService.js'
import { useLang } from '../../context/LanguageContext.jsx'

export default function SourceDocumentModal({ requirement, projectId, onClose }) {
  const { t } = useLang()
  const [doc, setDoc] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!requirement?.sourceDocumentId) return
    let cancelled = false
    setDoc(null)
    setMissing(false)
    listDocuments(projectId)
      .then((list) => {
        if (cancelled) return
        const found = (list || []).find((d) => d.id === requirement.sourceDocumentId)
        if (found) setDoc(found)
        else setMissing(true)
      })
      .catch(() => !cancelled && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [requirement?.sourceDocumentId, projectId])

  if (!requirement?.sourceDocumentId) return null

  // Dokuman bulunamadi (arada silinmis olabilir) — sessizce kapanmak yerine bildir.
  if (missing) {
    window.alert(t('view.sourceDeleted', { name: requirement.sourceDocumentName || '—' }))
    onClose?.()
    return null
  }
  if (!doc) return null

  return (
    <DocumentPreviewModal
      open
      doc={doc}
      projectId={projectId}
      onClose={onClose}
      onDownload={(d) => downloadDocument(projectId, d.id)}
      initialMode="text"
      focusRange={{
        start: requirement.sourceStart,
        end: requirement.sourceEnd,
        label: requirement.text_id,
      }}
    />
  )
}
