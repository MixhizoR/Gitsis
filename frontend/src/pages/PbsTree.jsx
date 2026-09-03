// ============================================================================
//  PbsTree.jsx  —  Urun Agaci (PBS) sayfasi (Issue #9).
//  Ince bir kabuk: baslik + TreeGrid. Veri erisimi TreeGrid icinde, lazy-load
//  (kok dugumler + expand edildikce alt seviyeler).
// ============================================================================
import { useLang } from '../context/LanguageContext.jsx'
import TreeGrid from '../components/tree/TreeGrid.jsx'

export default function PbsTree() {
  const { t } = useLang()
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('page.pbsTree.title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('page.pbsTree.sub')}</p>
      </div>
      <TreeGrid />
    </div>
  )
}
