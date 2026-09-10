// ============================================================================
//  useComments.js  —  Bir varligin yorumlarini yonetir (yukle / ekle / sil).
//
//  NEDEN HOOK: yorum sekmesi hem ViewModal'da (gereksinim, test senaryosu)
//  hem de sozluk gibi ViewModal KULLANMAYAN yerlerde acilabiliyor. Veri
//  erisimi tek yerde toplanip her iki tarafta da ayni sekilde kullanilsin
//  diye hook'a alindi. Ayrica sekme ROZETI (yorum sayisi) sekme acilmadan
//  once bilinmeli — bu yuzden veri, sekmenin kendisinde degil onu barindiran
//  bilesende cekilir.
//
//  Yorum listesi AppContext'e TASINMADI: proje genelindeki tum yorumlari her
//  refresh'te cekmek gereksiz yuk olurdu; yorumlar yalnizca acilan kaydin
//  detayinda gerekiyor.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { listComments, addComment, deleteComment } from '../services/dataService.js'

/**
 * @param {string} projectId
 * @param {string} entityType 'requirement' | 'testcase' | 'glossary'
 * @param {string} entityId   varligin id'si (null ise hicbir sey yuklenmez)
 */
export function useComments(projectId, entityType, entityId) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!projectId || !entityType || !entityId) {
      setComments([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      setComments(await listComments(projectId, entityType, entityId))
    } catch (e) {
      setError(e?.message || 'error')
    } finally {
      setLoading(false)
    }
  }, [projectId, entityType, entityId])

  useEffect(() => {
    reload()
  }, [reload])

  /** Yorum ekler; liste ANINDA guncellenir (modal yeniden acilmaz). */
  const add = useCallback(
    async (text) => {
      const created = await addComment(projectId, entityType, entityId, text)
      // Kronolojik sira: yeni yorum listenin SONUNA eklenir (yazma alaninin
      // hemen ustunde belirir).
      setComments((prev) => [...prev, created])
      return created
    },
    [projectId, entityType, entityId],
  )

  /** Yorumu siler (gerekce ZORUNLU — sunucu da dogrular). */
  const remove = useCallback(
    async (commentId, reason) => {
      await deleteComment(projectId, commentId, reason)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    },
    [projectId],
  )

  return { comments, loading, error, add, remove, reload }
}

export default useComments
