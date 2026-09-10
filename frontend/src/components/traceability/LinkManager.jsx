// ============================================================================
//  LinkManager.jsx  —  Izlenebilirlik bagi kur/kopar modali (yeni taksonomi).
//  Tek bilesen, ucu birden yonetir (subject'e gore):
//
//   subjectKind = 'requirement':
//      * Satisfies, HER IKI yonden de baslatilabilir (depolama yonu sabit:
//        fromId = UST gereksinim, toId = ALT gereksinim):
//         - YUKARI: "Karsiladigi ust gereksinim" — subject ALT taraf, bir UST
//           secilir. System->User, Software/Hardware->System VEYA (System
//           atlanarak) dogrudan ->User ("skip-level", bkz. SATISFIES_ALLOWED_PARENTS).
//         - ASAGI: "Bunu karsilayan alt gereksinim ekle" — subject UST taraf,
//           onu karsilayacak mevcut bir ALT gereksinim secilir. Ayni kural
//           tersten uygulanir (orn. bir User Requirement'tan System VEYA
//           dogrudan Software/Hardware secilebilir).
//        Ikisi de ayni backend dogrulamasindan (validateLink) gecer; hangi
//        tarafin baslattigi yalnizca UI/aday listesi farkidir.
//      * Ayrica bu gereksinimi karsilayan alt gereksinimleri, dogrulayan
//        testleri ve atanan sozluk terimlerini listeler.
//   subjectKind = 'test':
//      * Verifies: test -> gereksinim (strict; test tipi hedef tipini belirler)
//        Bir test BIRDEN FAZLA gereksinimi dogrulayabilir. Test sonucu (Passed/
//        Failed/In Review) ve alan/oncelik/dal teste ELLE girilir; bag kurmak
//        bu degerleri degistirmez.
//        (depolama: fromId = gereksinim, toId = test/subject)
//   subjectKind = 'glossary':
//      * Assigned To: sozluk terimi -> gereksinim (esnek)
//        (depolama: fromId = gereksinim, toId = terim/subject)
//
//  Tum dogrulama + alan kopyalama + cascade BACKEND'de yapilir; bu bilesen
//  yalnizca dogru { fromId, toId, type, testStatus } gonderir.
// ============================================================================
import { useMemo, useState, useEffect } from 'react'
import Modal from '../common/Modal.jsx'
import ReasonModal from '../common/ReasonModal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import {
  LINK_TYPE,
  REQ_TYPE,
  SATISFIES_ALLOWED_PARENTS,
  VERIFIES_TARGET_TYPES,
} from '../../utils/constants.js'
import { IconLink, IconUnlink, IconPlus } from '../common/Icons.jsx'
import { TypeBadge, StatusBadge } from '../common/Badge.jsx'

// Bir tipin SATISFIES_ALLOWED_PARENTS'ta HANGI cocuk tiplerine ust
// olabildigi (ters bakis) — "asagi baslatma" (bunu karsilayan alt
// gereksinim ekle) secenegi icin. Modul seviyesinde bir kez hesaplanir;
// REQ_TYPE sabittir.
const CHILD_TYPES_OF = Object.fromEntries(
  Object.keys(REQ_TYPE)
    .map((k) => REQ_TYPE[k])
    .map((parentCandidate) => [
      parentCandidate,
      Object.entries(SATISFIES_ALLOWED_PARENTS)
        .filter(([, parents]) => parents.includes(parentCandidate))
        .map(([childType]) => childType),
    ]),
)

// Software + Hardware, uygulamanin her yerinde tek bir kavram olarak
// gruplanir ("Alt Sistem" / "Sub-system", bkz. REQ_PAGES['req-subsystem'] —
// ayni etiket burada da kullanilir, isimlendirme tutarli kalsin diye).
const SUBSYSTEM_TYPES = [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]
const SUBSYSTEM_LABEL = 'Sub-system Requirement'

/**
 * Aday tip listesini kademeli SECIM agacina cevirir: Software+Hardware'in
 * IKISI de listede varsa tek bir "Sub-system Requirement" grup dugumune
 * (children: Software, Hardware) indirger; diger tipler (User, System)
 * duz yaprak olarak kalir. Boylece "yukari" secenegi (orn. System veya
 * User) ile "asagi" secenegi (orn. System veya Sub-system -> Software/
 * Hardware) AYNI bilesenle, tutarli bir sekilde gosterilebilir.
 */
function buildTypeChoices(types) {
  const hasSubsystem = SUBSYSTEM_TYPES.every((t) => types.includes(t))
  const leaves = types
    .filter((t) => !hasSubsystem || !SUBSYSTEM_TYPES.includes(t))
    .map((t) => ({ key: t, label: t, type: t, children: null }))
  if (!hasSubsystem) return leaves
  return [
    ...leaves,
    {
      key: 'subsystem',
      label: SUBSYSTEM_LABEL,
      type: null,
      children: SUBSYSTEM_TYPES.map((t) => ({ key: t, label: t, type: t, children: null })),
    },
  ]
}

export default function LinkManager({ open, onClose, subject, subjectKind }) {
  const { requirements, testCases, glossary, links, link, unlink } = useApp()
  const { t } = useLang()
  // Birden fazla eszamanli baslatma secenegi olabilir (yukari + asagi);
  // her biri kendi kademeli tip secimini (top/sub) + hedef secimini + hatasini
  // tasir (anahtar = option.key). top/sub, buildTypeChoices agacinda hangi
  // dugumun secildigini tutar; tek yaprak/tek grup varsa otomatik cozulur
  // (kullaniciya anlamsiz tek secenekli bir soru sorulmaz).
  const [selections, setSelections] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  // Bag koparma oncesi zorunlu gerekce (izlenebilirlik) — bkz. ReasonModal.
  const [unlinkTarget, setUnlinkTarget] = useState(null)

  useEffect(() => {
    if (open) {
      setSelections({})
      setErrors({})
      setUnlinkTarget(null)
    }
  }, [open, subject])

  // id -> nesne haritalari
  const reqById = useMemo(
    () => Object.fromEntries(requirements.map((r) => [r.id, r])),
    [requirements],
  )
  const testById = useMemo(
    () => Object.fromEntries(testCases.map((tc) => [tc.id, tc])),
    [testCases],
  )
  const gloById = useMemo(() => Object.fromEntries(glossary.map((g) => [g.id, g])), [glossary])

  // Bu subject icin baslatilabilir bag secenek(ler)i + aday hedefler. Bir
  // gereksinim subject'i icin HEM yukari (ust sec) HEM asagi (alt sec)
  // secenegi AYNI ANDA mevcut olabilir — bu yuzden dizi doner (eskiden tekti).
  const initiationOptions = useMemo(() => {
    if (!subject) return []
    if (subjectKind === 'requirement') {
      const options = []

      // --- Yukari: subject ALT taraf, bir UST secilir (System->User,
      //     Software/Hardware->System veya ->User skip-level). ---
      const allowedParentTypes = SATISFIES_ALLOWED_PARENTS[subject.type]
      if (allowedParentTypes) {
        const alreadyParents = new Set(
          links
            .filter((l) => l.type === LINK_TYPE.SATISFIES && l.toId === subject.id)
            .map((l) => l.fromId),
        )
        const candidates = requirements.filter(
          (r) => allowedParentTypes.includes(r.type) && !alreadyParents.has(r.id),
        )
        options.push({
          key: 'satisfies-up',
          type: LINK_TYPE.SATISFIES,
          label: t('link.satisfiesUp'),
          typeChoices: buildTypeChoices(allowedParentTypes),
          candidates,
          toStore: (tid) => ({ fromId: tid, toId: subject.id, type: LINK_TYPE.SATISFIES }),
        })
      }

      // --- Asagi: subject UST taraf, onu karsilayacak mevcut bir ALT
      //     gereksinim secilir (orn. User Requirement'tan dogrudan bir
      //     System VEYA Software/Hardware secmek). ---
      const childTypes = CHILD_TYPES_OF[subject.type] || []
      if (childTypes.length > 0) {
        const alreadyChildren = new Set(
          links
            .filter((l) => l.type === LINK_TYPE.SATISFIES && l.fromId === subject.id)
            .map((l) => l.toId),
        )
        const candidates = requirements.filter(
          (r) => childTypes.includes(r.type) && !alreadyChildren.has(r.id),
        )
        options.push({
          key: 'satisfies-down',
          type: LINK_TYPE.SATISFIES,
          label: t('link.satisfiesDown'),
          typeChoices: buildTypeChoices(childTypes),
          candidates,
          toStore: (tid) => ({ fromId: subject.id, toId: tid, type: LINK_TYPE.SATISFIES }),
        })
      }

      return options
    }
    if (subjectKind === 'test') {
      const allowed = VERIFIES_TARGET_TYPES[subject.type] || []
      // Bir test BIRDEN FAZLA gereksinimi dogrulayabilir; zaten bagli olanlari
      // aday listesinden cikar.
      const alreadyReqs = new Set(
        links
          .filter((l) => l.type === LINK_TYPE.VERIFIES && l.toId === subject.id)
          .map((l) => l.fromId),
      )
      const candidates = requirements.filter(
        (r) => allowed.includes(r.type) && !alreadyReqs.has(r.id),
      )
      return [
        {
          key: 'verifies',
          type: LINK_TYPE.VERIFIES,
          label: t('link.verifies'),
          typeChoices: buildTypeChoices(allowed),
          candidates,
          toStore: (tid) => ({ fromId: tid, toId: subject.id, type: LINK_TYPE.VERIFIES }),
        },
      ]
    }
    if (subjectKind === 'glossary') {
      const alreadyReqs = new Set(
        links
          .filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.toId === subject.id)
          .map((l) => l.fromId),
      )
      const candidates = requirements.filter((r) => !alreadyReqs.has(r.id))
      return [
        {
          key: 'assigned-to',
          type: LINK_TYPE.ASSIGNED_TO,
          label: t('link.assignedTo'),
          typeChoices: buildTypeChoices([REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE]),
          candidates,
          toStore: (tid) => ({ fromId: tid, toId: subject.id, type: LINK_TYPE.ASSIGNED_TO }),
        },
      ]
    }
    return []
  }, [subject, subjectKind, requirements, links, t])

  // Mevcut baglari topla (gosterim).
  const existingSections = useMemo(() => {
    if (!subject) return []
    const secs = []
    if (subjectKind === 'requirement') {
      const satisfiesUp = links
        .filter((l) => l.type === LINK_TYPE.SATISFIES && l.toId === subject.id)
        .map((l) => ({ l, node: reqById[l.fromId] }))
        .filter((x) => x.node)
      const satisfiedByDown = links
        .filter((l) => l.type === LINK_TYPE.SATISFIES && l.fromId === subject.id)
        .map((l) => ({ l, node: reqById[l.toId] }))
        .filter((x) => x.node)
      const verifiedBy = links
        .filter((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === subject.id)
        .map((l) => ({ l, node: testById[l.toId] }))
        .filter((x) => x.node)
      const assigned = links
        .filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.fromId === subject.id)
        .map((l) => ({ l, node: gloById[l.toId] }))
        .filter((x) => x.node)
      if (SATISFIES_ALLOWED_PARENTS[subject.type])
        secs.push({ title: t('link.sec.satisfiesUp'), items: satisfiesUp, showStatus: false })
      secs.push({ title: t('link.sec.satisfiedBy'), items: satisfiedByDown, showStatus: false })
      secs.push({ title: t('link.sec.verifiedBy'), items: verifiedBy, showStatus: true })
      secs.push({ title: t('link.sec.assignedGlossary'), items: assigned, showStatus: false })
    } else if (subjectKind === 'test') {
      const verifies = links
        .filter((l) => l.type === LINK_TYPE.VERIFIES && l.toId === subject.id)
        .map((l) => ({ l, node: reqById[l.fromId] }))
        .filter((x) => x.node)
      secs.push({ title: t('link.sec.verifies'), items: verifies, showStatus: false })
    } else if (subjectKind === 'glossary') {
      const assignedTo = links
        .filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.toId === subject.id)
        .map((l) => ({ l, node: reqById[l.fromId] }))
        .filter((x) => x.node)
      secs.push({ title: t('link.sec.assignedTo'), items: assignedTo, showStatus: false })
    }
    return secs
  }, [subject, subjectKind, links, reqById, testById, gloById, t])

  if (!subject) return null

  const subjectLabel = subject.text_id
    ? `${subject.text_id} · ${subject.title || subject.term}`
    : subject.term || subject.title

  // Bir secenegin tip agacini + o anki (top/sub) secimini TEK gecerli hedef
  // TIPINE cozer. Tek yaprak/tek grup varsa kullaniciya sorulmadan otomatik
  // secilir (bkz. buildTypeChoices ustundeki not).
  const resolveOption = (option) => {
    const sel = selections[option.key] || {}
    const topChoices = option.typeChoices
    const topNode = topChoices.length === 1 ? topChoices[0] : topChoices.find((c) => c.key === sel.top) || null
    if (!topNode) return { topChoices, topNode: null, subChoices: null, subNode: null, type: null }
    if (!topNode.children) return { topChoices, topNode, subChoices: null, subNode: null, type: topNode.type }
    const subChoices = topNode.children
    const subNode = subChoices.length === 1 ? subChoices[0] : subChoices.find((c) => c.key === sel.sub) || null
    return { topChoices, topNode, subChoices, subNode, type: subNode?.type || null }
  }

  const setTop = (option, key) =>
    setSelections((prev) => ({ ...prev, [option.key]: { top: key, sub: '', target: '' } }))
  const setSub = (option, key) =>
    setSelections((prev) => ({ ...prev, [option.key]: { ...prev[option.key], sub: key, target: '' } }))
  const setTarget = (option, id) =>
    setSelections((prev) => ({ ...prev, [option.key]: { ...prev[option.key], target: id } }))

  const handleAdd = async (option) => {
    const targetId = selections[option.key]?.target
    if (!targetId) return
    setErrors((prev) => ({ ...prev, [option.key]: '' }))
    setBusy(true)
    try {
      await link(option.toStore(targetId))
      setSelections((prev) => ({ ...prev, [option.key]: { ...prev[option.key], target: '' } }))
    } catch (err) {
      setErrors((prev) => ({ ...prev, [option.key]: err.message || t('form.saveError') }))
    } finally {
      setBusy(false)
    }
  }

  const confirmUnlink = async (reason) => {
    await unlink(unlinkTarget.id, reason)
    setUnlinkTarget(null)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('link.title')}
      subtitle={subjectLabel}
      maxWidth="max-w-3xl"
      footer={
        <button onClick={onClose} className="btn-secondary">
          {t('link.close')}
        </button>
      }
    >
      <div className="space-y-6">
        {initiationOptions.map((option) => {
          const { topChoices, topNode, subChoices, type } = resolveOption(option)
          const sel = selections[option.key] || {}
          const targetCandidates = type ? option.candidates.filter((r) => r.type === type) : []
          return (
            <div
              key={option.key}
              data-testid={`link-option-${option.key}`}
              className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900/50 dark:bg-brand-950/20"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
                <IconLink size={17} /> {option.label}
              </div>
              {errors[option.key] && (
                <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {errors[option.key]}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2.5">
                {/* 1. kademe: birden fazla tip mumkunse once TIP secilir (orn.
                    System mi User mi; ya da System mi Sub-system mi). Tek
                    secenek varsa (yalnizca System vb.) bu adim atlanir. */}
                {topChoices.length > 1 && (
                  <div className="min-w-[170px]">
                    <label className="label">{t('link.selectType')}</label>
                    <select
                      data-testid="link-type-select"
                      className="input !py-1.5 text-sm"
                      value={sel.top || ''}
                      onChange={(e) => setTop(option, e.target.value)}
                    >
                      <option value="">{t('link.select')}</option>
                      {topChoices.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {/* 2. kademe: secilen (veya tek secenekli, otomatik cozulen)
                    tip "Sub-system Requirement" grubuysa, Software mu
                    Hardware mu oldugu ayrica sorulur. */}
                {topNode?.children && subChoices.length > 1 && (
                  <div className="min-w-[170px]">
                    <label className="label">{t('link.selectSubType')}</label>
                    <select
                      data-testid="link-subtype-select"
                      className="input !py-1.5 text-sm"
                      value={sel.sub || ''}
                      onChange={(e) => setSub(option, e.target.value)}
                    >
                      <option value="">{t('link.select')}</option>
                      {subChoices.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="min-w-[240px] flex-1">
                  <label className="label">{t('link.targetLabel')}</label>
                  <select
                    data-testid="link-target-select"
                    className="input !py-1.5 text-sm disabled:opacity-50"
                    value={sel.target || ''}
                    disabled={!type}
                    onChange={(e) => setTarget(option, e.target.value)}
                  >
                    <option value="">{t('link.select')}</option>
                    {targetCandidates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.text_id} — {r.title}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => handleAdd(option)}
                  disabled={busy || !sel.target}
                  className="btn-primary disabled:opacity-50"
                >
                  <IconPlus size={16} /> {t('link.linkBtn')}
                </button>
              </div>
              {type && targetCandidates.length === 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('link.noCandidates')}
                </p>
              )}
            </div>
          )
        })}

        {/* Mevcut baglar */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {existingSections.map((sec, i) => (
            <div key={i}>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {sec.title} <span className="text-slate-400">({sec.items.length})</span>
              </h4>
              {sec.items.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800/50">
                  —
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sec.items.map(({ l, node }) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                          {node.text_id}
                        </span>
                        <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                          {node.title || node.term}
                        </span>
                        {node.type && <TypeBadge value={node.type} />}
                        {sec.showStatus && node.status && <StatusBadge value={node.status} />}
                      </div>
                      <button
                        onClick={() => setUnlinkTarget(l)}
                        className="btn-ghost shrink-0 !px-2 !py-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title={t('link.unlinkTitle')}
                      >
                        <IconUnlink size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      <ReasonModal
        open={Boolean(unlinkTarget)}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={confirmUnlink}
        title={t('link.unlinkTitle')}
      />
    </Modal>
  )
}
