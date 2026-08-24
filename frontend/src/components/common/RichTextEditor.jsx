// ============================================================================
//  RichTextEditor.jsx  —  Bagimliliksiz, Word benzeri zengin metin editoru.
//  contentEditable + document.execCommand ile calisir. Ozellikler:
//    - Kalin / Italik / Alti cizili
//    - Yazi tipi (font family) ve boyut secimi
//    - Yazi rengi (color picker)
//    - Liste (madde/numarali)
//    - PNG (ve diger) gorsel ekleme -> dataURL olarak gomulur
//  Deger HTML string olarak tutulur; onChange(html) ile disari verilir.
//  readOnly=true iken salt-okunur onizleme gosterir.
// ============================================================================
import { useEffect, useRef } from 'react'
import { useLang } from '../../context/LanguageContext.jsx'

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma']
const SIZES = [
  { v: '1', label: '10' },
  { v: '2', label: '13' },
  { v: '3', label: '16' },
  { v: '4', label: '18' },
  { v: '5', label: '24' },
  { v: '6', label: '32' },
  { v: '7', label: '48' },
]

function Btn({ onClick, title, children, active }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-bold transition-colors ${
        active
          ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ value = '', onChange, readOnly = false, minHeight = 200 }) {
  const { t } = useLang()
  const ref = useRef(null)
  const fileRef = useRef(null)

  // Disaridan gelen degeri yalnizca farkliysa yaz (imleci bozmamak icin).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.innerHTML !== (value || '')) el.innerHTML = value || ''
  }, [value])

  const emit = () => {
    if (onChange && ref.current) onChange(ref.current.innerHTML)
  }

  const exec = (cmd, arg = null) => {
    if (readOnly) return
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }

  const onPickImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      ref.current?.focus()
      document.execCommand('insertImage', false, reader.result)
      emit()
    }
    reader.readAsDataURL(file)
  }

  if (readOnly) {
    return (
      <div
        className="rte-content prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: value || `<span class="text-slate-400">${t('rte.empty')}</span>` }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
      {/* Arac cubugu */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800/60">
        <Btn onClick={() => exec('bold')} title={t('rte.bold')}><span className="font-black">B</span></Btn>
        <Btn onClick={() => exec('italic')} title={t('rte.italic')}><span className="italic">I</span></Btn>
        <Btn onClick={() => exec('underline')} title={t('rte.underline')}><span className="underline">U</span></Btn>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <select
          title={t('rte.font')}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec('fontName', e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          defaultValue=""
        >
          <option value="" disabled>{t('rte.font')}</option>
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>

        <select
          title={t('rte.size')}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec('fontSize', e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          defaultValue=""
        >
          <option value="" disabled>{t('rte.size')}</option>
          {SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>

        <label className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" title={t('rte.color')}>
          <span className="text-sm font-bold">A</span>
          <input
            type="color"
            onChange={(e) => exec('foreColor', e.target.value)}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Btn onClick={() => exec('insertUnorderedList')} title={t('rte.ul')}>•</Btn>
        <Btn onClick={() => exec('insertOrderedList')} title={t('rte.ol')}>1.</Btn>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Btn onClick={() => fileRef.current?.click()} title={t('rte.image')}>🖼</Btn>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onPickImage} />
      </div>

      {/* Yazim alani */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        className="rte-content max-w-none px-3 py-2 text-sm text-slate-800 outline-none dark:text-slate-100"
        style={{ minHeight }}
      />
    </div>
  )
}
