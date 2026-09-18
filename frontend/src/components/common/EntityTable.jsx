// ============================================================================
//  EntityTable.jsx  —  Gereksinim / Test / Sozluk icin ortak liste tablosu.
//
//  SUTUN DUZENI (Issue #105): hangi sutunlarin GORUNECEGI ve HANGI SIRADA
//  cizilecegi artik kaydedilmis bir Gorunum'den (Saved View) gelebilir.
//    - `columns` (eski prop): sayfada hangi opsiyonel sutunlarin ANLAMLI
//      oldugunu soyler (orn. tip kilitliyse 'type' yok). Degismedi.
//    - `columnKeys` (yeni, opsiyonel): SIRALI gorunur sutun anahtarlari
//      ('code', 'title', 'type', 'field', 'status', 'attr:<key>', 'links',
//      'approval', 'approvalStatus', 'actions'). Verilmezse eski davranis
//      birebir korunur (varsayilan katalog sirasi, hepsi gorunur).
//  Anahtar sozlugu tek kaynaktan gelir: utils/viewConfig.js columnCatalog.
//  Secim kutusu ve agac "BOLUM" sutunu duzenin DISINDADIR — biri toplu secim
//  altyapisina, digeri agac moduna aittir; gizlenmeleri tabloyu islevsiz
//  birakirdi.
//
//  ATANAN KISI SUTUNU YOKTUR: atama artik COKLUDUR (bir kayda birden fazla
//  sorumlu), bu da satiri sisirir. Atananlar goz (Read) ikonuyla acilan
//  ViewModal'in "Atanan Kisiler" bolumunde, atama sirasiyla gosterilir.
//
//  Diger ozellikler:
//    - Goz ikonu (Read): detay + zengin metin editorlu aciklama modalini acar.
//    - Onay sutunu (Check Circle): "Baglantilar" ile "Eylemler" arasinda.
//    - Onay Durumu sutunu: PM'e ozel "Onay Detayi" butonu + durum rozeti.
//    - Izin bazli kalem/cop kilidi + onaylanan satirin donmasi (freeze).
//  Test/gereksinim sayfalari izin fonksiyonlarini prop olarak gecer.
// ============================================================================
import { StatusBadge, TypeBadge, AttrBadge, VerificationBadge } from './Badge.jsx'
import {
  IconEdit,
  IconTrash,
  IconLink,
  IconEye,
  IconCheckCircle,
  IconXCircle,
  IconLock,
  IconTarget,
  IconAlert,
  IconChevron,
  IconLoader,
} from './Icons.jsx'
import { truncate, stripHtml, getDisplayLabel } from '../../utils/format.js'
import { useLang } from '../../context/LanguageContext.jsx'
import { useApp } from '../../context/AppContext.jsx'
import {
  columnCatalog,
  defaultColumnLayout,
  entityAttrDefs,
  visibleColumnKeys,
} from '../../utils/viewConfig.js'

const dash = <span className="text-slate-300 dark:text-slate-600">—</span>
const noop = () => {}
const T = () => true
const F = () => false

// Hucre hizalamalari sutuna gore sabittir (baslik ve hucre ayni olmali).
const ALIGN = {
  links: 'text-center',
  approval: 'text-center',
  actions: 'text-right',
}

export default function EntityTable({
  rows,
  columns = ['type', 'field', 'status', 'links'],
  // Kayitli Gorunum'den gelen SIRALI gorunur sutun anahtarlari (opsiyonel).
  columnKeys = null,
  attributeEntityType, // 'requirement' | 'testcase' — modular oznitelik sutunlari icin
  linkCountFor,
  // --- Issue #57: supheli bag gostergesi ---
  suspectCountFor, // (row) => suspect bag sayisi; verilmezse gosterge kapali
  onOpenSuspect, // (row) => tiklandiginda supheli bag yonetim sayfasina gider
  onEdit,
  onDelete,
  onManageLinks,
  onView,
  onImpact,
  titleKey = 'title',
  statusLabel,
  // Gereksinim sayfalarinda durum kendi basina degil, DOGRULAYAN (Verifies)
  // test senaryosundan turetilir. Verilirse: false donerse "Dogrulanamaz"
  // rozeti gosterilir (bagli test yok); true ise r.status normal sekilde
  // gosterilir (r.status zaten backend cascade'i ile test sonuclarindan
  // hesaplanir — bkz. backend/src/cascade.js). Verilmezse eski davranis.
  verifiedFor,
  // Issue #105: Dogrulama durumunun TAM hali. (row) => buildVerificationIndex
  // ozeti; verilirse Durum sutununda dort ayri durum gosterilir
  // ("Doğrulanamaz" / "Doğrulanmayı Bekliyor" / "Doğrulandı" /
  // "Doğrulama Başarısız") + kac testin onaylandigi sayaci. `verifiedFor`
  // yalnizca "bagli test var mi" ayrimini yapabildigi icin bu onceliklidir.
  verificationFor,
  // --- Izin/onay entegrasyonu ---
  showApproval = false,
  canEditRow = T,
  canDeleteRow,
  canManageLinksRow,
  canApproveRow = F,
  showApprovalDetail = false,
  approvalInfoFor, // (row) => { approved, voted }
  onToggleApprove = noop,
  onApprovalDetail = noop,
  // Testi DERHAL "Failed" yapar (tek yetkili yeterli, tam konsensus gerekmez).
  // Verilmezse (ornegin gereksinim sayfalarinda showApproval zaten kapali)
  // reddet butonu gosterilmez.
  onReject,
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
  // --- Agac modu (PBS / Urun Agaci, Issue #9) ------------------------------
  //  treeMode acikken satirlar duz liste degil, HIYERARSIK gorunur:
  //  - "BOLUM" sutunu DOORS tarzi anahat numarasini gosterir (1, 1.1, 3.3.2)
  //  - baslik hucresi derinlige gore girintilenir
  //  - alt kirilimi olan satirlarda ac/kapa oku cikar (lazy-load)
  //  Satirlar `_depth`, `_outline`, `_hasChildren`, `_expanded`, `_loading`
  //  alanlarini tasir (cagiran taraf hesaplar).
  // Baslik altindaki aciklama onizlemesi. PBS agacinda kapatilir: orada
  // aciklama yalnizca satirdaki "goruntule" (goz) ikonuyla acilan
  // ViewModal'da gosterilir.
  showDescription = true,
  treeMode = false,
  onToggleExpand,
  // Surukle-birak ile tasima (yalnizca treeMode'da anlamli)
  onRowDragStart,
  onRowDragEnd,
  onRowDrop,
  rowDraggable,
  rowDropAllowed,
}) {
  const { t } = useLang()
  const { attributeDefs } = useApp()
  const isSelected = (id) => Boolean(selectedIds && selectedIds.has(id))

  // Modular oznitelik sutunlari: projede tanimli her oznitelik (Priority
  // dahil — artik o da sabit degil) icin bir sutun, tanimlanan siraya gore.
  const attrDefs = entityAttrDefs(attributeDefs, attributeEntityType)

  // Sayfanin cizebilecegi TUM sutunlar (varsayilan sirayla) + gorunur olanlar.
  // Gorunum verilmisse onun sirasi/gorunurlugu gecerlidir; katalogda olmayan
  // bir anahtar (orn. silinmis oznitelik) sessizce atlanir.
  const catalog = columnCatalog({ t, columns, attrDefs, showApproval, statusLabel })
  const catalogMap = new Map(catalog.map((c) => [c.key, c]))
  const keys = (
    Array.isArray(columnKeys) && columnKeys.length
      ? columnKeys
      : visibleColumnKeys(defaultColumnLayout(catalog))
  ).filter((k) => catalogMap.has(k))
  const attrDefOf = (key) => attrDefs.find((d) => `attr:${d.key}` === key)

  // Satir bazli izin cozumleyiciler (varsayilanlar eski davranisi korur).
  const editAllowed = (r) => (canEditRow ? canEditRow(r) : true)
  const deleteAllowed = (r) => (canDeleteRow ? canDeleteRow(r) : canDelete)
  const linksAllowed = (r) => (canManageLinksRow ? canManageLinksRow(r) : canManageLinks)

  // --- Hucre cizimi ---------------------------------------------------------
  //  `ctx` satir basina BIR KEZ hesaplanan turetilmis degerleri tasir
  //  (kilit, supheli sayisi, onay bilgisi, gorunen baslik) — sutun sirasi
  //  degistiginde bu hesaplarin tekrarlanmamasi icin.
  const renderCell = (key, r, ctx) => {
    switch (key) {
      case 'code':
        return (
          <div
            className="flex items-center gap-1.5"
            style={treeMode ? { paddingLeft: (r._depth || 0) * 18 } : undefined}
          >
            {treeMode &&
              (r._hasChildren ? (
                <button
                  onClick={() => onToggleExpand && onToggleExpand(r)}
                  aria-label={r._expanded ? t('tree.collapse') : t('tree.expand')}
                  aria-expanded={Boolean(r._expanded)}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {r._loading ? (
                    <IconLoader size={13} className="animate-spin" />
                  ) : (
                    <IconChevron size={13} className={r._expanded ? 'rotate-90' : ''} />
                  )}
                </button>
              ) : (
                <span className="w-[19px]" aria-hidden="true" />
              ))}
            <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
              {r.text_id}
            </span>
            {ctx.locked && (
              <IconLock
                size={13}
                className="text-emerald-600 dark:text-emerald-400"
                title={t('tbl.locked')}
              />
            )}
            {ctx.suspectCount > 0 &&
              (onOpenSuspect ? (
                <button
                  onClick={() => onOpenSuspect(r)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                  title={t('tbl.suspectTitle', { n: ctx.suspectCount })}
                  aria-label={t('tbl.suspectTitle', { n: ctx.suspectCount })}
                >
                  <IconAlert size={12} />
                  {ctx.suspectCount}
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  title={t('tbl.suspectTitle', { n: ctx.suspectCount })}
                  aria-label={t('tbl.suspectTitle', { n: ctx.suspectCount })}
                >
                  <IconAlert size={12} />
                  {ctx.suspectCount}
                </span>
              ))}
          </div>
        )
      case 'title':
        return ctx.titleIsFallback ? (
          <div className="font-medium text-slate-800 dark:text-slate-100">{ctx.displayTitle}</div>
        ) : (
          <>
            <div className="font-semibold text-slate-800 dark:text-slate-100">
              {ctx.displayTitle}
            </div>
            {showDescription && r.description != null && (
              <div className="mt-0.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                {truncate(stripHtml(r.description), 110)}
              </div>
            )}
          </>
        )
      case 'type':
        return <TypeBadge value={r.type} />
      case 'field':
        return r.field ? (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {r.field}
          </span>
        ) : (
          dash
        )
      case 'status':
        // Issue #105 (dogrulama durumu): `verificationFor` verildiyse dort
        // ayri durum + sayac rozeti gosterilir; yoksa eski "Dogrulanamaz"
        // ayrimina (verifiedFor) duser.
        if (verificationFor) return <VerificationBadge info={verificationFor(r)} t={t} />
        return verifiedFor && !verifiedFor(r) ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
            title={t('tbl.unverifiableHint')}
          >
            {t('tbl.unverifiable')}
          </span>
        ) : r.status ? (
          <StatusBadge value={r.status} />
        ) : (
          dash
        )
      case 'links':
        return (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-bold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {linkCountFor ? linkCountFor(r.id) : 0}
          </span>
        )
      /* --- Onay (Check Circle) + Reddet (X Circle) --- */
      case 'approval':
        return (
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => ctx.canApprove && onToggleApprove(r)}
              disabled={!ctx.canApprove}
              title={
                ctx.info.approved
                  ? t('tbl.approvedTitle')
                  : ctx.info.voted
                    ? t('tbl.votedTitle')
                    : t('tbl.approveTitle')
              }
              className={`inline-flex items-center justify-center rounded-full p-0.5 transition-colors ${
                ctx.info.approved
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ctx.info.voted
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
              } ${ctx.canApprove ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
            >
              <IconCheckCircle
                size={20}
                className={ctx.info.approved || ctx.info.voted ? 'fill-current/10' : ''}
              />
            </button>
            {onReject && (
              <button
                onClick={() => ctx.canApprove && onReject(r)}
                disabled={!ctx.canApprove}
                title={t('tbl.rejectTitle')}
                className={`inline-flex items-center justify-center rounded-full p-0.5 transition-colors ${
                  r.status === 'Rejected'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400'
                } ${ctx.canApprove ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
              >
                <IconXCircle
                  size={20}
                  className={r.status === 'Rejected' ? 'fill-current/10' : ''}
                />
              </button>
            )}
          </div>
        )
      /* --- Onay Durumu --- */
      case 'approvalStatus':
        return (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                ctx.info.approved
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
              }`}
            >
              {ctx.info.approved ? t('tbl.approved') : t('tbl.pending')}
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
        )
      case 'actions':
        return (
          <div className="flex items-center justify-end gap-1">
            {onView && (
              <button
                onClick={() => onView(r)}
                className="btn-ghost !px-2 !py-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
                title={t('tbl.view')}
              >
                <IconEye size={16} />
              </button>
            )}
            {linksAllowed(r) && onManageLinks && (
              <button
                onClick={() => onManageLinks(r)}
                className="btn-ghost !px-2 !py-1.5 text-brand-600 dark:text-brand-400"
                title={t('tbl.manageLinks')}
              >
                <IconLink size={16} />
              </button>
            )}
            {onImpact && (
              <button
                onClick={() => onImpact(r)}
                className="btn-ghost !px-2 !py-1.5 text-violet-600 dark:text-violet-400"
                title={t('tbl.impact')}
              >
                <IconTarget size={16} />
              </button>
            )}
            {editAllowed(r) && onEdit && (
              <button
                onClick={() => onEdit(r)}
                className="btn-ghost !px-2 !py-1.5"
                title={t('tbl.edit')}
              >
                <IconEdit size={16} />
              </button>
            )}
            {deleteAllowed(r) && onDelete && (
              <button
                onClick={() => onDelete(r)}
                className="btn-ghost !px-2 !py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                title={t('tbl.delete')}
              >
                <IconTrash size={16} />
              </button>
            )}
          </div>
        )
      default: {
        // Modular oznitelik sutunu ('attr:<key>').
        const def = attrDefOf(key)
        if (!def) return null
        const value = (r.attributes || {})[def.key]
        return value != null && value !== '' ? <AttrBadge def={def} value={value} /> : dash
      }
    }
  }

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
              {selectable && (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-brand-600 dark:border-slate-600"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={onToggleAll}
                    title={t('bulk.selectAll')}
                  />
                </th>
              )}
              {treeMode && <th className="px-4 py-3">{t('tbl.th.section')}</th>}
              {keys.map((key) => (
                <th key={key} className={`px-4 py-3 ${ALIGN[key] || ''}`}>
                  {catalogMap.get(key).label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const locked = Boolean(r.locked)
              const suspectCount = suspectCountFor ? suspectCountFor(r) || 0 : 0
              const info = approvalInfoFor
                ? approvalInfoFor(r)
                : { approved: r.approvalStatus === 'Approved', voted: false }
              const canApprove = canApproveRow(r)
              // Baslik ARTIK ZORUNLU DEGIL — baslik bossa aciklamadan
              // turetilmis etiket KALIN + ORTALANMIS gosterilir (kullanici
              // talebi). Bu, showDescription=false olan agac gorunumunde
              // (PbsTree — "link tree view") de calisir; asagida fallback
              // durumunda showDescription kontrolunden BAGIMSIZ gosterilir.
              const { text: displayTitle, isFallback: titleIsFallback } = getDisplayLabel({
                ...r,
                title: r[titleKey],
              })
              const ctx = { locked, suspectCount, info, canApprove, displayTitle, titleIsFallback }
              return (
                <tr
                  key={r.id}
                  draggable={treeMode && rowDraggable ? rowDraggable(r) : undefined}
                  onDragStart={treeMode ? () => onRowDragStart && onRowDragStart(r) : undefined}
                  onDragEnd={treeMode ? () => onRowDragEnd && onRowDragEnd() : undefined}
                  onDragOver={
                    treeMode
                      ? (e) => {
                          // preventDefault YALNIZCA gecerli hedefte cagrilir;
                          // aksi halde tarayici birakmaya izin vermez.
                          if (rowDropAllowed && rowDropAllowed(r)) e.preventDefault()
                        }
                      : undefined
                  }
                  onDrop={
                    treeMode
                      ? (e) => {
                          e.preventDefault()
                          if (rowDropAllowed && rowDropAllowed(r)) onRowDrop && onRowDrop(r)
                        }
                      : undefined
                  }
                  className={`group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isSelected(r.id) ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''} ${locked ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''} ${suspectCount > 0 ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''} ${treeMode && rowDraggable && rowDraggable(r) ? 'cursor-grab' : ''}`}
                >
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
                  {treeMode && (
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {r._outline}
                      </span>
                    </td>
                  )}
                  {keys.map((key) => {
                    // Kod hucresi tek satirda kalir; supheli satirlarda sol
                    // kenar serittir. Baslik hucresi fallback etiketinde
                    // dikeyde ortalanir (tek satirlik icerik).
                    const extra =
                      key === 'code'
                        ? `whitespace-nowrap ${suspectCount > 0 ? 'border-l-4 border-l-amber-400' : ''}`
                        : ''
                    const valign = key === 'title' && titleIsFallback ? 'align-middle' : 'align-top'
                    return (
                      <td key={key} className={`px-4 py-3 ${ALIGN[key] || ''} ${valign} ${extra}`}>
                        {renderCell(key, r, ctx)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
