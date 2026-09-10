// ============================================================================
//  AssigneePicker.jsx  —  COKLU sorumlu personel secimi (is atama).
//
//  DIKKAT: Sozlukteki "Assigned To" izlenebilirlik BAGI (terim <-> gereksinim)
//  ile ilgisi YOKTUR; burasi isin KIMDE oldugunu tutar.
//
//  Bir kayda birden fazla kisi atanabilir ve SIRA anlamlidir: listedeki
//  ilk kisi birincil sorumludur (backend `assigneeId` kolonunu bu ilk
//  elemana esitler — bkz. backend/src/assignees.js). Bu yuzden secilenler
//  numarali rozetler halinde, atama sirasiyla gosterilir; ok tusuyla sira
//  degistirilebilir.
//
//  Ekleme kutusu tek bir <select>'tir: zaten atanmis kisiler listede
//  gorunmez, boylece ayni kisi iki kez eklenemez.
// ============================================================================
import { IconClose, IconChevron } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { personnelName } from '../../utils/format.js'

export default function AssigneePicker({ personnel = [], value = [], onChange, disabled = false }) {
  const { t } = useLang()

  const byId = new Map((personnel || []).map((p) => [p.id, p]))
  // Silinmis personel id'si listede kalmis olabilir; adi cozulemeyeni
  // gostermeyiz ama sessizce de dusurmeyiz — kaydedilince backend zaten
  // gecersiz id'yi reddeder, bu yuzden gorunur bir uyari etiketi veririz.
  const selected = (value || []).map((id) => ({ id, person: byId.get(id) || null }))
  const available = (personnel || []).filter((p) => !(value || []).includes(p.id))

  const add = (id) => {
    if (!id || (value || []).includes(id)) return
    onChange([...(value || []), id])
  }
  const remove = (id) => onChange((value || []).filter((x) => x !== id))
  const moveUp = (index) => {
    if (index <= 0) return
    const next = [...value]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  return (
    <div data-testid="assignee-picker">
      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" data-testid="assignee-chips">
          {selected.map(({ id, person }, index) => (
            <li
              key={id}
              data-testid={`assignee-chip-${id}`}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-1.5 pr-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold tabular-nums text-white">
                {index + 1}
              </span>
              {person ? personnelName(person) : t('form.assigneeUnknown')}
              {!disabled && index > 0 && (
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-100"
                  title={t('form.assigneeMoveUp')}
                  aria-label={t('form.assigneeMoveUp')}
                >
                  <IconChevron size={11} className="-rotate-90" />
                </button>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                  title={t('form.assigneeRemove')}
                  aria-label={t('form.assigneeRemove')}
                  data-testid={`assignee-remove-${id}`}
                >
                  <IconClose size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <select
          className="input"
          // Kontrollu ama kalici degeri olmayan kutu: secim ANINDA listeye
          // eklenir, kutu tekrar "kisi ekle"ye doner.
          value=""
          onChange={(e) => add(e.target.value)}
          data-testid="form-assignee"
          aria-label={t('form.assignee')}
        >
          <option value="">
            {selected.length === 0 ? t('form.assigneeNone') : t('form.assigneeAdd')}
          </option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {personnelName(p)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
